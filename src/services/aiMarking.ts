/**
 * AI MARKING — server only
 * ----------------------------------------------------------------------------
 * Marks the answers arithmetic cannot: short answers and structured responses,
 * against the marking scheme the examiner already wrote.
 *
 * WHY THIS IS SERVER-ONLY, AND WHY THERE IS NO BROWSER PROXY
 *
 * There used to be one — `/api/perplexity` took `messages` straight from the
 * request body and forwarded them to the provider. Marking must never be
 * reachable that way: a learner could send their own prompt and have the model
 * award them full marks. That route has been deleted (nothing called it), and
 * marking is decided here, on the server, from rows the server read — never
 * from anything a browser said.
 *
 * WHAT THE MODEL IS AND IS NOT ALLOWED TO DO
 *
 * It is given one question, its marking scheme, and one answer, and asked for a
 * number between zero and the marks available. It is not asked whether the
 * scheme is right, not asked to improvise a scheme, and not asked to mark more
 * than one question at a time — batching is cheaper and measurably worse, and
 * the saving is not worth a wrong mark on somebody's revision.
 *
 * Every failure — no key, timeout, malformed reply, a mark outside the possible
 * range — returns UNMARKED. Never zero. A model that could not answer has not
 * decided the learner was wrong, and the difference matters more here than
 * anywhere else in the product: a false zero sends somebody to revise a strand
 * they had already mastered.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { UNMARKED, type Mark, type MarkableQuestion } from './markingService';
import { aiAvailable, aiJson } from './claude';

/** One question should never hold up a submission for long. */
const CALL_TIMEOUT_MS = 20_000;

/**
 * Total time all marking may take before the rest is left unmarked.
 *
 * A submission has somebody waiting on it. Twenty questions at twenty seconds
 * each would be a submit button that appears broken, so the budget is spent in
 * order and whatever it does not reach is honestly reported as unmarked rather
 * than silently zeroed.
 */
export const MARKING_BUDGET_MS = 45_000;

/** How many questions to mark at once. Enough to be quick, not enough to throttle. */
const CONCURRENCY = 4;

export function aiMarkingAvailable(): boolean {
    return aiAvailable();
}

const SYSTEM_PROMPT = `You are an experienced Kenyan examiner marking a single answer.

You will be given a question, the official marking scheme, and one learner's answer.

Rules:
- Award marks strictly according to the marking scheme. It is the authority, not your own opinion of the subject.
- Where the scheme says "any three of", award for any three valid points listed. Where it says "also accept", those alternatives are fully correct.
- Accept correct answers written in different words, with spelling mistakes, or in a different order. Mark the understanding, not the handwriting.
- Do not award marks for anything the scheme does not support.
- Partial credit is expected where the marks available are greater than one.
- If the answer is off-topic or blank, award 0.
- If you cannot mark it fairly from the scheme provided, set "can_mark" to false. Do not guess.

"confidence" is how sure you are the mark matches what a human examiner would give.
"note" explains what was missing, or what earned the marks. Address the learner as "you". Keep it under 20 words.`;

/**
 * The verdict, constrained at the API.
 *
 * A schema cannot say "no more than the marks available" — that check stays
 * below, and it is the one that matters most: a mark outside the range means
 * the model misread the question, and the whole verdict goes with it.
 */
const VERDICT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['marks_awarded', 'confidence', 'note', 'can_mark'],
    properties: {
        marks_awarded: { type: 'number', description: 'Marks earned. 0 if the answer earns none.' },
        confidence: { type: 'number', description: 'Between 0 and 1.' },
        note: { type: 'string', description: 'One short sentence for the learner, under 20 words.' },
        can_mark: { type: 'boolean', description: 'False when the scheme is not clear enough to mark fairly.' },
    },
} as const;

interface AiVerdict {
    marks_awarded?: unknown;
    confidence?: unknown;
    note?: unknown;
    can_mark?: unknown;
}

/**
 * Marks one answer. Returns UNMARKED on any doubt whatsoever.
 */
export async function aiMark(question: MarkableQuestion, answer: string): Promise<Mark> {
    if (!aiAvailable()) return { ...UNMARKED, note: 'Marking is not configured on this deployment.' };

    const available = Number(question.marks) || 0;
    if (available <= 0) return { ...UNMARKED, note: 'This question carries no marks.' };

    const prompt = [
        `QUESTION (${available} mark${available === 1 ? '' : 's'}):`,
        stripHtml(question.text ?? ''),
        '',
        'MARKING SCHEME:',
        question.marking_scheme ?? '',
        '',
        "LEARNER'S ANSWER:",
        answer,
    ].join('\n');

    const result = await aiJson<AiVerdict>({
        system: SYSTEM_PROMPT,
        content: prompt,
        schema: VERDICT_SCHEMA as unknown as Record<string, unknown>,
        maxTokens: 2_000,
        timeoutMs: CALL_TIMEOUT_MS,
    });

    if (!result.ok) {
        // The learner sees "not marked", never a provider error and never a
        // zero. Why it failed is the operator's problem, and it is in the log.
        return { ...UNMARKED, note: 'This answer could not be marked automatically.' };
    }

    const verdict = result.value;

    if (verdict.can_mark === false) {
        return {
            ...UNMARKED,
            note: 'The marking scheme was not clear enough to mark this fairly.',
        };
    }

    const marks = Number(verdict.marks_awarded);
    if (!Number.isFinite(marks)) {
        return { ...UNMARKED, note: 'This answer could not be marked automatically.' };
    }

    // A mark outside the possible range means the model misread the question, so
    // the whole verdict is suspect — including any confidence it claimed.
    if (marks < 0 || marks > available) {
        console.warn(`AI returned ${marks} of ${available} for question ${question.id}; discarding.`);
        return { ...UNMARKED, note: 'This answer could not be marked automatically.' };
    }

    const confidence = clampConfidence(verdict.confidence);

    return {
        marksAwarded: marks,
        // "Correct" means the full mark. Partial credit is neither correct nor
        // wrong, and forcing it into a boolean would misreport both.
        isCorrect: marks >= available,
        markedBy: 'ai',
        confidence,
        note: typeof verdict.note === 'string' ? verdict.note.slice(0, 200) : null,
    };
}

/**
 * Marks many answers, in order, within a time budget.
 *
 * Whatever the budget does not reach comes back unmarked. That is the honest
 * outcome and it is visible to the learner — better than a submission that
 * hangs, and far better than the unreached questions being scored zero.
 */
export async function aiMarkMany(
    items: { question: MarkableQuestion; answer: string }[],
    budgetMs = MARKING_BUDGET_MS
): Promise<Map<string, Mark>> {
    const results = new Map<string, Mark>();
    const deadline = Date.now() + budgetMs;

    const queue = [...items];

    const worker = async () => {
        while (queue.length > 0) {
            if (Date.now() >= deadline) break;
            const item = queue.shift();
            if (!item) break;
            results.set(item.question.id, await aiMark(item.question, item.answer));
        }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));

    // Anything the budget did not reach.
    for (const item of items) {
        if (!results.has(item.question.id)) {
            results.set(item.question.id, {
                ...UNMARKED,
                note: 'Not marked yet — marking timed out. Your other answers were marked.',
            });
        }
    }

    return results;
}

// ============================================================================

/**
 * `null` and `undefined` mean "no claim was made" and default to a neutral 0.5
 * — not `Number(null)`, which JavaScript coerces to `0`. The review UI flags
 * anything under 0.6, so reading an absent field as zero would flag it as the
 * worst case on screen rather than a neutral one.
 */
function clampConfidence(value: unknown): number {
    if (value === null || value === undefined) return 0.5;
    const n = Number(value);
    if (!Number.isFinite(n)) return 0.5;
    return Math.max(0, Math.min(1, n));
}

/** Questions are stored with light HTML from the rich-text editor. */
function stripHtml(html: string): string {
    return html
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
}

