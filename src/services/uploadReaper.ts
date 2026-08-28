/**
 * CLEARING UP AFTER AN ABANDONED UPLOAD
 * ----------------------------------------------------------------------------
 * `/papers/new` uploads the file the moment it is picked. That is what lets the
 * classifier read the cover and fill the form in, and it is the reason the page
 * is worth using — but it means closing the tab before publishing is now an
 * ordinary thing to do, and every time somebody does, an object is left in the
 * bucket that nothing in the database points at. `/papers/bulk` has behaved
 * this way since it shipped, so the leak predates the change that made it
 * common.
 *
 * Nothing collects those. Storage is billed by the gigabyte and a 25 MB scan
 * that was never listed costs the same as one that sells every week.
 *
 * The decision is kept here, away from the route, because it is the part worth
 * being sure about: this function's output is a list of files to delete
 * permanently, and the difference between a correct implementation and a nearly
 * correct one is a seller's paper disappearing from a live shop. Pure input to
 * output, no bucket and no database, so `verify:reaper` can push the awkward
 * cases through it — the file uploaded thirty seconds ago, the key referenced
 * by a paper that is only a draft, the prefix that is not ours at all.
 */

/** What a listing gives us about one object. Matches `StoredObject`. */
export interface ReapCandidate {
    key: string;
    size: number;
    uploadedAt: Date | null;
}

export interface ReapPlan {
    /** Safe to delete: unreferenced, old enough, and under a prefix we own. */
    doomed: ReapCandidate[];
    /** Bytes those add up to, for the report an admin reads before confirming. */
    bytes: number;
    /** Left alone because a row points at them. */
    referenced: number;
    /** Left alone because they are too new — see `MIN_AGE_MS`. */
    tooNew: number;
    /** Left alone because they are not under a prefix this reaper owns. */
    foreign: number;
}

/**
 * How long an unreferenced file is left alone.
 *
 * The gap between "the bytes have landed in the bucket" and "the row exists in
 * `exams`" is the whole upload flow: reading the cover, filling the form,
 * setting a price. A reaper that swept anything unreferenced would delete the
 * file out from under somebody who is still typing, and they would find out at
 * the moment they pressed Publish.
 *
 * Six hours is far longer than that gap can plausibly be, and short enough that
 * abandoned files do not accumulate for a month. It is deliberately not
 * configurable: the cost of getting it wrong is asymmetric, and the only value
 * anyone would ever be tempted to lower it to is the one that breaks the flow.
 */
export const MIN_AGE_MS = 6 * 60 * 60 * 1000;

/**
 * The only prefix this reaper will ever delete from.
 *
 * `generated/` holds papers rendered from the question bank and is a cache the
 * download route rebuilds — but rebuilding costs a render, and the row points
 * at those keys anyway, so they would be spared as referenced and there is no
 * reason to walk them. `figures/` holds question images referenced by
 * `questions.image_path`, a table this reaper does not read; sweeping it
 * against a list of paper keys would delete every figure in the bank.
 *
 * So the rule is not "delete what is unreferenced" — it is "delete what is
 * unreferenced *and* is an upload", and this constant is what makes the second
 * half true.
 */
export const REAPABLE_PREFIX = 'papers/';

/**
 * An object with no uploaded-at date is treated as old.
 *
 * Both backends report one, so this is a shape neither is expected to produce.
 * The alternative — treating an undated object as new and therefore permanent —
 * means a backend that stopped reporting dates would quietly turn the reaper
 * off and nobody would notice until the storage bill did. Better to be governed
 * by the reference check, which is the one that actually protects a live paper.
 */
function ageMs(candidate: ReapCandidate, now: number): number {
    return candidate.uploadedAt ? now - candidate.uploadedAt.getTime() : Number.POSITIVE_INFINITY;
}

/**
 * What to delete, given everything in the bucket and every key a row points at.
 *
 * `referencedKeys` must be every key from every `exams` row — published,
 * drafts, and papers belonging to other sellers alike. A draft is not an
 * abandoned upload: somebody saved it on purpose and expects to publish it
 * later, so filtering the query by `is_published` would delete exactly the
 * files a seller was most careful about.
 */
export function planReap(
    stored: ReapCandidate[],
    referencedKeys: Iterable<string>,
    now: number = Date.now(),
    minAgeMs: number = MIN_AGE_MS
): ReapPlan {
    const referenced = new Set(referencedKeys);

    const plan: ReapPlan = { doomed: [], bytes: 0, referenced: 0, tooNew: 0, foreign: 0 };

    for (const candidate of stored) {
        if (!candidate.key.startsWith(REAPABLE_PREFIX)) {
            plan.foreign++;
            continue;
        }
        if (referenced.has(candidate.key)) {
            plan.referenced++;
            continue;
        }
        if (ageMs(candidate, now) < minAgeMs) {
            plan.tooNew++;
            continue;
        }

        plan.doomed.push(candidate);
        plan.bytes += candidate.size;
    }

    return plan;
}

/** Bytes as an admin would say them. */
export function humanBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}
