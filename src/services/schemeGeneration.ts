/**
 * GENERATING A MARKING SCHEME — server only
 * ----------------------------------------------------------------------------
 * 203 of the 253 questions in the live bank — four in five — have no marking
 * scheme. Every one of them can be sold, put in a paper, and printed with
 * "No marking scheme recorded for this question" where the answer should be.
 * A missing scheme is also what stops a question being AI-marked at all: see
 * `aiMarking.ts`, which refuses outright when there is nothing to mark against.
 *
 * This proposes a scheme for a question that does not have one. It never
 * writes to the bank itself — `/api/admin/questions/marking-schemes` returns
 * proposals, and only a save the admin explicitly makes turns one into a row
 * update. The same argument that governs AI question extraction applies here
 * with more force: a wrong question is a bad question a teacher can reject on
 * sight, but a wrong marking scheme is invisible until it awards or refuses
 * marks incorrectly, possibly for years, on a question already being sold.
 *
 * WHAT THE MODEL IS AND IS NOT ALLOWED TO DO
 *
 * It is given one question — its text, its type, its marks, its options if it
 * has any — and asked for the scheme an examiner would write. It is not asked
 * to guess at a diagram, table or figure it cannot see: a real slice of this
 * bank references one ("the diagram below", "in the table above"), and a model
 * confidently inventing what a missing figure showed is worse than the gap it
 * is meant to fill. Told to decline, and it does — see `canGenerate` below.
 *
 * This mirrors `aiMarking.ts` deliberately: same provider, same timeout
 * convention, same worker-pool batching, same refusal-over-guessing rule. Two
 * different jobs — marking an answer against a scheme, and writing the scheme
 * an answer will be marked against — sharing one standard for what "the model
 * would rather say nothing than be wrong" means in practice.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { cleanText } from './paperLayout';

const API_URL = 'https://api.perplexity.ai/chat/completions';
const MODEL = 'sonar';

const CALL_TIMEOUT_MS = 20_000;

/** Same shape as MARKING_BUDGET_MS in aiMarking.ts — a batch that does not
 * finish in time returns honestly-unfinished, not silently truncated. */
export const GENERATION_BUDGET_MS = 60_000;

const CONCURRENCY = 4;

function apiKey(): string {
    return process.env.PERPLEXITY_API_KEY || process.env.NEXT_PUBLIC_PERPLEXITY_API_KEY || '';
}

export function schemeGenerationAvailable(): boolean {
    return apiKey().length > 0;
}

const SYSTEM_PROMPT = `You are an experienced Kenyan examiner writing a marking scheme for a question that does not have one yet.

You will be given the question's text, its type, the marks it carries, and its options if it is multiple choice.

Rules:
- Write the scheme an examiner would actually use: the expected answer, or the points that earn the marks.
- Where the marks available are more than one, break the scheme into the points that earn each mark — "any three of: ...", or one clause per mark — rather than one unstructured paragraph.
- For multiple choice, name the correct option and, briefly, why the others are wrong.
- Match the marks given. A 1-mark question gets a short scheme; a 6-mark question gets six marks' worth of points.
- If the question refers to something you cannot see — a diagram, a table, an image, "the passage above" — and the marking scheme depends on that content, you cannot write it responsibly. Set "can_generate" to false rather than inventing what the figure might have shown.
- If the question is genuinely ambiguous or you are not confident of the syllabus answer, set "can_generate" to false. Saying nothing is better than being wrong on a scheme that will mark real learners.

Reply with JSON only, no prose and no code fence:
{"marking_scheme": "<the scheme, or empty if can_generate is false>", "confidence": <0 to 1>, "can_generate": <true|false>, "reason": "<one short sentence, only if can_generate is false>"}`;

export interface SchemeCandidateQuestion {
    id: string;
    text: string;
    type?: string | null;
    marks?: number | null;
    options?: unknown;
}

export interface SchemeProposal {
    /** Null when the model declined — see `reason`. Never a guess. */
    markingScheme: string | null;
    confidence: number;
    reason: string | null;
}

const DECLINED: SchemeProposal = {
    markingScheme: null,
    confidence: 0,
    reason: null,
};

export function optionsToLines(options: unknown): string {
    if (!options) return '';
    const list = Array.isArray(options)
        ? options
        : typeof options === 'object'
          ? Object.values(options as Record<string, unknown>)
          : [];
    const clean = list
        .map((o) => (typeof o === 'string' ? o : (o as any)?.text ?? (o as any)?.label ?? ''))
        .filter((o): o is string => typeof o === 'string' && o.trim().length > 0);

    if (clean.length === 0) return '';
    return clean.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n');
}

interface AiVerdict {
    marking_scheme?: unknown;
    confidence?: unknown;
    can_generate?: unknown;
    reason?: unknown;
}

export function parseVerdict(raw: string): AiVerdict | null {
    try {
        let cleaned = raw.trim();
        const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fence) cleaned = fence[1].trim();
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        if (start === -1 || end === -1 || end < start) return null;
        return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
        return null;
    }
}

/**
 * A confidence value the model claimed, read defensively.
 *
 * `null` and `undefined` are read as "no claim was made" and default to a
 * neutral 0.5 — not as `Number(null)`, which JavaScript coerces to `0`. That
 * distinction is not cosmetic: this app flags anything under 0.6 as
 * low-confidence in the review UI, so treating "the model said nothing" the
 * same as "the model said zero" would flag an absent field as the worst case
 * on screen rather than a neutral one.
 */
export function clampConfidence(value: unknown): number {
    if (value === null || value === undefined) return 0.5;
    const n = Number(value);
    if (!Number.isFinite(n)) return 0.5;
    return Math.max(0, Math.min(1, n));
}

/**
 * Proposes a scheme for one question. Returns a declined proposal — never a
 * fabricated one — on any doubt: no key, a call failure, an unparsable reply,
 * or the model itself declining.
 */
export async function generateScheme(question: SchemeCandidateQuestion): Promise<SchemeProposal> {
    const key = apiKey();
    if (!key) return { ...DECLINED, reason: 'AI scheme generation is not configured on this deployment.' };

    const text = cleanText(question.text ?? '');
    if (!text) return { ...DECLINED, reason: 'This question has no text to write a scheme for.' };

    const marks = Number(question.marks) || 1;
    const optionLines = optionsToLines(question.options);

    const prompt = [
        `QUESTION TYPE: ${question.type || 'Structured'}`,
        `MARKS: ${marks}`,
        '',
        'QUESTION:',
        text,
        optionLines ? `\nOPTIONS:\n${optionLines}` : '',
    ]
        .filter(Boolean)
        .join('\n');

    let raw: string;
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: prompt },
                ],
                // The same scheme every time a question is regenerated, rather
                // than a slightly different one each admin sees.
                temperature: 0,
            }),
            signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
        });

        if (!response.ok) {
            console.error('Scheme generation HTTP error:', response.status);
            return { ...DECLINED, reason: 'The AI service could not be reached.' };
        }

        const data = await response.json();
        raw = data?.choices?.[0]?.message?.content ?? '';
    } catch (err) {
        console.error('Scheme generation call failed:', err instanceof Error ? err.message : err);
        return { ...DECLINED, reason: 'The AI service could not be reached.' };
    }

    const verdict = parseVerdict(raw);
    if (!verdict) return { ...DECLINED, reason: 'The AI reply could not be read.' };

    if (verdict.can_generate === false) {
        return {
            ...DECLINED,
            reason: typeof verdict.reason === 'string' && verdict.reason ? verdict.reason.slice(0, 200) : 'The AI could not write a scheme for this question with confidence.',
        };
    }

    const scheme = typeof verdict.marking_scheme === 'string' ? verdict.marking_scheme.trim() : '';
    if (!scheme) return { ...DECLINED, reason: 'The AI returned an empty scheme.' };

    return {
        markingScheme: scheme.slice(0, 4000),
        confidence: clampConfidence(verdict.confidence),
        reason: null,
    };
}

/**
 * Proposes schemes for many questions, within a time budget. The same
 * worker-pool shape as `aiMarkMany` in aiMarking.ts: a shared queue, a fixed
 * number of workers, and an honest "not reached" for whatever the budget did
 * not get to — never silently dropped, never guessed at to fill the gap.
 */
export async function generateSchemes(
    questions: SchemeCandidateQuestion[],
    budgetMs = GENERATION_BUDGET_MS
): Promise<Map<string, SchemeProposal>> {
    const results = new Map<string, SchemeProposal>();
    const deadline = Date.now() + budgetMs;
    const queue = [...questions];

    const worker = async () => {
        while (queue.length > 0) {
            if (Date.now() >= deadline) break;
            const item = queue.shift();
            if (!item) break;
            results.set(item.id, await generateScheme(item));
        }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, questions.length) }, worker));

    for (const q of questions) {
        if (!results.has(q.id)) {
            results.set(q.id, { ...DECLINED, reason: 'Not reached before the batch timed out. Run generation again for this one.' });
        }
    }

    return results;
}
