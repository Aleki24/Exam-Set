import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { putObject, storageUnavailableReason } from '@/utils/storage';
import { EXAM_TYPE_BY_SLUG, LEVEL_BY_SLUG } from '@/lib/catalog';
import { toListing } from '@/lib/paperMapper';
import { requireAdmin } from '@/utils/auth/guards';

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
