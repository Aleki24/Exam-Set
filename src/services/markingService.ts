/**
 * MARKING
 * ----------------------------------------------------------------------------
 * Turning an answer into a mark.
 *
 * This is the thing that separates the product from a shelf of PDFs. Anyone can
 * sell a past paper; the question is whether the paper marks itself and then
 * says which strand to revise. Everything downstream — `learner_topic_progress`,
 * the weakest-topic list, the parent summary, the trend — reads columns that
 * nothing wrote until this file existed, which is why all of it displayed zero.
 *
 * THE ONE RULE: UNMARKED IS NOT ZERO
 *
 * `marks_awarded` is nullable and stays null when a question could not be
 * marked. It is never set to 0 to mean "we did not look".
 *
 * The distinction is the whole honesty of the feature. A learner who wrote a
 * good answer to a question whose marking scheme is empty has not scored zero —
 * nobody marked it. Recording that as zero would drag their average down for a
 * gap in our data, tell them a strand is weak when it is not, and send them to
 * revise the wrong thing. Since the entire point of the diagnostics is to
 * decide what to revise next, a false zero is not a cosmetic error; it costs
 * somebody the hours they had.
 *
 * So a paper is scored out of what was actually marked. Nine marked marks out of
 * ten with one unmarkable question reads "9/9, one question not marked", never
 * "9/10".
 *
 * HOW EACH TYPE IS MARKED
 *
 *   Numeric              arithmetic, locally, with tolerance
 *   Fill-in-the-blank    exact match locally when the scheme is a plain answer;
 *                        otherwise deferred to the model, because schemes here
 *                        carry prose like "DOCTORS. Also accept: nurses, ..."
 *                        and a string comparison would fail every synonym the
 *                        examiner explicitly allowed
 *   Short Answer,        the model, with the stored marking scheme supplied as
 *   Structured           the rubric
 *
 * Rubric-conditioned LLM grading is reported at around 0.94 agreement with human
 * examiners, which is roughly what two human markers achieve with each other. It
 * is good enough to be useful and not good enough to be silent about, so every
 * model-awarded mark carries a confidence and is labelled in the UI.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type MarkedBy = 'auto' | 'ai' | 'self';

export interface Mark {
    /** Null means nobody marked it. Never use 0 for that. */
    marksAwarded: number | null;
    /** Null alongside a null mark. */
    isCorrect: boolean | null;
    markedBy: MarkedBy | null;
    /** 0–1 for model marks; 1 for arithmetic; null when unmarked. */
    confidence: number | null;
    /** Shown to the learner. Explains a refusal as readily as a mark. */
    note: string | null;
}

export const UNMARKED: Mark = {
    marksAwarded: null,
    isCorrect: null,
    markedBy: null,
    confidence: null,
    note: null,
};

function unmarked(note: string): Mark {
    return { ...UNMARKED, note };
}

// ============================================================================
// WHAT CANNOT BE MARKED
// ============================================================================

/**
 * Schemes that describe how to mark rather than what the answer is.
 *
 * Real examples from the bank: "Answers must be read from the map of Kitu area
 * supplied with the paper." There is no map here, so there is no honest mark —
 * and a model handed that scheme will confidently invent one, which is worse
 * than declining.
 */
const NEEDS_MATERIAL = [
    'supplied with the paper',
    'read from the map',
    'refer to the map',
    'from the diagram provided',
    'as supplied',
    'attached material',
];

/** True when there is nothing to mark against. */
export function schemeIsUsable(scheme?: string | null): boolean {
    if (!scheme) return false;
    // Some rows carry an empty string rather than null, which is not the same as
    // having a scheme and reads identically to the learner.
    if (scheme.trim().length < 2) return false;
    const lower = scheme.toLowerCase();
    return !NEEDS_MATERIAL.some((phrase) => lower.includes(phrase));
}

/** True when the answer is blank. Blank genuinely is zero, not unmarked. */
export function answerIsBlank(answer?: string | null): boolean {
    return !answer || answer.trim().length === 0;
}

// ============================================================================
// NUMERIC
// ============================================================================

/**
 * Pulls a number out of an answer that may carry units or formatting.
 *
 * "42", "42.0", "KES 42", "42 cm", "1,200" all read as the same number. Returns
 * null when there is no number to find, which is a refusal rather than a zero.
 */
export function parseNumber(raw?: string | null): number | null {
    if (!raw) return null;
    // Strip thousands separators before anything else, or "1,200" becomes 1.
    const cleaned = String(raw).replace(/,(?=\d{3}\b)/g, '');
    const match = cleaned.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const value = Number(match[0]);
    return Number.isFinite(value) ? value : null;
}

/**
 * Relative tolerance, so a rounded answer is not punished.
 *
 * A learner who writes 3.14 for π has not made an error worth a zero, and one
 * who writes 3.1416 has not either. Exact equality would fail both.
 */
const NUMERIC_TOLERANCE = 0.01;

export function numbersMatch(answer: number, expected: number): boolean {
    if (answer === expected) return true;
    const scale = Math.max(Math.abs(expected), 1);
    return Math.abs(answer - expected) / scale <= NUMERIC_TOLERANCE;
}

// ============================================================================
// TEXT
// ============================================================================

/**
 * Case, spacing and trailing punctuation are not what is being assessed.
 *
 * Order matters and got this wrong first time. Stripping the trailing full stop
 * before trimming meant the `$` anchor never matched on "Nairobi. " — the
 * punctuation survived, and an exact-match question came back wrong. Phone
 * keyboards insert a space after a full stop automatically, so that was not an
 * edge case; it was most answers typed on the device this product is used on.
 * Whitespace goes first, punctuation second.
 */
export function normalise(raw: string): string {
    return raw
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[.,;:!?]+$/g, '')
        .trim();
}

/**
 * True when a scheme is a single plain answer that can be compared directly.
 *
 * Deliberately conservative. Anything carrying "also accept", "any three of",
 * "award", "or" and so on is a rubric with judgement in it, and comparing a
 * string against it would mark a correct synonym wrong — the examiner went to
 * the trouble of listing alternatives precisely because they are acceptable.
 * Those go to the model.
 */
const RUBRIC_MARKERS = [
    'also accept',
    'accept ',
    'any ',
    'award',
    'mark for',
    'marks for',
    ' or ',
    '/',
    ';',
    'either',
    'e.g',
    'etc',
];

export function schemeIsPlainAnswer(scheme: string): boolean {
    const lower = scheme.toLowerCase().trim();
    if (lower.length > 40) return false;
    if (lower.includes(',')) return false;
    return !RUBRIC_MARKERS.some((marker) => lower.includes(marker));
}

// ============================================================================
// THE LOCAL MARKER
// ============================================================================

export interface MarkableQuestion {
    id: string;
    type?: string | null;
    marks?: number | null;
    marking_scheme?: string | null;
    text?: string | null;
    topic?: string | null;
}

/**
 * Marks what can be marked without asking a model, and says when it cannot.
 *
 * Returns `null` to mean "this needs the model" — distinct from returning an
 * unmarked Mark, which means "this cannot be marked at all".
 */
export function markLocally(question: MarkableQuestion, answer: string): Mark | null {
    const marks = Number(question.marks) || 0;
    const scheme = question.marking_scheme ?? '';

    if (answerIsBlank(answer)) {
        // Nothing written is a real zero, and no model is needed to say so.
        return {
            marksAwarded: 0,
            isCorrect: false,
            markedBy: 'auto',
            confidence: 1,
            note: 'No answer given.',
        };
    }

    if (!schemeIsUsable(scheme)) {
        return unmarked(
            'This question has no marking scheme we can use, so it has been left unmarked rather than scored zero.'
        );
    }

    const type = (question.type ?? '').toLowerCase();

    if (type === 'numeric') {
        const given = parseNumber(answer);
        const expected = parseNumber(scheme);

        // A scheme with no number in it is prose about how to mark, not an
        // answer to compare against.
        if (given === null || expected === null) return null;

        const correct = numbersMatch(given, expected);
        return {
            marksAwarded: correct ? marks : 0,
            isCorrect: correct,
            markedBy: 'auto',
            confidence: 1,
            note: correct ? null : `Expected ${expected}.`,
        };
    }

    if (type === 'fill-in-the-blank' && schemeIsPlainAnswer(scheme)) {
        const correct = normalise(answer) === normalise(scheme);
        // Only a match is trusted locally. A mismatch may still be a valid
        // synonym, so it goes to the model rather than being marked wrong.
        if (correct) {
            return {
                marksAwarded: marks,
                isCorrect: true,
                markedBy: 'auto',
                confidence: 1,
                note: null,
            };
        }
        return null;
    }

    return null;
}

// ============================================================================
// SCORING A WHOLE PAPER
// ============================================================================

export interface ScoredPaper {
    /** Marks earned across the questions that were actually marked. */
    score: number;
    /** Total available across those same questions — never the whole paper. */
    maxScore: number;
    percentage: number | null;
    markedCount: number;
    unmarkedCount: number;
}

/**
 * Totals a paper over what was marked, not over what was set.
 *
 * The denominator is the point. A paper with ten marks where one question could
 * not be marked is scored out of nine; counting it out of ten would silently
 * charge the learner for our missing marking scheme, and every average and topic
 * percentage downstream would inherit the lie.
 */
export function scorePaper(marks: Mark[]): ScoredPaper {
    let score = 0;
    let maxScore = 0;
    let markedCount = 0;
    let unmarkedCount = 0;

    for (const mark of marks) {
        if (mark.marksAwarded === null) {
            unmarkedCount++;
            continue;
        }
        markedCount++;
        score += mark.marksAwarded;
    }

    return { score, maxScore, percentage: null, markedCount, unmarkedCount };
}

/**
 * As above, but with each question's available marks supplied alongside.
 *
 * Kept separate from `scorePaper` so the denominator can only ever come from the
 * question rows on the server — never from anything a browser sent.
 */
export function scorePaperWithTotals(
    entries: { mark: Mark; marksPossible: number }[]
): ScoredPaper {
    let score = 0;
    let maxScore = 0;
    let markedCount = 0;
    let unmarkedCount = 0;

    for (const { mark, marksPossible } of entries) {
        if (mark.marksAwarded === null) {
            unmarkedCount++;
            continue;
        }
        markedCount++;
        score += mark.marksAwarded;
        maxScore += marksPossible;
    }

    const percentage = maxScore > 0 ? Math.round((score / maxScore) * 1000) / 10 : null;

    return { score, maxScore, percentage, markedCount, unmarkedCount };
}

/** How a mark should be described to the learner. */
export function markLabel(mark: Mark): string {
    if (mark.marksAwarded === null) return 'Not marked';
    if (mark.markedBy === 'self') return 'You marked this';
    if (mark.markedBy === 'ai') {
        return mark.confidence !== null && mark.confidence < 0.7
            ? 'Marked by AI — worth checking'
            : 'Marked by AI';
    }
    return 'Marked automatically';
}

/**
 * Below this, the UI shows the marking scheme alongside and invites a
 * correction. Chosen so that anything the model was genuinely unsure about is
 * presented as a suggestion rather than a verdict.
 */
export const LOW_CONFIDENCE = 0.7;
