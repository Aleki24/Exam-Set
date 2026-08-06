/**
 * QUICK ADD
 * ----------------------------------------------------------------------------
 * The rules behind the fast question-entry form, kept out of the component so
 * they can be reasoned about and tested without a browser.
 *
 * WHY THIS EXISTS
 *
 * The paper builder can now say exactly what a bank is missing — "Section A
 * needs 30 one-mark Multiple Choice questions; the bank has 0" — and the two
 * existing forms both ask for a curriculum cascade, a Bloom's level and a
 * marking scheme before a single stem is saved. A worklist nobody can clear is
 * just a complaint. Quick Add is the other half: context inherited rather than
 * re-picked, and "Save & add another" as the primary action.
 *
 * THE ONE THING IT REFUSES TO SKIP
 *
 * A multiple-choice question needs its answer recorded. There is no
 * `correct_answer` column in this schema — the answer lives in `marking_scheme`,
 * which is what `markingService` reads when marking a sitting and what the
 * marking-scheme PDF prints. `planFeasibility` already counts and reports the
 * questions that have no scheme, so a fast path that produced answerless MCQs
 * would mass-produce exactly the debt the rest of the system exists to surface.
 * Two seconds on a radio button is cheaper than a paper nobody can mark.
 */

import type { Difficulty, QuestionType } from '@/types';
import type { Deficit } from '@/types/paperPlan';

/**
 * The types a teacher reaches for. The full list stays behind More options —
 * offering ten types in a form meant to take thirty seconds is how it stops
 * taking thirty seconds.
 */
export const QUICK_TYPES: QuestionType[] = [
    'Structured',
    'Multiple Choice',
    'Short Answer',
    'True/False',
    'Essay',
];

export interface QuickAddState {
    text: string;
    marks: number;
    type: QuestionType;
    topic: string;
    difficulty: Difficulty;
    /** Multiple choice only. Four empty rows by default. */
    options: string[];
    /** Which option is correct — an index into `options`, or 'True' / 'False'. */
    answer: number | 'True' | 'False' | null;
    curriculum_id: string;
    grade_id: string;
    subject_id: string;
}

export const EMPTY_QUICK_ADD: QuickAddState = {
    text: '',
    marks: 1,
    type: 'Structured',
    topic: '',
    difficulty: 'Medium',
    options: ['', '', '', ''],
    answer: null,
    curriculum_id: '',
    grade_id: '',
    subject_id: '',
};

/** Where a saved question's context is remembered between sessions. */
export const QUICK_ADD_DEFAULTS_KEY = 'exam-set-question-form-defaults';

export function needsOptions(type: QuestionType): boolean {
    return type === 'Multiple Choice';
}

/** True/False carries an answer too, without needing options typed out. */
export function needsAnswer(type: QuestionType): boolean {
    return type === 'Multiple Choice' || type === 'True/False';
}

/** Tags in, plain text out — enough to tell an empty field from a full one. */
export function plainText(value: string): string {
    return value
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export const optionLetter = (index: number): string => String.fromCharCode(65 + index);

/**
 * The marking scheme an answered objective question deserves.
 *
 * Written as "A. Nairobi" rather than either half alone, for three reasons a
 * shorter form would break:
 *
 *   - `markingService.schemeIsUsable` discards a scheme under two characters,
 *     so a bare "A" would be stored and then ignored as though absent.
 *   - the sitting UI submits the letter the candidate picked, so the letter has
 *     to be in there for any marker to match on it.
 *   - "A. Nairobi" is what a Kenyan marking scheme actually prints.
 */
export function markingSchemeFor(state: QuickAddState): string | null {
    if (!needsAnswer(state.type) || state.answer === null) return null;

    if (state.type === 'True/False') {
        return state.answer === 'True' || state.answer === 'False' ? String(state.answer) : null;
    }

    const index = typeof state.answer === 'number' ? state.answer : -1;
    const chosen = plainText(state.options[index] ?? '');
    if (!chosen) return null;
    return `${optionLetter(index)}. ${chosen}`;
}

/** The body for `POST /api/questions`. Fields the quick path never sets are omitted. */
export function quickAddPayload(state: QuickAddState): Record<string, unknown> {
    const payload: Record<string, unknown> = {
        text: state.text.trim(),
        marks: Math.max(1, Math.round(state.marks) || 1),
        type: state.type,
        topic: state.topic.trim(),
        difficulty: state.difficulty,
        curriculum_id: state.curriculum_id || null,
        grade_id: state.grade_id || null,
        subject_id: state.subject_id || null,
    };

    if (needsOptions(state.type)) {
        payload.options = state.options.map((o) => o.trim()).filter(Boolean);
    }

    const scheme = markingSchemeFor(state);
    if (scheme) payload.marking_scheme = scheme;

    return payload;
}

/**
 * What is wrong, field by field.
 *
 * Returned as a map rather than a list so each message can sit against its own
 * input. A single banner saying "check the form" makes the teacher hunt.
 */
export function validateQuickAdd(state: QuickAddState): Record<string, string> {
    const errors: Record<string, string> = {};

    if (!plainText(state.text)) errors.text = 'Type the question first.';
    if (!(state.marks >= 1)) errors.marks = 'A question is worth at least one mark.';
    if (!state.topic.trim()) errors.topic = 'Pick a topic so the question can be found again.';
    if (!state.grade_id || !state.subject_id) {
        errors.context = 'Choose a grade and subject before saving.';
    }

    if (needsOptions(state.type)) {
        const filled = state.options.filter((o) => plainText(o)).length;
        if (filled < 2) errors.options = 'Give at least two options.';
    }

    if (needsAnswer(state.type) && !markingSchemeFor(state)) {
        errors.answer = 'Mark the correct answer — without it the question cannot be marked.';
    }

    return errors;
}

/**
 * The form after a save, ready for the next question.
 *
 * Context, type, topic and difficulty all stay: a teacher clearing a deficit is
 * writing thirty of the same kind of question, and re-picking those thirty times
 * is the thing this form exists to stop.
 */
export function clearedForNext(state: QuickAddState): QuickAddState {
    return {
        ...state,
        text: '',
        marks: state.marks,
        options: needsOptions(state.type) ? state.options.map(() => '') : state.options,
        answer: null,
    };
}

/** The context worth remembering for next time. Never the question itself. */
export function defaultsFrom(state: QuickAddState) {
    return {
        curriculum_id: state.curriculum_id,
        grade_id: state.grade_id,
        subject_id: state.subject_id,
        topic: state.topic,
        type: state.type,
        difficulty: state.difficulty,
    };
}

// ============================================================================
// FROM A DEFICIT TO A FORM
// ============================================================================

/** What a feasibility deficit knows that the form can start from. */
export interface QuickPrefill {
    type?: QuestionType;
    marks?: number;
    topic?: string;
    grade_id?: string;
    subject_id?: string;
    /** The deficit's own sentence, shown as a banner. */
    reason?: string;
    /** How many are still missing, so the count can visibly fall. */
    remaining?: number;
}

/**
 * Turns "Section A needs 30 one-mark Multiple Choice questions" into a form that
 * is already set to write one.
 *
 * This is the join between the builder and the bank: without it the feasibility
 * report is a list of complaints, and with it every line on that list is one
 * click from being cleared.
 */
export function deficitToPrefill(
    deficit: Deficit,
    context: { grade_id?: string; subject_id?: string } = {}
): QuickPrefill {
    // Offer a type the quick form actually carries; fall back to the first the
    // section allows so the teacher is never shown an empty type box.
    const type = deficit.types.find((t) => QUICK_TYPES.includes(t)) ?? deficit.types[0];

    return {
        type,
        marks: deficit.marksEach ?? 1,
        topic: deficit.strands?.[0],
        grade_id: context.grade_id,
        subject_id: context.subject_id,
        reason: deficit.message,
        remaining: deficit.unit === 'questions' ? deficit.missing : undefined,
    };
}

export function applyPrefill(state: QuickAddState, prefill?: QuickPrefill): QuickAddState {
    if (!prefill) return state;
    return {
        ...state,
        type: prefill.type ?? state.type,
        marks: prefill.marks ?? state.marks,
        topic: prefill.topic ?? state.topic,
        grade_id: prefill.grade_id || state.grade_id,
        subject_id: prefill.subject_id || state.subject_id,
        answer: null,
    };
}

/**
 * Context, in the order it should win.
 *
 * What the teacher is looking at beats what they saved last time, which beats
 * nothing. Filters are the strongest signal there is: somebody filtered to
 * Grade 9 Mathematics is about to write a Grade 9 Mathematics question.
 */
export function resolveContext(
    active?: { curriculum_id?: string; grade_id?: string; subject_id?: string; topic?: string },
    remembered?: Partial<QuickAddState>
): Partial<QuickAddState> {
    return {
        curriculum_id: active?.curriculum_id || remembered?.curriculum_id || '',
        grade_id: active?.grade_id || remembered?.grade_id || '',
        subject_id: active?.subject_id || remembered?.subject_id || '',
        topic: active?.topic || remembered?.topic || '',
        type: remembered?.type ?? 'Structured',
        difficulty: remembered?.difficulty ?? 'Medium',
    };
}
