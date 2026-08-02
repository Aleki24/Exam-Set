/**
 * MARKING A WHOLE SITTING — server only
 * ----------------------------------------------------------------------------
 * Reads a session's answers, marks each one by the cheapest honest route, writes
 * the marks back, and totals the paper.
 *
 * The order is deliberate and it is about money and latency as much as accuracy:
 * anything arithmetic can settle is settled locally and for free, and only what
 * genuinely needs judgement is sent to a model. On a bank where most questions
 * carry a one-line scheme, that is the difference between a submission that
 * costs nothing and one that bills for every question on the paper.
 *
 * MARKS AVAILABLE COME FROM THE QUESTION, NEVER THE CLIENT
 *
 * `marks_possible` on a response is written from a value the browser sent — see
 * the responses route — so a client could post `marks_possible: 0` and, since a
 * percentage is score over total, hand itself a perfect paper. This file reads
 * the marks from the `questions` row instead and rewrites `marks_possible` as it
 * goes, which repairs the stored value on every submission as a side effect.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
    markLocally,
    scorePaperWithTotals,
    UNMARKED,
    type Mark,
    type MarkableQuestion,
    type ScoredPaper,
} from './markingService';
import { aiMarkMany, aiMarkingAvailable } from './aiMarking';

interface ResponseRow {
    id: string;
    question_id: string;
    response: any;
}

/** The answer text, whatever shape the client stored it in. */
function answerText(response: any): string {
    if (!response) return '';
    if (typeof response === 'string') return response;
    if (typeof response.text === 'string') return response.text;
    if (Array.isArray(response.answers)) return response.answers.join('\n');
    return '';
}

export async function markSession(supabase: any, sessionId: string): Promise<ScoredPaper> {
    const { data: responses, error: responseError } = await supabase
        .from('exam_responses')
        .select('id, question_id, response')
        .eq('session_id', sessionId);

    if (responseError) {
        console.error('Marking: could not read responses:', responseError.message);
        return { score: 0, maxScore: 0, percentage: null, markedCount: 0, unmarkedCount: 0 };
    }

    const rows: ResponseRow[] = responses ?? [];
    if (rows.length === 0) {
        return { score: 0, maxScore: 0, percentage: null, markedCount: 0, unmarkedCount: 0 };
    }

    const questionIds = [...new Set(rows.map((r) => r.question_id))];

    const { data: questionRows, error: questionError } = await supabase
        .from('questions')
        .select('id, type, marks, marking_scheme, text, topic')
        .in('id', questionIds);

    if (questionError) {
        console.error('Marking: could not read questions:', questionError.message);
        return { score: 0, maxScore: 0, percentage: null, markedCount: 0, unmarkedCount: 0 };
    }

    const questions = new Map<string, MarkableQuestion>(
        (questionRows ?? []).map((q: any) => [q.id, q as MarkableQuestion])
    );

    // Pass one: everything arithmetic can settle, for free.
    const marks = new Map<string, Mark>();
    const needsAi: { question: MarkableQuestion; answer: string }[] = [];

    for (const row of rows) {
        const question = questions.get(row.question_id);
        if (!question) {
            // The question has been deleted since the paper was sat. Not the
            // learner's doing, so it is unmarked rather than zero.
            marks.set(row.id, { ...UNMARKED, note: 'This question is no longer available.' });
            continue;
        }

        const answer = answerText(row.response);
        const local = markLocally(question, answer);

        if (local) {
            marks.set(row.id, local);
        } else {
            needsAi.push({ question, answer });
        }
    }

    // Pass two: the ones that need judgement.
    if (needsAi.length > 0) {
        if (!aiMarkingAvailable()) {
            for (const row of rows) {
                if (marks.has(row.id)) continue;
                marks.set(row.id, {
                    ...UNMARKED,
                    note: 'Written answers are not marked automatically on this deployment.',
                });
            }
        } else {
            const byQuestion = await aiMarkMany(needsAi);
            for (const row of rows) {
                if (marks.has(row.id)) continue;
                marks.set(row.id, byQuestion.get(row.question_id) ?? UNMARKED);
            }
        }
    }

    // Write each mark back with its provenance, and repair `marks_possible` from
    // the question row while we are here.
    const now = new Date().toISOString();
    const scored: { mark: Mark; marksPossible: number }[] = [];

    for (const row of rows) {
        const mark = marks.get(row.id) ?? UNMARKED;
        const available = Number(questions.get(row.question_id)?.marks) || 0;

        scored.push({ mark, marksPossible: available });

        const { error } = await supabase
            .from('exam_responses')
            .update({
                marks_awarded: mark.marksAwarded,
                is_correct: mark.isCorrect,
                marked_by: mark.markedBy,
                mark_confidence: mark.confidence,
                mark_note: mark.note,
                marked_at: now,
                marks_possible: available,
            })
            .eq('id', row.id);

        if (error) {
            console.error(`Marking: could not save mark for response ${row.id}:`, error.message);
        }
    }

    return scorePaperWithTotals(scored);
}

/**
 * A learner disagreeing with a mark.
 *
 * They may set their own mark on their own response, within the range the
 * question allows, and it is recorded as `self` so nothing later mistakes it for
 * an examiner's view. Row level security already restricts the update to
 * responses belonging to their own sessions — see migration 001 — so this does
 * not re-check ownership and must not start to.
 *
 * Allowing this is not a weakness. The alternative is a model's mark presented
 * as final on work somebody knows it got wrong, which is how a learner stops
 * trusting the diagnostics entirely. A self-mark is labelled everywhere it
 * appears, and the marks that matter — a real KNEC paper — were never these.
 */
export async function selfMark(
    supabase: any,
    responseId: string,
    marksAwarded: number
): Promise<{ ok: true } | { ok: false; error: string }> {
    const { data: row, error: readError } = await supabase
        .from('exam_responses')
        .select('id, question_id')
        .eq('id', responseId)
        .maybeSingle();

    if (readError || !row) return { ok: false, error: 'No such answer' };

    const { data: question } = await supabase
        .from('questions')
        .select('marks')
        .eq('id', row.question_id)
        .maybeSingle();

    const available = Number(question?.marks) || 0;
    if (!Number.isFinite(marksAwarded) || marksAwarded < 0 || marksAwarded > available) {
        return { ok: false, error: `Give a mark between 0 and ${available}` };
    }

    const { error } = await supabase
        .from('exam_responses')
        .update({
            marks_awarded: marksAwarded,
            is_correct: marksAwarded >= available,
            marked_by: 'self',
            mark_confidence: null,
            mark_note: 'You marked this yourself.',
            marked_at: new Date().toISOString(),
        })
        .eq('id', responseId);

    if (error) return { ok: false, error: 'Could not save your mark' };
    return { ok: true };
}
