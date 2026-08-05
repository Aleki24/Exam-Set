/**
 * EXAM SETS — one sitting, many papers
 * ----------------------------------------------------------------------------
 * A set is a named school sitting: "Kabras Mock End Term 2 2025" covering a
 * dozen subjects. The row lives in `exam_sets`, and each paper points at it
 * through `exams.set_id`.
 *
 * This module is the shared vocabulary. The shop, the upload form and the
 * WhatsApp bot all name and match sets through here for the same reason
 * `services/paperSearch.ts` exists: two implementations of "which sitting is
 * this?" is how a set ends up browsable on the website and invisible in chat,
 * with nothing obviously broken in either.
 *
 * A set is not sellable. It has no price and no entitlement — buying one adds
 * its members to the cart, and each paper is owned and downloaded exactly as it
 * was before. See supabase/migrations/038_exam_sets.sql for why.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { TERMS, examTypeName } from '@/lib/catalog';

/** The identifying fields a set shares with its papers. */
export interface SetFields {
    institution?: string | null;
    exam_type?: string | null;
    term_slug?: string | null;
    year?: number | string | null;
    level_slug?: string | null;
}

/** A published set, as the shop and the bot see it. */
export interface ExamSetSummary {
    id: string;
    slug: string;
    name: string;
    institution?: string | null;
    exam_type?: string | null;
    term_slug?: string | null;
    year?: number | null;
    level_slug?: string | null;
    description?: string | null;
    /** Members visible to the caller. Counted under RLS, never stored. */
    paper_count?: number;
}

function termName(slug?: string | null): string | null {
    if (!slug) return null;
    return TERMS.find((t) => t.slug === slug)?.name ?? null;
}

/**
 * The name to offer for a new set, assembled from what the uploader already typed.
 *
 * "Kabras High School" + `mock` + `term-2` + 2025 -> "Kabras High School Mock Term 2 2025".
 *
 * A suggestion, not a rule. `exam_sets.name` is stored and edited independently,
 * because a school's own wording for its sitting beats anything assembled from
 * four dropdowns — and once papers are attached, changing the exam type must not
 * silently rename the set they belong to.
 */
export function suggestSetName(fields: SetFields): string {
    const parts = [
        fields.institution?.trim(),
        fields.exam_type ? examTypeName(fields.exam_type) : null,
        termName(fields.term_slug),
        fields.year ? String(fields.year) : null,
    ].filter(Boolean) as string[];

    return parts.join(' ').slice(0, 160);
}

/**
 * The natural key used to find an existing set for a paper being uploaded.
 *
 * Matches `idx_exam_sets_natural` in migration 038. Institution is lowercased
 * and its whitespace collapsed so "Kabras High" and "kabras  high" are the same
 * sitting — the minimum normalisation that stops a typo splitting a set in two,
 * and deliberately no more. Stripping words like "High School" or "Secondary"
 * would quietly merge two genuinely different schools, and a wrongly merged set
 * is harder to notice than a duplicated one.
 */
export function setFingerprint(fields: SetFields): string {
    const institution = (fields.institution ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
    const year = fields.year ? String(Number(fields.year) || '') : '';
    return [institution, fields.exam_type ?? '', fields.term_slug ?? '', year].join('|');
}

/** True when there is enough information to identify a sitting at all. */
export function canSuggestSet(fields: SetFields): boolean {
    return Boolean(fields.institution?.trim());
}

/** A URL key for a new set. Collisions are resolved by the caller. */
export function setSlugStem(name: string): string {
    return (
        name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 180) || 'set'
    );
}

/**
 * A short line describing the sitting, for a set header or a chat row.
 * Never repeats the school name, which is already in `name`.
 */
export function describeSet(set: ExamSetSummary): string {
    return [
        set.exam_type ? examTypeName(set.exam_type) : null,
        termName(set.term_slug),
        set.year ? String(set.year) : null,
        typeof set.paper_count === 'number'
            ? `${set.paper_count} paper${set.paper_count === 1 ? '' : 's'}`
            : null,
    ]
        .filter(Boolean)
        .join(' · ');
}

/**
 * Member counts, read from `exams` rather than stored on the set.
 *
 * The count has to come from the same table and the same policy that decides
 * which papers the caller may see, or a set header announces stock that is not
 * there: a set claiming twelve papers while listing nine has just told an
 * anonymous visitor that three unpublished drafts exist. This is why migration
 * 038 has no `paper_count` column.
 *
 * One query for every set on the page, not one per set.
 */
export async function withPaperCounts(
    supabase: any,
    sets: ExamSetSummary[]
): Promise<ExamSetSummary[]> {
    if (sets.length === 0) return sets;

    const { data, error } = await supabase
        .from('exams')
        .select('set_id')
        .eq('source', 'catalog')
        .eq('is_published', true)
        .in(
            'set_id',
            sets.map((s) => s.id)
        );

    if (error) {
        // A missing count is better than a wrong one, and better than a page
        // that fails to render because a subtitle could not be assembled.
        console.error('set counts failed:', error.message);
        return sets;
    }

    const counts = new Map<string, number>();
    for (const row of data ?? []) {
        counts.set(row.set_id, (counts.get(row.set_id) ?? 0) + 1);
    }

    return sets.map((s) => ({ ...s, paper_count: counts.get(s.id) ?? 0 }));
}

// ----------------------------------------------------------------------------
// Stocked sets, for the query parser
// ----------------------------------------------------------------------------

/*
 * Cached in module scope on the same terms as `stockedSubjects` in
 * services/paperSearch.ts: the list changes only when an admin uploads, and
 * re-reading it would put a query in front of every inbound WhatsApp message
 * for no benefit. A failed read returns the stale list rather than an empty
 * one — an empty list makes the parser silently stop recognising every school
 * name, which looks like the feature was never built.
 */
let setCache: { at: number; sets: ExamSetSummary[] } | null = null;
const SET_TTL_MS = 5 * 60 * 1000;

export async function stockedSets(supabase: any): Promise<ExamSetSummary[]> {
    if (setCache && Date.now() - setCache.at < SET_TTL_MS) return setCache.sets;

    const { data, error } = await supabase
        .from('exam_sets')
        .select('id, slug, name, institution, exam_type, term_slug, year, level_slug')
        .eq('is_published', true)
        .limit(2000);

    if (error) {
        console.error('stockedSets failed:', error.message);
        return setCache?.sets ?? [];
    }

    const sets = (data ?? []) as ExamSetSummary[];
    setCache = { at: Date.now(), sets };
    return sets;
}

/** Drops the cache. Called after a set is created so the bot sees it at once. */
export function forgetStockedSets(): void {
    setCache = null;
}
