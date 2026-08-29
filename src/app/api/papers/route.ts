import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { marksLookWrong } from '@/services/examShape';
import { LEVEL_BY_SLUG } from '@/lib/catalog';
import type { PaperListing } from '@/types/shop';
import { requireAdmin } from '@/utils/auth/guards';
import { toListing } from '@/lib/paperMapper';
import {
    applyPaperFilters,
    interpretSearch,
    relaxFilters,
    type CatalogFilters,
    type SearchInterpretation,
} from '@/services/paperSearch';

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
        const kind = searchParams.get('kind') || '';
        // Repeatable, so the browse hierarchy can ask for one subject under all
        // the names it has ever been stored under.
        const subjectAliases = searchParams.getAll('subject_alias').filter(Boolean);
        const term = searchParams.get('term') || '';
        const year = searchParams.get('year') || '';
        // A sitting, named by slug in the URL because that is what the set page
        // and the filter chip both carry. Resolved to an id here so the shared
        // filter builder stays keyed on `exams.set_id`.
        const setSlug = searchParams.get('set') || '';
        const price = searchParams.get('price') || '';
        const search = searchParams.get('search') || '';
        const sort = searchParams.get('sort') || 'newest';
        const limit = Math.min(parseInt(searchParams.get('limit') || '24'), 100);
        const offset = parseInt(searchParams.get('offset') || '0');

        let setIds: string[] | undefined;
        if (setSlug) {
            const { data: setRow } = await supabase
                .from('exam_sets')
                .select('id')
                .eq('slug', setSlug)
                .maybeSingle();
            // An unknown slug filters to nothing rather than being ignored. A
            // typo that quietly returns the whole catalog is a filter that lies.
            setIds = [setRow?.id ?? '00000000-0000-0000-0000-000000000000'];
        }

        let filters: CatalogFilters = {
            level, grade, subject, subjectAliases, examType, kind, term, year, setIds, price, search,
        };

        /*
         * Read the search box as a request, not as a substring.
         *
         * "form 4 mathematics term 3" used to become `title ILIKE '%form 4
         * mathematics term 3%'` and match nothing, because no title is written
         * that way — the most natural thing anybody can type was the one thing
         * the shop could not answer. It now becomes the three filters it plainly
         * describes, using the parser the WhatsApp bot has always used.
         *
         * `raw=1` turns it off. Somebody hunting a literal phrase, or correcting
         * a reading they disagree with, needs a way back to plain text search,
         * and the response says what was understood so the page can offer it.
         */
        let understood: SearchInterpretation | null = null;
        if (searchParams.get('raw') !== '1') {
            const read = await interpretSearch(supabase, filters);
            filters = read.filters;
            understood = read.understood;
        }

        const run = async (active: CatalogFilters) => {
            /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
            let query: any = supabase
                .from('exams')
                .select('*, exam_sets (id, name, slug)', { count: 'exact' })
                .eq('source', 'catalog')
                .eq('is_published', true);

            // Shared with the WhatsApp bot, so the shop and the chat cannot end
            // up disagreeing about which papers match a request.
            query = applyPaperFilters(query, active);

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

            return query.range(offset, offset + limit - 1);
        };

        let { data, error, count } = await run(filters);

        /*
         * Nothing matched what the sentence asked for, so ask for less.
         *
         * Only ever gives up filters the sentence itself supplied, and only on
         * the first page — widening mid-scroll would shuffle the results under
         * somebody's thumb. The response names every filter dropped, because a
         * search that quietly answers a different question is worse than one
         * that finds nothing.
         */
        const guessed = (understood?.applied ?? []).map((a) => a.key);
        while (understood && !error && (count ?? 0) === 0 && offset === 0) {
            const step = relaxFilters(filters, guessed);
            if (!step) break;

            filters = step.filters;
            understood.relaxed.push(step.dropped);
            ({ data, error, count } = await run(filters));
        }

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
            .select('level_slug, exam_type, subject, resource_kind, exam_sets (name, slug)')
            .eq('source', 'catalog')
            .eq('is_published', true)
            .limit(5000);

        const facets = {
            levels: {} as Record<string, number>,
            examTypes: {} as Record<string, number>,
            subjects: {} as Record<string, number>,
            // What each thing *is* — past paper, scheme of work, lesson plan.
            // The `kind` filter has always worked; only the count was missing,
            // which is why nothing could show "how many schemes of work exist"
            // without inventing the number.
            kinds: {} as Record<string, number>,
            // Keyed by slug and carrying the name, because the rail shows the
            // set's own wording and filters by its slug.
            sets: {} as Record<string, { name: string; count: number }>,
        };
        for (const row of facetRows || []) {
            if (row.level_slug) facets.levels[row.level_slug] = (facets.levels[row.level_slug] ?? 0) + 1;
            if (row.exam_type) facets.examTypes[row.exam_type] = (facets.examTypes[row.exam_type] ?? 0) + 1;
            if (row.subject) facets.subjects[row.subject] = (facets.subjects[row.subject] ?? 0) + 1;
            if (row.resource_kind) facets.kinds[row.resource_kind] = (facets.kinds[row.resource_kind] ?? 0) + 1;

            /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
            const set = (row as any).exam_sets;
            if (set?.slug) {
                const seen = facets.sets[set.slug];
                facets.sets[set.slug] = { name: set.name, count: (seen?.count ?? 0) + 1 };
            }
        }

        return NextResponse.json({
            papers,
            total: count ?? papers.length,
            hasMore: offset + papers.length < (count ?? 0),
            facets,
            ...(understood ? { understood } : {}),
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

        /*
         * A question whose figure IS the question cannot be sold without it.
         *
         * "Measure angle BAC in the figure below" prints as a complete sentence
         * and an empty space. Nothing downstream can detect that — the renderer
         * sees text and marks and lays them out correctly — so the only place
         * to catch it is here, at the moment the paper becomes something
         * somebody can pay for. A buyer discovering it is a refund and a
         * reputation, both of which cost more than this query.
         *
         * The check is `image_required AND image_path IS NULL`, which is
         * exactly the partial index added in migration 043.
         */
        const questionIds: string[] = Array.isArray(body.question_ids) ? body.question_ids : [];
        if (questionIds.length > 0) {
            const { data: missing, error: figureError } = await supabase
                .from('questions')
                .select('id, text')
                .in('id', questionIds)
                .eq('image_required', true)
                .is('image_path', null);

            if (figureError) {
                return NextResponse.json({ error: figureError.message }, { status: 500 });
            }

            if (missing && missing.length > 0) {
                return NextResponse.json(
                    {
                        error:
                            `${missing.length} of these questions need a diagram that has not been ` +
                            'attached, so they would print unanswerable. Add the figures in the ' +
                            'review queue, or take those questions out.',
                        blocked: missing.map((q) => ({ id: q.id, text: String(q.text).slice(0, 120) })),
                    },
                    { status: 422 }
                );
            }
        }

        const levelDef = body.level_slug ? LEVEL_BY_SLUG[body.level_slug] : undefined;
        const priceCents = Math.max(0, Math.round(Number(body.price_cents) || 0));

        /*
         * A total that does not fit the kind of paper this claims to be.
         *
         * Advisory, and returned alongside the created paper rather than
         * refusing it — a teacher setting a ninety-mark CAT has a reason and
         * this does not get to overrule them. But the commonest cause is the
         * exam type left on its default while the questions were chosen for
         * something else, and a paper mislabelled in the shop is discovered by
         * a buyer after they have paid.
         */
        const marksNotice = marksLookWrong(body.exam_type ?? 'end-term', Number(body.total_marks) || 0);

        const row = {
            title: String(body.title).slice(0, 255),
            subject: String(body.subject).slice(0, 100),
            description: body.description ?? null,
            instructions: body.instructions ?? null,
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
            set_id: body.set_id ?? null,
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

        return NextResponse.json(
            { paper: toListing(data), ...(marksNotice ? { notice: marksNotice } : {}) },
            { status: 201 }
        );
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
