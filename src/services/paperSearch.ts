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
    /**
     * What the artefact is — a paper, notes, a scheme of work. Distinct from
     * `examType`, which says which sitting it belongs to. See lib/resources.ts.
     */
    kind?: string;
    /**
     * Alternative spellings of one subject, for the browse hierarchy.
     *
     * `subject` is free text on older rows, so "History" and "History and
     * Government" are the same shelf to a teacher and two different strings to
     * Postgres. Passing the set keeps one subject page from showing half its
     * stock. Takes precedence over `subject` when both are given.
     */
    subjectAliases?: string[];
    term?: string;
    year?: number | string;
    /**
     * The sittings to restrict to — see lib/examSets.ts.
     *
     * A list rather than one id because the two ways of naming a sitting are
     * not equally precise. A full set name ("Kabras Mock End Term 2 2025")
     * identifies one; a school name on its own ("Kabras") legitimately means
     * every sitting that school has published, and answering it with only the
     * most recent would be a guess dressed up as a filter.
     */
    setIds?: string[];
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
    if (filters.subjectAliases?.length) {
        // Quoted because learning-area names contain spaces, and an unquoted
        // value would end the `in` list at the first one.
        const list = filters.subjectAliases.map((name) => `"${name.replace(/"/g, '')}"`).join(',');
        query = query.or(`subject.in.(${list})`);
    } else if (filters.subject) {
        query = query.eq('subject', filters.subject);
    }
    if (filters.examType) query = query.eq('exam_type', filters.examType);
    if (filters.kind) query = query.eq('resource_kind', filters.kind);
    if (filters.term) query = query.eq('term_slug', filters.term);
    if (filters.year) query = query.eq('year', Number(filters.year));
    if (filters.setIds?.length) query = query.in('set_id', filters.setIds);
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
        .select('id, slug, title, subject, grade_label, level_slug, exam_type, term_slug, year, paper_number, total_marks, question_count, price_cents, currency, has_marking_scheme, time_limit, institution, set_id, exam_sets (id, name, slug), question_ids, pdf_storage_key, pdf_url, marking_scheme_storage_key, marking_scheme_url')
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
 *
 * `setIds` is never dropped either, for the same reason and more sharply.
 * Somebody who asked for the Kabras mock named a school out loud; relaxing that
 * hands them a different school's paper while the reply still says it found
 * what they asked for.
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
