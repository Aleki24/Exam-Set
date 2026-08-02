/**
 * CATALOG SEARCH
 * ----------------------------------------------------------------------------
 * One place that turns catalog filters into a query against `exams`.
 *
 * Shared by the shop (`/api/papers`) and the WhatsApp bot so the two cannot
 * disagree about what "Form 4 Mathematics, Term 3" means. Two implementations
 * of the same search is how a paper ends up findable on the website and
 * invisible in chat, with nothing obviously broken in either.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface CatalogFilters {
    level?: string;
    grade?: string;
    subject?: string;
    examType?: string;
    term?: string;
    year?: number | string;
    /** 'free' | 'paid' */
    price?: string;
    /** Free-text fallback across title, subject, description and institution. */
    search?: string;
}

/**
 * Applies the filters to an existing Supabase query builder.
 *
 * Takes the builder rather than creating one so callers keep control of what
 * they select, how they sort and whether they want a count.
 */
export function applyPaperFilters(query: any, filters: CatalogFilters): any {
    if (filters.level) query = query.eq('level_slug', filters.level);
    if (filters.grade) query = query.eq('grade_label', filters.grade);
    if (filters.subject) query = query.eq('subject', filters.subject);
    if (filters.examType) query = query.eq('exam_type', filters.examType);
    if (filters.term) query = query.eq('term_slug', filters.term);
    if (filters.year) query = query.eq('year', Number(filters.year));
    if (filters.price === 'free') query = query.eq('price_cents', 0);
    if (filters.price === 'paid') query = query.gt('price_cents', 0);

    if (filters.search) {
        // Commas and parentheses terminate a PostgREST `or` filter, so a search
        // containing either would otherwise change the shape of the query
        // rather than just its terms.
        const safe = filters.search.replace(/[,()]/g, ' ').trim();
        if (safe) {
            query = query.or(
                `title.ilike.%${safe}%,subject.ilike.%${safe}%,description.ilike.%${safe}%,institution.ilike.%${safe}%`
            );
        }
    }

    return query;
}

/**
 * Published catalog papers matching the filters, newest first.
 *
 * Used by the bot, which has no user session and reads through the service role.
 * The `source`/`is_published` pair is what keeps drafts and teachers' private
 * sets out of the shop, and it is applied here rather than left to the caller.
 */
export async function findPapers(
    supabase: any,
    filters: CatalogFilters,
    limit = 10
): Promise<any[]> {
    let query = supabase
        .from('exams')
        .select('id, slug, title, subject, grade_label, level_slug, exam_type, term_slug, year, total_marks, question_count, price_cents, currency, has_marking_scheme, time_limit, institution, question_ids, pdf_storage_key, pdf_url, marking_scheme_storage_key, marking_scheme_url')
        .eq('source', 'catalog')
        .eq('is_published', true);

    query = applyPaperFilters(query, filters);

    const { data, error } = await query
        .order('year', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) throw new Error(error.message);
    return data ?? [];
}

/**
 * Progressively drops the least important filter until something matches.
 *
 * Somebody asking for "Form 4 Maths Term 3 2025" wants a paper, not a lecture
 * about which of their five constraints was unsatisfiable. Year goes first
 * because last year's paper is still useful, then term, then the exam type;
 * grade and subject are never dropped, because a Form 4 Maths request answered
 * with a Grade 3 English paper is worse than no answer at all.
 */
export async function findPapersRelaxing(
    supabase: any,
    filters: CatalogFilters,
    limit = 10
): Promise<{ papers: any[]; relaxed: string[] }> {
    const relaxed: string[] = [];
    const working: CatalogFilters = { ...filters };

    let papers = await findPapers(supabase, working, limit);
    if (papers.length > 0) return { papers, relaxed };

    for (const [key, label] of [
        ['year', 'year'],
        ['term', 'term'],
        ['examType', 'exam type'],
    ] as const) {
        if (working[key] === undefined) continue;

        delete working[key];
        relaxed.push(label);

        papers = await findPapers(supabase, working, limit);
        if (papers.length > 0) return { papers, relaxed };
    }

    return { papers: [], relaxed };
}

/**
 * Distinct subjects currently stocked, for the query parser to match against.
 *
 * Cached in module scope: the list changes only when an admin uploads a paper,
 * and re-reading it on every inbound message would put a query in front of every
 * reply for no benefit.
 */
let subjectCache: { at: number; subjects: string[] } | null = null;
const SUBJECT_TTL_MS = 5 * 60 * 1000;

export async function stockedSubjects(supabase: any): Promise<string[]> {
    if (subjectCache && Date.now() - subjectCache.at < SUBJECT_TTL_MS) {
        return subjectCache.subjects;
    }

    const { data, error } = await supabase
        .from('exams')
        .select('subject')
        .eq('source', 'catalog')
        .eq('is_published', true)
        .limit(5000);

    if (error) {
        console.error('stockedSubjects failed:', error.message);
        return subjectCache?.subjects ?? [];
    }

    const subjects = [...new Set((data ?? []).map((r: any) => r.subject).filter(Boolean))] as string[];
    subjectCache = { at: Date.now(), subjects };
    return subjects;
}
