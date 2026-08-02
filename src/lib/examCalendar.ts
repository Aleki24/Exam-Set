/**
 * NATIONAL EXAM CALENDAR
 * ----------------------------------------------------------------------------
 * When the exams that matter actually start.
 *
 * THE HONESTY PROBLEM, AND HOW IT IS HANDLED
 *
 * A countdown is a promise about a real date. Getting it wrong is worse than
 * not having one: a learner who plans around "42 days to KCSE" and finds the
 * paper is in three weeks has been actively harmed by a decorative widget.
 *
 * KNEC publishes the timetable each year, and the dates below are the published
 * ones where they exist and clearly-marked estimates where they do not. Every
 * entry carries `confirmed`, and the UI is required to say "expected" rather
 * than counting down confidently to a guess. When a date has not been published
 * at all, there is no entry and no countdown — an absent widget is honest, an
 * invented date is not.
 *
 * MAINTENANCE
 *
 * This is data with an expiry. Each November, add the following year's
 * timetable and mark the previous one confirmed. `staleAfter` below is the
 * date past which this file should be assumed out of date; `calendarIsStale()`
 * returns true after it, and the countdown hides itself rather than counting
 * towards dates nobody has checked since.
 */

export type NationalExam = 'kpsea' | 'kjsea' | 'kcse';

export interface ExamSitting {
    exam: NationalExam;
    /** Short name as a learner would say it. */
    name: string;
    /** What it is, for anyone who does not already know. */
    full: string;
    year: number;
    /** First day of the sitting, ISO date. Local Kenyan date, no time. */
    startsOn: string;
    /**
     * True only when KNEC has published this date. False means it is derived
     * from the usual month and must be shown as "expected".
     */
    confirmed: boolean;
    /** Which levels sit it — used to show a learner only their own. */
    levels: string[];
}

/**
 * Past this date, treat everything here as unverified.
 *
 * Deliberately not "one year from the newest entry": the point is a hard stop
 * that forces a human to look, rather than a rule that quietly extends itself.
 */
const STALE_AFTER = '2027-06-30';

export function calendarIsStale(now = new Date()): boolean {
    return now > new Date(`${STALE_AFTER}T23:59:59Z`);
}

/**
 * Sittings, soonest first.
 *
 * Dates follow the pattern KNEC has used consistently — KPSEA and KJSEA in late
 * October, KCSE beginning early November and running into late November. They
 * are marked unconfirmed because I have not verified them against a published
 * timetable, and marking them otherwise would be exactly the lie this file
 * exists to avoid.
 */
export const EXAM_CALENDAR: ExamSitting[] = [
    {
        exam: 'kpsea',
        name: 'KPSEA',
        full: 'Kenya Primary School Education Assessment',
        year: 2026,
        startsOn: '2026-10-26',
        confirmed: false,
        levels: ['upper-primary'],
    },
    {
        exam: 'kjsea',
        name: 'KJSEA',
        full: 'Kenya Junior School Education Assessment',
        year: 2026,
        startsOn: '2026-10-26',
        confirmed: false,
        levels: ['junior-school'],
    },
    {
        exam: 'kcse',
        name: 'KCSE',
        full: 'Kenya Certificate of Secondary Education',
        year: 2026,
        startsOn: '2026-11-02',
        confirmed: false,
        levels: ['form-1-4', 'senior-school'],
    },
];

export interface Countdown {
    sitting: ExamSitting;
    /** Whole days from today. Zero on the day itself; never negative. */
    daysAway: number;
    /** True on the first day of the sitting. */
    today: boolean;
}

/**
 * The next sitting for a level, or null.
 *
 * Null is a perfectly good answer and callers must render nothing for it. There
 * is no countdown for a Grade 2 learner because Grade 2 does not sit a national
 * exam, and inventing one to fill the space would be noise dressed as guidance.
 */
export function nextSitting(level?: string | null, now = new Date()): Countdown | null {
    if (calendarIsStale(now)) return null;

    const today = startOfDay(now);

    const upcoming = EXAM_CALENDAR.filter((s) => {
        if (level && !s.levels.includes(level)) return false;
        return startOfDay(new Date(`${s.startsOn}T00:00:00`)) >= today;
    }).sort((a, b) => a.startsOn.localeCompare(b.startsOn));

    const sitting = upcoming[0];
    if (!sitting) return null;

    const start = startOfDay(new Date(`${sitting.startsOn}T00:00:00`));
    const daysAway = Math.round((start.getTime() - today.getTime()) / 86_400_000);

    return { sitting, daysAway, today: daysAway === 0 };
}

function startOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** How a countdown should read. Never "0 days" — that is the day itself. */
export function countdownLabel(c: Countdown): string {
    if (c.today) return 'Starts today';
    if (c.daysAway === 1) return 'Tomorrow';
    if (c.daysAway < 7) return `${c.daysAway} days away`;
    if (c.daysAway < 14) return 'Next week';
    if (c.daysAway < 60) return `${Math.round(c.daysAway / 7)} weeks away`;
    return `${Math.round(c.daysAway / 30)} months away`;
}

// ============================================================================
// TRUST SIGNALS
// ============================================================================

/**
 * Whether a resource is current for the school year in progress.
 *
 * Only ever claims what the row actually says. A paper with no year gets no
 * badge rather than an optimistic one — "Updated for 2026" is the specific
 * promise a teacher checks before paying, and a badge derived from a null is
 * the kind of small lie that costs a subscription.
 */
export function isCurrentYear(year?: number | null, now = new Date()): boolean {
    if (!year) return false;
    return year >= now.getFullYear();
}

export function freshnessLabel(year?: number | null, now = new Date()): string | null {
    if (!year) return null;
    const current = now.getFullYear();
    if (year > current) return `For ${year}`;
    if (year === current) return `Updated for ${year}`;
    if (year === current - 1) return `${year} paper`;
    return null;
}
