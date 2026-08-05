import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { putObject, storageUnavailableReason } from '@/utils/storage';
import { EXAM_TYPE_BY_SLUG, LEVEL_BY_SLUG } from '@/lib/catalog';
import { toListing } from '@/lib/paperMapper';
import { requireAdmin } from '@/utils/auth/guards';
import {
    forgetStockedSets,
    setFingerprint,
    setSlugStem,
    suggestSetName,
    type SetFields,
} from '@/lib/examSets';

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB — comfortably more than any paper
const ALLOWED = new Set(['application/pdf']);

/**
 * POST /api/papers/upload — stock the shop with an existing paper.
 *
 * Multipart: `paper` (PDF, required), `scheme` (PDF, optional) and a `meta`
 * JSON blob. This is how past papers, county mocks and school exams get in;
 * papers assembled from the question bank go through POST /api/papers instead.
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();

        // Stocking the shop is an admin action. Teachers set their own exams in
        // /set instead, which needs no special role.
        const { actor, failure } = await requireAdmin(supabase);
        if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

        const unavailable = storageUnavailableReason();
        if (unavailable) {
            return NextResponse.json({ error: unavailable }, { status: 503 });
        }

        const form = await req.formData();
        const paperFile = form.get('paper') as File | null;
        const schemeFile = form.get('scheme') as File | null;
        const metaRaw = form.get('meta');

        if (!paperFile) {
            return NextResponse.json({ error: 'Attach the question paper PDF' }, { status: 400 });
        }
        if (!metaRaw || typeof metaRaw !== 'string') {
            return NextResponse.json({ error: 'Missing paper details' }, { status: 400 });
        }

        const meta = JSON.parse(metaRaw);
        if (!meta.title || !meta.subject) {
            return NextResponse.json({ error: 'A title and subject are required' }, { status: 400 });
        }

        for (const [label, file] of [
            ['question paper', paperFile],
            ['marking scheme', schemeFile],
        ] as const) {
            if (!file) continue;
            if (!ALLOWED.has(file.type)) {
                return NextResponse.json({ error: `The ${label} must be a PDF` }, { status: 400 });
            }
            if (file.size > MAX_BYTES) {
                return NextResponse.json(
                    { error: `The ${label} is larger than 25 MB — please compress it` },
                    { status: 400 }
                );
            }
        }

        // Keys are namespaced by uploader so one seller can never overwrite
        // another's file by uploading a same-named paper.
        const stem = slugify(`${meta.grade_label || ''} ${meta.year || ''} ${meta.title}`) || 'paper';
        const base = `papers/${actor.id}/${Date.now()}-${stem}`;

        const paperUpload = await putObject(
            `${base}.pdf`,
            Buffer.from(await paperFile.arrayBuffer()),
            'application/pdf'
        );

        let schemeKey: string | null = null;
        if (schemeFile && schemeFile.size > 0) {
            const schemeUpload = await putObject(
                `${base}-marking-scheme.pdf`,
                Buffer.from(await schemeFile.arrayBuffer()),
                'application/pdf'
            );
            schemeKey = schemeUpload.key;
        }

        const examType = EXAM_TYPE_BY_SLUG[meta.exam_type]?.slug ?? 'past-paper';
        const level = LEVEL_BY_SLUG[meta.level_slug]?.slug ?? null;

        // The sitting this paper belongs to. Resolved before the insert so a
        // paper is never written ungrouped and then patched: a set that half
        // exists is how the second subject of a sitting ends up in a set of one.
        const setId = await resolveSetId(supabase, actor.id, meta, {
            institution: meta.institution || null,
            exam_type: examType,
            term_slug: meta.term_slug || null,
            year: meta.year ? Number(meta.year) : new Date().getFullYear(),
            level_slug: level,
        });

        const row = {
            title: String(meta.title).slice(0, 255),
            subject: String(meta.subject).slice(0, 100),
            description: meta.description || null,
            source: 'catalog',
            slug: await uniqueSlug(supabase, stem),
            exam_type: examType,
            level_slug: level,
            grade_label: meta.grade_label || null,
            term_slug: meta.term_slug || null,
            year: meta.year ? Number(meta.year) : new Date().getFullYear(),
            paper_number: meta.paper_number || null,
            total_marks: Number(meta.total_marks) || 0,
            question_count: Number(meta.question_count) || 0,
            time_limit: meta.time_limit || null,
            institution: meta.institution || null,
            set_id: setId,
            price_cents: Math.max(0, Math.round(Number(meta.price_cents) || 0)),
            currency: 'KES',
            is_published: meta.is_published !== false,
            is_public: true,
            question_ids: [],
            // Storage keys only. Download URLs are signed per request by
            // /api/papers/[id]/download, so a paid PDF never has a public link.
            pdf_storage_key: paperUpload.key,
            marking_scheme_storage_key: schemeKey,
            has_marking_scheme: Boolean(schemeKey),
            preview_pages: Number(meta.preview_pages) || 1,
            created_by: actor.id,
            published_at: new Date().toISOString(),
        };

        const { data, error } = await supabase.from('exams').insert(row).select().single();
        if (error) {
            console.error('paper upload insert failed:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ paper: toListing(data) }, { status: 201 });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        console.error('POST /api/papers/upload error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

function slugify(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 120);
}

/**
 * The set this upload belongs to: the one the uploader picked, the one that
 * already matches, a new one, or none.
 *
 * Three inputs, in precedence order, because they mean different things:
 *
 *   meta.set_id      the uploader chose an existing set from the list. An
 *                    explicit choice, so it is honoured without re-deriving it
 *                    — a school might run two sittings that fingerprint alike.
 *   meta.new_set     the uploader asked for a new set, and may have edited the
 *                    suggested name. Still checked against the fingerprint
 *                    first, so twelve subjects uploaded one after another join
 *                    one set rather than making twelve.
 *   neither          ungrouped. The default, and it stays the default: a paper
 *                    with a school name is not automatically a sitting, because
 *                    inventing sets nobody asked for fills the shop with sets
 *                    of one.
 *
 * A failure here never fails the upload. The paper is the thing being stocked;
 * losing its grouping is a nuisance an admin can fix with a PATCH, while losing
 * the upload means re-uploading a 20 MB PDF over a Kenyan mobile connection.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
async function resolveSetId(
    supabase: any,
    actorId: string,
    meta: any,
    fields: SetFields
): Promise<string | null> {
    try {
        if (meta.set_id) {
            const { data } = await supabase
                .from('exam_sets')
                .select('id')
                .eq('id', meta.set_id)
                .maybeSingle();
            if (data) return data.id;
        }

        if (!meta.new_set || !fields.institution) return null;

        const wanted = setFingerprint(fields);
        const { data: candidates } = await supabase
            .from('exam_sets')
            .select('id, institution, exam_type, term_slug, year')
            .ilike('institution', fields.institution);

        const match = (candidates ?? []).find((row: any) => setFingerprint(row) === wanted);
        if (match) return match.id;

        const name = (
            typeof meta.new_set === 'string' && meta.new_set.trim()
                ? meta.new_set.trim()
                : suggestSetName(fields)
        ).slice(0, 160);

        const stem = setSlugStem(name);
        const { data: taken } = await supabase.from('exam_sets').select('slug').like('slug', `${stem}%`);
        const used = new Set((taken ?? []).map((r: { slug: string }) => r.slug));
        let slug = stem;
        for (let n = 2; used.has(slug); n++) slug = `${stem}-${n}`;

        const { data: created, error } = await supabase
            .from('exam_sets')
            .insert({ ...fields, name, slug, created_by: actorId })
            .select('id')
            .single();

        if (error) {
            console.error('set create during upload failed:', error.message);
            return null;
        }

        // So the WhatsApp parser can match the new set's name on the very next
        // message rather than after the cache expires.
        forgetStockedSets();
        return created.id;
    } catch (err) {
        console.error('resolveSetId failed:', err instanceof Error ? err.message : err);
        return null;
    }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
async function uniqueSlug(supabase: any, base: string): Promise<string> {
    const stem = base || 'paper';
    const { data } = await supabase.from('exams').select('slug').like('slug', `${stem}%`);
    const taken = new Set((data || []).map((r: { slug: string }) => r.slug));
    if (!taken.has(stem)) return stem;
    let n = 2;
    while (taken.has(`${stem}-${n}`)) n++;
    return `${stem}-${n}`;
}
