import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireAdmin } from '@/utils/auth/guards';
import { signedDownloadUrl, storageUnavailableReason } from '@/utils/storage';
import { extractPdfPageImages, extractPdfText, extractWordText } from '@/services/documentText';
import { aiJson, aiAvailable, type AiContent } from '@/services/claude';
import { EXAM_TYPES, LEVELS, TERMS } from '@/lib/catalog';
import { RESOURCE_KINDS } from '@/lib/resources';
import { hasReadableText, pairSchemes, sensibleYear, type Classified } from '@/lib/bulkClassify';
import { formatFromKey } from '@/lib/uploadFormats';

/**
 * POST /api/papers/bulk/classify — read a stack of uploaded papers and say what
 * each one is.
 *
 * The shop had two items in it, and the reason was not the shop. Listing a
 * paper meant filling ten fields by hand in `/papers/new`, one paper at a time,
 * so stocking a hundred was several hours of typing that nobody was ever going
 * to do. Every fact those fields ask for is already printed on the first page of
 * the paper. This reads it.
 *
 * Files are already in the bucket when this runs — the browser signs and uploads
 * first, exactly as the single-paper flow does — so nothing large crosses this
 * route and Vercel's body limit never comes into it. The keys are all it takes.
 *
 * The reply is a *proposal*, never a commitment. Nothing is written to `exams`
 * here; an admin reviews the grid and confirms, and it is that confirmation
 * which calls the existing upload route. A model that misreads "Grade 8" as
 * "Grade 9" should cost one dropdown correction, not a mispriced listing in a
 * live shop.
 */

/** Concurrency. Enough to make a stack of fifty quick, few enough to stay under rate limits. */
const BATCH = 4;

/** First-page text is where the metadata lives; more only costs tokens. */
const TEXT_BUDGET = 4000;

const schema = {
    type: 'object',
    additionalProperties: false,
    required: [
        'title', 'subject', 'level_slug', 'grade_label', 'exam_type', 'resource_kind',
        'term_slug', 'year', 'paper_number', 'total_marks', 'time_limit', 'institution',
        'is_marking_scheme', 'confidence',
    ],
    properties: {
        title: { type: 'string' },
        subject: { type: 'string' },
        level_slug: { type: ['string', 'null'], enum: [...LEVELS.map((l) => l.slug), null] },
        grade_label: { type: ['string', 'null'] },
        exam_type: { type: ['string', 'null'], enum: [...EXAM_TYPES.map((e) => e.slug), null] },
        resource_kind: { type: 'string', enum: RESOURCE_KINDS.map((k) => k.slug) },
        term_slug: { type: ['string', 'null'], enum: [...TERMS.map((t) => t.slug), null] },
        year: { type: ['integer', 'null'] },
        paper_number: { type: ['string', 'null'] },
        total_marks: { type: ['integer', 'null'] },
        time_limit: { type: ['string', 'null'] },
        institution: { type: ['string', 'null'] },
        is_marking_scheme: { type: 'boolean' },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    },
} as const;

const SYSTEM = `You read the first page of a Kenyan school document and report what it is.

You are cataloguing stock for a resource shop, so every field is a fact to be
found on the page, not a guess to be made about it. When the page does not say,
return null. A null costs one dropdown; a confident wrong answer gets a
mislabelled paper sold to a teacher.

Kenyan curriculum context:
- CBC/CBE runs Playgroup, PP1-PP2, Grade 1-9, then Senior School Grade 10-12.
- The legacy 8-4-4 system runs Form 1-4 and ends at KCSE.
- "Learning area" means subject. "Strand" means topic.
- Marks are usually printed per question in the right margin and totalled on the
  cover as "TOTAL MARKS" or in the examiner's table.
- A marking scheme is titled "MARKING SCHEME", "ANSWERS" or "MARKING GUIDE", or
  is plainly a list of answers rather than questions. Set is_marking_scheme for
  those, and title it after the paper it marks.

resource_kind is what the artefact IS, which is not the same as which sitting it
came from. A scheme of work, a lesson plan and a record of work are teaching
documents and are never exam papers, whatever their cover says about a term.

confidence: "high" when the cover states things outright; "medium" when you are
reading it off the body; "low" when the text is sparse, scanned badly, or you are
inferring more than reading.`;

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { failure } = await requireAdmin(supabase);
        if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

        const unavailable = storageUnavailableReason();
        if (unavailable) return NextResponse.json({ error: unavailable }, { status: 503 });

        if (!aiAvailable()) {
            return NextResponse.json(
                {
                    error:
                        'AI is not configured on this deployment, so uploads cannot be read automatically. ' +
                        'Set ANTHROPIC_API_KEY, or list papers one at a time in /papers/new.',
                },
                { status: 503 }
            );
        }

        const body = await req.json();
        const files: { key: string; filename: string }[] = Array.isArray(body?.files) ? body.files : [];
        if (files.length === 0) return NextResponse.json({ error: 'Nothing to classify' }, { status: 400 });
        if (files.length > 60) {
            return NextResponse.json({ error: 'Sixty files at a time, please' }, { status: 400 });
        }

        const results: Classified[] = [];
        for (let i = 0; i < files.length; i += BATCH) {
            const slice = files.slice(i, i + BATCH);
            results.push(...(await Promise.all(slice.map(classifyOne))));
        }

        return NextResponse.json({ classifications: pairSchemes(results) });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not read the uploads';
        console.error('POST /api/papers/bulk/classify error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

async function classifyOne(file: { key: string; filename: string }): Promise<Classified> {
    const base: Classified = { key: file.key, filename: file.filename, ok: false };

    // The key's extension is the record of what the file is — see
    // `lib/uploadFormats`. A Word document read as a PDF extracts to nothing and
    // would be reported as an unreadable scan.
    const format = formatFromKey(file.key);

    let text: string;
    let buffer: Buffer;
    try {
        // Read it back out of the bucket rather than adding a backend-specific
        // getter: `signedDownloadUrl` already works for both Supabase and R2.
        const url = await signedDownloadUrl(file.key, 300);
        const res = await fetch(url);
        if (!res.ok) return { ...base, error: `Could not read the file back (${res.status})` };
        buffer = Buffer.from(await res.arrayBuffer());
        text = format.format === 'pdf' ? await extractPdfText(buffer) : await extractWordText(buffer);
    } catch (err) {
        /*
         * `mammoth` reads .docx and only .docx — a legacy .doc is a different
         * format wearing a similar name, and it throws rather than returning
         * nothing. That is still a file worth selling, so the row survives with
         * a message that says what to do about it instead of failing the batch.
         */
        const reason =
            format.format === 'doc'
                ? 'A legacy .doc cannot be read automatically — fill this row in by hand, or save it as .docx.'
                : err instanceof Error
                  ? err.message
                  : `Could not read the ${format.label}`;
        return { ...base, error: reason };
    }

    const trimmed = text.replace(/\s+\n/g, '\n').trim().slice(0, TEXT_BUDGET);

    /*
     * No text layer means a scan, and a scan is not an unreadable file — it is
     * a photograph of a perfectly readable one. Most Kenyan past papers arrive
     * this way, so falling back to the cover image is the common path rather
     * than the exceptional one.
     *
     * Only the first page is sent: everything this asks for is printed on the
     * cover, and a stack of fifty papers should not cost fifty full documents.
     */
    let content: string | AiContent[];
    if (hasReadableText(trimmed)) {
        content = `Filename: ${file.filename}\n\n--- FIRST PAGES ---\n${trimmed}`;
    } else {
        let cover;
        try {
            // Only a PDF can be a scan. A Word document with no text in it is
            // empty, not photographed, and there is no cover to fall back to.
            if (format.format === 'pdf') [cover] = await extractPdfPageImages(buffer, 1);
        } catch {
            cover = undefined;
        }
        if (!cover) {
            return {
                ...base,
                error: 'No readable text and no readable cover image. Fill this row in by hand.',
            };
        }
        content = [
            { type: 'text', text: `Filename: ${file.filename}\n\nThis is the cover of a scanned paper. Read it.` },
            { type: 'image', source: { type: 'base64', media_type: cover.mediaType, data: cover.data.toString('base64') } },
        ];
    }

    const result = await aiJson<Omit<Classified, 'key' | 'filename' | 'ok'>>({
        system: SYSTEM,
        content,
        schema: schema as unknown as Record<string, unknown>,
        maxTokens: 700,
        effort: 'low',
        timeoutMs: 45_000,
    });

    if (!result.ok) return { ...base, error: result.failure.message };

    const d = result.value;

    return {
        ...base,
        ok: true,
        ...d,
        year: sensibleYear(d.year),
        title: (d.title || file.filename.replace(/\.[a-z0-9]+$/i, '')).slice(0, 255),
    };
}
