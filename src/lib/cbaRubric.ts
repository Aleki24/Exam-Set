/**
 * COMPETENCY-BASED ASSESSMENT
 * ----------------------------------------------------------------------------
 * The four performance levels a Kenyan teacher scores against, and the shape of
 * a School Based Assessment.
 *
 * WHY THIS EXISTS
 *
 * KNEC sets hard deadlines for uploading SBA scores — Grades 3, 7 and 8 by the
 * end of July, Grades 4 and 5 earlier — and the CBA portal buckles under load on
 * the final day. Deadlines have been publicly extended more than once because of
 * portal strain. In between, a teacher scores a class on paper and then hand-keys
 * every learner against every outcome into a national grid, while the head is
 * required to retain all the evidence.
 *
 * This is not an attempt to replace that portal, and nothing here uploads
 * anything to KNEC. It makes the hours *before* the portal survivable: score the
 * class where the class actually is, on a phone, with no signal, then check it is
 * complete and take it to the portal in one pass instead of forty.
 *
 * THE LEVELS ARE NOT A SCORE OUT OF FOUR
 *
 * BE / AE / ME / EE describe what a learner can do, not how many marks they
 * earned, and the ordering is the only arithmetic that is meaningful. Averaging
 * them would produce "2.7", which is not a thing a competency-based curriculum
 * says about anybody — so nothing here averages them, and the summary counts how
 * many sit at each level instead.
 */

export type PerformanceLevel = 'BE' | 'AE' | 'ME' | 'EE';

export interface LevelDef {
    code: PerformanceLevel;
    /** KNEC's ordinal. Used for sorting and for the portal, never for a mean. */
    value: 1 | 2 | 3 | 4;
    name: string;
    /** What the level actually means, in the words a teacher would use. */
    descriptor: string;
    /** A short form for the tap target, which has very little room. */
    short: string;
}

export const PERFORMANCE_LEVELS: LevelDef[] = [
    {
        code: 'BE',
        value: 1,
        name: 'Below Expectation',
        descriptor: 'Has not yet shown the competency and needs more support',
        short: 'Below',
    },
    {
        code: 'AE',
        value: 2,
        name: 'Approaching Expectation',
        descriptor: 'Shows it some of the time, but not consistently yet',
        short: 'Approaching',
    },
    {
        code: 'ME',
        value: 3,
        name: 'Meeting Expectation',
        descriptor: 'Has met the learning outcome — this is the target',
        short: 'Meeting',
    },
    {
        code: 'EE',
        value: 4,
        name: 'Exceeding Expectation',
        descriptor: 'Applies it accurately in new situations, with creativity',
        short: 'Exceeding',
    },
];

export const LEVEL_BY_CODE: Record<string, LevelDef> = Object.fromEntries(
    PERFORMANCE_LEVELS.map((l) => [l.code, l])
);

export function isPerformanceLevel(value: unknown): value is PerformanceLevel {
    return typeof value === 'string' && value in LEVEL_BY_CODE;
}

export function levelName(code?: string | null): string {
    if (!code) return 'Not scored';
    return LEVEL_BY_CODE[code]?.name ?? code;
}

/**
 * The colour each level carries, from the palette already in globals.css.
 *
 * Deliberately not a red-to-green gradient across four steps. Meeting
 * Expectation is the target, not a near-miss on the way to Exceeding, and
 * colouring it amber would tell a teacher — and eventually a parent — that a
 * learner who met the outcome had fallen short of something.
 */
export const LEVEL_TONE: Record<PerformanceLevel, string> = {
    BE: 'var(--ink-red)',
    AE: 'var(--accent)',
    ME: 'var(--success)',
    EE: 'var(--primary)',
};

// ============================================================================
// WHAT IS BEING ASSESSED
// ============================================================================

/**
 * One thing a learner is scored on.
 *
 * KNEC organises these as strands and sub-strands containing specific learning
 * outcomes. A teacher assessing a project scores each learner against each
 * outcome, which is what makes the grid the right shape for the UI: learners
 * down, outcomes across.
 */
export interface LearningOutcome {
    /** Stable within an assessment. Used as the score key. */
    id: string;
    /** e.g. "Creating a model" */
    title: string;
    /** e.g. "Pre-Technical Studies > Materials" */
    strand?: string;
}

export interface AssessmentDef {
    id: string;
    title: string;
    grade: string;
    learningArea: string;
    /** KNEC's deadline for this one, when it is known. */
    dueOn?: string | null;
    outcomes: LearningOutcome[];
}

// ============================================================================
// COMPLETENESS
// ============================================================================

export interface Completeness {
    expected: number;
    scored: number;
    missing: number;
    /** Learner ids with at least one outcome unscored. */
    incompleteLearners: string[];
    complete: boolean;
}

/**
 * What is still missing before this can go to the portal.
 *
 * The whole reason to check on a phone in a classroom is to find the gap while
 * the class is still in front of you. Finding it at the portal, on deadline day,
 * means finding it when the learner has gone home — which is how a score ends up
 * guessed.
 */
export function completeness(
    learnerIds: string[],
    outcomes: LearningOutcome[],
    scores: Record<string, Record<string, PerformanceLevel | undefined>>
): Completeness {
    const expected = learnerIds.length * outcomes.length;
    let scored = 0;
    const incompleteLearners: string[] = [];

    for (const learnerId of learnerIds) {
        const row = scores[learnerId] ?? {};
        let rowScored = 0;
        for (const outcome of outcomes) {
            if (row[outcome.id]) rowScored++;
        }
        scored += rowScored;
        if (rowScored < outcomes.length) incompleteLearners.push(learnerId);
    }

    return {
        expected,
        scored,
        missing: expected - scored,
        incompleteLearners,
        complete: expected > 0 && scored === expected,
    };
}

/**
 * How many learners sit at each level for one outcome.
 *
 * A distribution rather than an average, because averaging BE/AE/ME/EE produces
 * a number the curriculum does not recognise. "Eleven meeting, four approaching"
 * is something a teacher can act on; "2.7" is not.
 */
export function distribution(
    outcomeId: string,
    learnerIds: string[],
    scores: Record<string, Record<string, PerformanceLevel | undefined>>
): Record<PerformanceLevel | 'unscored', number> {
    const counts = { BE: 0, AE: 0, ME: 0, EE: 0, unscored: 0 };

    for (const learnerId of learnerIds) {
        const level = scores[learnerId]?.[outcomeId];
        if (level && level in counts) counts[level]++;
        else counts.unscored++;
    }

    return counts;
}

/**
 * The rows a teacher takes to the portal, in a stable order.
 *
 * Sorted by learner name so the export matches the register they read from —
 * a CSV in insertion order is a CSV somebody transcribes wrong.
 */
export interface ExportRow {
    admissionNumber: string;
    learnerName: string;
    outcome: string;
    level: PerformanceLevel | '';
    levelValue: number | '';
}

export function toExportRows(
    learners: { id: string; name: string; admissionNumber?: string | null }[],
    outcomes: LearningOutcome[],
    scores: Record<string, Record<string, PerformanceLevel | undefined>>
): ExportRow[] {
    const ordered = [...learners].sort((a, b) => a.name.localeCompare(b.name));
    const rows: ExportRow[] = [];

    for (const learner of ordered) {
        for (const outcome of outcomes) {
            const level = scores[learner.id]?.[outcome.id];
            rows.push({
                admissionNumber: learner.admissionNumber ?? '',
                learnerName: learner.name,
                outcome: outcome.title,
                level: level ?? '',
                levelValue: level ? LEVEL_BY_CODE[level].value : '',
            });
        }
    }

    return rows;
}

/** CSV, with the quoting a Kenyan learner's name actually needs. */
export function toCsv(rows: ExportRow[]): string {
    const header = ['Admission number', 'Learner', 'Outcome', 'Level', 'Level value'];
    const escape = (value: string | number) => {
        const text = String(value);
        // Commas and quotes appear in names and outcome titles constantly, and an
        // unquoted one silently shifts every later column by a place.
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };

    return [
        header.join(','),
        ...rows.map((r) =>
            [r.admissionNumber, r.learnerName, r.outcome, r.level, r.levelValue].map(escape).join(',')
        ),
    ].join('\n');
}
