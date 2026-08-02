/**
 * DISCOVERY
 * ----------------------------------------------------------------------------
 * The shelves that are not a filter: what is popular, what is new, what is
 * relevant to the exam that is actually coming, and what sits beside the thing
 * you are looking at.
 *
 * ONE RULE THROUGHOUT: NEVER RECOMMEND AN EMPTY SHELF
 *
 * Every function here can return fewer items than asked for, including none,
 * and every caller must render nothing rather than a heading over a gap. A
 * catalogue with one paper in it — which is where this product currently is —
 * would otherwise show four identical rows of the same paper under four
 * confident headings, and look broken in a way an empty page never does.
 *
 * All reads are of published catalog stock, which row level security already
 * makes public. Nothing here needs a session, and nothing here should acquire
 * one: these shelves are what a signed-out visitor sees first.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { PaperListing } from '@/types/shop';
import { toListing } from '@/lib/paperMapper';

/** Columns every shelf needs. Kept in one place so the shelves cannot diverge. */
const LISTING_COLUMNS =
    'id, slug, title, description, subject, grade_label, level_slug, exam_type, resource_kind, ' +
    'term_slug, year, total_marks, question_count, time_limit, institution, price_cents, ' +
    'currency, is_published, is_featured, has_marking_scheme, preview_pages, download_count, ' +
    'purchase_count, source, created_by, created_at, published_at';

function publishedCatalog(supabase: any) {
    return supabase
        .from('exams')
        .select(LISTING_COLUMNS)
        .eq('source', 'catalog')
        .eq('is_published', true);
}

export interface Shelf {
    /** Stable id, used as a React key and in analytics later. */
    id: string;
    heading: string;
    /** One line explaining why these, not what these are. */
    reason: string;
    items: PaperListing[];
    /** Where "see all" goes, when there is a filter that expresses this shelf. */
    href?: string;
}

/**
 * Most downloaded in the last week.
 *
 * `download_count` is a lifetime total, so "this week" cannot be answered from
 * it honestly. Rather than label a lifetime ranking as weekly — which is the
 * easy lie, and the kind a user eventually notices — this returns the most
 * downloaded overall and says so. When a downloads-by-day table exists, the
 * heading can become true and this comment can go.
 */
export async function mostDownloaded(supabase: any, limit = 6): Promise<Shelf> {
    const { data, error } = await publishedCatalog(supabase)
        .gt('download_count', 0)
        .order('download_count', { ascending: false })
        .limit(limit);

    if (error) console.error('Shelf (most downloaded) failed:', error.message);

    return {
        id: 'most-downloaded',
        heading: 'Most downloaded',
        reason: 'What other teachers and learners are taking most',
        items: (data ?? []).map(toListing),
        href: '/?sort=popular',
    };
}

/**
 * New for the current year.
 *
 * Falls back to nothing rather than to last year's stock. A shelf headed "New
 * for 2026" that quietly contains 2024 papers is worse than no shelf: it is the
 * exact promise a teacher checks before paying.
 */
export async function newThisYear(supabase: any, limit = 6): Promise<Shelf> {
    const year = new Date().getFullYear();

    const { data, error } = await publishedCatalog(supabase)
        .eq('year', year)
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(limit);

    if (error) console.error('Shelf (new this year) failed:', error.message);

    return {
        id: 'new-this-year',
        heading: `New for ${year}`,
        reason: 'Added this year, matched to the current syllabus',
        items: (data ?? []).map(toListing),
        href: `/?year=${year}`,
    };
}

/**
 * What matters for the exam that is actually next.
 *
 * Term is derived from the month rather than asked for, because a teacher
 * opening the site in October is in Term 3 whether or not they have told us so.
 * Kenyan school terms run roughly January-April, May-August, September-November.
 */
export function currentTerm(now = new Date()): 'term-1' | 'term-2' | 'term-3' {
    const month = now.getMonth(); // 0-indexed
    if (month <= 3) return 'term-1'; // Jan-Apr
    if (month <= 7) return 'term-2'; // May-Aug
    return 'term-3'; // Sep-Dec
}

export async function examSeasonEssentials(
    supabase: any,
    level?: string | null,
    limit = 6
): Promise<Shelf> {
    const term = currentTerm();
    const termName = term.replace('term-', 'Term ');

    let query = publishedCatalog(supabase)
        .eq('term_slug', term)
        // The kinds somebody reaches for when a sitting is close, rather than
        // everything that happens to be tagged with the term.
        .in('resource_kind', ['past-paper', 'mock', 'prediction', 'revision-booklet', 'termly-exam']);

    if (level) query = query.eq('level_slug', level);

    const { data, error } = await query
        .order('year', { ascending: false, nullsFirst: false })
        .limit(limit);

    if (error) console.error('Shelf (exam season) failed:', error.message);

    return {
        id: 'exam-season',
        heading: `${termName} essentials`,
        reason: 'Papers and mocks for the term you are in now',
        items: (data ?? []).map(toListing),
        href: `/?term=${term}${level ? `&level=${level}` : ''}`,
    };
}

/**
 * Recommended from what somebody told us about themselves.
 *
 * Only ever called with a level, because without one this degrades to "here is
 * the catalogue" under a heading that claims it was chosen for you. That claim
 * is the entire value of the shelf and it cannot be faked.
 */
export async function recommendedFor(
    supabase: any,
    opts: { level: string; grade?: string | null; subjects?: string[] },
    limit = 6
): Promise<Shelf> {
    let query = publishedCatalog(supabase).eq('level_slug', opts.level);

    if (opts.subjects && opts.subjects.length > 0) {
        const list = opts.subjects.map((s) => `"${s.replace(/"/g, '')}"`).join(',');
        query = query.or(`subject.in.(${list})`);
    }

    const { data, error } = await query
        .order('year', { ascending: false, nullsFirst: false })
        .order('download_count', { ascending: false })
        .limit(limit);

    if (error) console.error('Shelf (recommended) failed:', error.message);

    return {
        id: 'recommended',
        heading: 'Picked for you',
        reason: opts.grade
            ? `Matched to ${opts.grade}${opts.subjects?.length ? ' and your subjects' : ''}`
            : 'Matched to the level you chose',
        items: (data ?? []).map(toListing),
        href: `/?level=${opts.level}`,
    };
}

/**
 * Similar to one resource, for the bottom of a detail page.
 *
 * Same subject and level, same kind where possible, excluding the paper being
 * looked at. Ordered by year so the nearest thing to "the other papers in this
 * series" comes first — which is what somebody on a detail page is usually
 * after.
 */
export async function similarTo(supabase: any, paper: any, limit = 6): Promise<Shelf> {
    if (!paper?.id) return emptyShelf('similar', 'More like this', '');

    let query = publishedCatalog(supabase).neq('id', paper.id);

    if (paper.subject) query = query.eq('subject', paper.subject);
    if (paper.level_slug) query = query.eq('level_slug', paper.level_slug);

    const { data, error } = await query
        .order('year', { ascending: false, nullsFirst: false })
        .limit(limit);

    if (error) console.error('Shelf (similar) failed:', error.message);

    let items = (data ?? []).map(toListing);

    // Same kind first, but not exclusively: a teacher looking at a Grade 9 maths
    // paper is often glad to see the scheme of work beside it, and filtering to
    // one kind would hide exactly that.
    if (paper.resource_kind) {
        items = [
            ...items.filter((i: PaperListing) => i.resource_kind === paper.resource_kind),
            ...items.filter((i: PaperListing) => i.resource_kind !== paper.resource_kind),
        ];
    }

    return {
        id: 'similar',
        heading: 'More like this',
        reason: [paper.grade_label, paper.subject].filter(Boolean).join(' · '),
        items,
        href: paper.level_slug && paper.subject ? `/?level=${paper.level_slug}` : undefined,
    };
}

function emptyShelf(id: string, heading: string, reason: string): Shelf {
    return { id, heading, reason, items: [] };
}

/**
 * Builds the shelves for the home page in the order they should appear, and
 * drops every one that came back empty.
 *
 * Deduplicated across shelves: the same paper appearing under "Picked for you",
 * "Most downloaded" and "Term 3 essentials" makes a thin catalogue look like a
 * broken one, and makes a large catalogue look repetitive. First shelf wins,
 * which is why the personalised one is ordered first.
 */
export async function homeShelves(
    supabase: any,
    account: { level?: string | null; grade?: string | null; subjects?: string[] }
): Promise<Shelf[]> {
    const built = await Promise.all([
        account.level
            ? recommendedFor(supabase, {
                  level: account.level,
                  grade: account.grade,
                  subjects: account.subjects,
              })
            : Promise.resolve(null),
        examSeasonEssentials(supabase, account.level ?? null),
        newThisYear(supabase),
        mostDownloaded(supabase),
    ]);

    const seen = new Set<string>();
    const shelves: Shelf[] = [];

    for (const shelf of built) {
        if (!shelf) continue;

        const fresh = shelf.items.filter((item) => {
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
        });

        // A shelf reduced to nothing by deduplication is still an empty shelf.
        if (fresh.length === 0) continue;

        shelves.push({ ...shelf, items: fresh });
    }

    return shelves;
}
