import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { LEVEL_BY_SLUG } from '@/lib/catalog';
import type { PaperListing } from '@/types/shop';
import { requireAdmin } from '@/utils/auth/guards';
import { toListing } from '@/lib/paperMapper';

/**
 * GET /api/papers — the shop listing.
 *
 * Only published catalog papers are returned. Facet counts come back with the
 * results so the filter rail can show how much stock sits behind each option.
 */
export async function GET(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { searchParams } = new URL(req.url);

        const level = searchParams.get('level') || '';
        const grade = searchParams.get('grade') || '';
        const subject = searchParams.get('subject') || '';
        const examType = searchParams.get('exam_type') || '';
        const term = searchParams.get('term') || '';
        const year = searchParams.get('year') || '';
        const price = searchParams.get('price') || '';
        const search = searchParams.get('search') || '';
        const sort = searchParams.get('sort') || 'newest';
        const limit = Math.min(parseInt(searchParams.get('limit') || '24'), 100);
        const offset = parseInt(searchParams.get('offset') || '0');

        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        let query: any = supabase
            .from('exams')
            .select('*', { count: 'exact' })
            .eq('source', 'catalog')
            .eq('is_published', true);

        if (level) query = query.eq('level_slug', level);
        if (grade) query = query.eq('grade_label', grade);
        if (subject) query = query.eq('subject', subject);
        if (examType) query = query.eq('exam_type', examType);
        if (term) query = query.eq('term_slug', term);
        if (year) query = query.eq('year', parseInt(year));
        if (price === 'free') query = query.eq('price_cents', 0);
        if (price === 'paid') query = query.gt('price_cents', 0);
        if (search) {
            // Commas and parentheses would otherwise terminate the `or` filter.
            const safe = search.replace(/[,()]/g, ' ');
            query = query.or(
                `title.ilike.%${safe}%,subject.ilike.%${safe}%,description.ilike.%${safe}%,institution.ilike.%${safe}%`
            );
        }

        switch (sort) {
            case 'popular':
                query = query.order('purchase_count', { ascending: false }).order('download_count', { ascending: false });
                break;
            case 'price-asc':
                query = query.order('price_cents', { ascending: true });
                break;
            case 'price-desc':
                query = query.order('price_cents', { ascending: false });
                break;
            case 'title':
                query = query.order('title', { ascending: true });
                break;
            default:
                query = query.order('year', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
        }

        query = query.range(offset, offset + limit - 1);

        const { data, error, count } = await query;
        if (error) {
            console.error('GET /api/papers failed:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Mark what the signed-in user already owns so the UI can show
        // "Download" rather than "Add to cart".
        const { data: auth } = await supabase.auth.getUser();
        let ownedIds = new Set<string>();
        if (auth?.user) {
            const { data: ents } = await supabase
                .from('entitlements')
                .select('exam_id')
                .eq('user_id', auth.user.id);
            ownedIds = new Set((ents || []).map((e) => e.exam_id as string));
        }

        const papers: PaperListing[] = (data || [])
            .map(toListing)
            .map((paper: PaperListing) => ({ ...paper, owned: ownedIds.has(paper.id) }));

        // Facets: a light second pass over the unfiltered catalog. Cheap enough
        // at catalog scale and keeps the rail honest about empty options.
        const { data: facetRows } = await supabase
            .from('exams')
            .select('level_slug, exam_type, subject')
            .eq('source', 'catalog')
            .eq('is_published', true)
            .limit(5000);

        const facets = {
            levels: {} as Record<string, number>,
            examTypes: {} as Record<string, number>,
            subjects: {} as Record<string, number>,
        };
        for (const row of facetRows || []) {
            if (row.level_slug) facets.levels[row.level_slug] = (facets.levels[row.level_slug] ?? 0) + 1;
            if (row.exam_type) facets.examTypes[row.exam_type] = (facets.examTypes[row.exam_type] ?? 0) + 1;
            if (row.subject) facets.subjects[row.subject] = (facets.subjects[row.subject] ?? 0) + 1;
        }

        return NextResponse.json({
            papers,
            total: count ?? papers.length,
            hasMore: offset + papers.length < (count ?? 0),
            facets,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        console.error('GET /api/papers error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * POST /api/papers — publish a paper into the shop.
 *
 * Listing a paper for sale is an admin action. Teachers who build a paper in the
 * setter save it privately instead (createExam, source 'user_set'), and can ask
 * an admin to publish it.
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { actor, failure } = await requireAdmin(supabase);
        if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

        const body = await req.json();
        if (!body.title || !body.subject) {
            return NextResponse.json({ error: 'A title and subject are required' }, { status: 400 });
        }

        const levelDef = body.level_slug ? LEVEL_BY_SLUG[body.level_slug] : undefined;
        const priceCents = Math.max(0, Math.round(Number(body.price_cents) || 0));

        const row = {
            title: String(body.title).slice(0, 255),
            subject: String(body.subject).slice(0, 100),
            description: body.description ?? null,
            code: body.code ?? null,
            source: 'catalog',
            slug: await uniqueSlug(supabase, body.title, body.year, body.grade_label),
            exam_type: body.exam_type ?? 'end-term',
            level_slug: levelDef?.slug ?? body.level_slug ?? null,
            grade_label: body.grade_label ?? null,
            term_slug: body.term_slug ?? null,
            year: body.year ? parseInt(body.year) : new Date().getFullYear(),
            paper_number: body.paper_number ?? null,
            curriculum_id: body.curriculum_id ?? null,
            grade_id: body.grade_id ?? null,
            subject_id: body.subject_id ?? null,
            total_marks: Number(body.total_marks) || 0,
            time_limit: body.time_limit ?? null,
            institution: body.institution ?? null,
            question_ids: body.question_ids ?? [],
            question_count: (body.question_ids ?? []).length,
            price_cents: priceCents,
            currency: body.currency ?? 'KES',
            is_published: body.is_published ?? true,
            is_public: true,
            has_marking_scheme: Boolean(body.marking_scheme_url) || Boolean(body.has_marking_scheme),
            marking_scheme_url: body.marking_scheme_url ?? null,
            marking_scheme_storage_key: body.marking_scheme_storage_key ?? null,
            pdf_url: body.pdf_url ?? null,
            pdf_storage_key: body.pdf_storage_key ?? null,
            preview_pages: Number(body.preview_pages) || 1,
            created_by: actor.id,
            published_at: new Date().toISOString(),
        };

        const { data, error } = await supabase.from('exams').insert(row).select().single();
        if (error) {
            console.error('POST /api/papers failed:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ paper: toListing(data) }, { status: 201 });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        console.error('POST /api/papers error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function uniqueSlug(supabase: any, title: string, year?: number, grade?: string): Promise<string> {
    const base = [grade, year, title]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 200);

    const { data } = await supabase.from('exams').select('slug').like('slug', `${base}%`);
    if (!data || data.length === 0) return base;
    const taken = new Set(data.map((r: { slug: string }) => r.slug));
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
}

/* eslint-enable @typescript-eslint/no-explicit-any */
