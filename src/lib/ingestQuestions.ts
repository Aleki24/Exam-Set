/**
 * INGEST — turning what a model sent into what the bank can hold.
 *
 * Separated from the route so the rules can be checked without a key, a
 * network or a database. These are the rules that decide what gets sold, so
 * they are worth being able to test cheaply and often.
 *
 * The posture throughout is that a rejected question costs a retry and an
 * accepted bad one costs a refund and a teacher's trust. Where those two
 * conflict, reject.
 */

export interface IngestQuestion {
    text?: unknown;
    marks?: unknown;
    marking_scheme?: unknown;
    topic?: unknown;
    subtopic?: unknown;
    subject?: unknown;
    grade?: unknown;
    difficulty?: unknown;
    type?: unknown;
    options?: unknown;
    answer_lines?: unknown;
    blooms_level?: unknown;
}

export interface Rejection {
    index: number;
    reason: string;
}

/** Values the columns actually accept — anything else is a silent enum error. */
const DIFFICULTY = ['Easy', 'Medium', 'Difficult'] as const;
const TYPES = [
    'Multiple Choice', 'True/False', 'Matching', 'Fill-in-the-blank', 'Numeric',
    'Structured', 'Short Answer', 'Essay', 'Practical', 'Oral',
] as const;
const BLOOMS = [
    'Knowledge', 'Understanding', 'Application', 'Analysis', 'Evaluation', 'Creation',
] as const;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const oneOf = <T extends readonly string[]>(v: unknown, allowed: T, fallback: T[number]): T[number] =>
    (allowed as readonly string[]).includes(str(v)) ? (str(v) as T[number]) : fallback;

export interface NormaliseContext {
    subjects: { id: string; name: string }[];
    grades: { id: string; name: string }[];
    createdBy: string;
}

/** Loose match, so "Grade 9" finds "Grade 9" and "grade9" does too. */
function findId(list: { id: string; name: string }[], wanted: string): string | null {
    if (!wanted) return null;
    const key = wanted.toLowerCase().replace(/[^a-z0-9]/g, '');
    const hit = list.find((r) => r.name.toLowerCase().replace(/[^a-z0-9]/g, '') === key);
    if (hit) return hit.id;
    // Then a containment match, which catches "Maths" against
    // "Mathematics" and "Integrated Science" against the combined
    // "Integrated Science / Health Education" the CBE rationalisation created.
    const loose = list.find(
        (r) => r.name.toLowerCase().includes(wanted.toLowerCase()) || wanted.toLowerCase().includes(r.name.toLowerCase())
    );
    return loose?.id ?? null;
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export function normaliseIngest(
    input: IngestQuestion[],
    ctx: NormaliseContext
): { rows: Record<string, unknown>[]; rejected: Rejection[] } {
    const rows: Record<string, unknown>[] = [];
    const rejected: Rejection[] = [];
    const seen = new Set<string>();

    input.forEach((q, index) => {
        const text = str(q.text);
        const scheme = str(q.marking_scheme);
        const marks = Number(q.marks);

        if (text.length < 10) {
            rejected.push({ index, reason: 'text is missing or too short to be a question' });
            return;
        }
        /*
         * A question with no answer is the failure this whole queue exists to
         * stop. 203 of the first 253 arrived that way, and each one prints
         * "No marking scheme recorded for this question" onto a document
         * somebody paid for. Required, not encouraged.
         */
        if (scheme.length < 2) {
            rejected.push({ index, reason: 'marking_scheme is required — a question with no answer cannot be sold' });
            return;
        }
        if (!Number.isFinite(marks) || marks < 1 || marks > 100) {
            rejected.push({ index, reason: 'marks must be a whole number between 1 and 100' });
            return;
        }

        // Within-batch duplicates. A model asked for fifty questions on one
        // strand will occasionally hand back the same one twice, and nothing
        // downstream would notice.
        const fingerprint = text.toLowerCase().replace(/\s+/g, ' ').slice(0, 160);
        if (seen.has(fingerprint)) {
            rejected.push({ index, reason: 'duplicate of an earlier question in this batch' });
            return;
        }
        seen.add(fingerprint);

        const type = oneOf(q.type, TYPES, 'Short Answer');
        const options = Array.isArray(q.options) ? q.options.map(str).filter(Boolean) : [];

        if (type === 'Multiple Choice' && options.length < 2) {
            rejected.push({ index, reason: 'a multiple-choice question needs at least two options' });
            return;
        }

        rows.push({
            text,
            marks: Math.round(marks),
            marking_scheme: scheme,
            topic: str(q.topic) || 'General',
            subtopic: str(q.subtopic) || null,
            difficulty: oneOf(q.difficulty, DIFFICULTY, 'Medium'),
            type,
            options: options.length > 0 ? options : null,
            blooms_level: oneOf(q.blooms_level, BLOOMS, 'Understanding'),
            subject_id: findId(ctx.subjects, str(q.subject)),
            grade_id: findId(ctx.grades, str(q.grade)),
            answer_lines: Number.isFinite(Number(q.answer_lines)) ? Math.round(Number(q.answer_lines)) : null,
            is_ai_generated: true,
            created_by: ctx.createdBy,
            // Set here rather than left to the column default, which is
            // 'approved' so that a teacher's own quick-add stays usable. What a
            // model wrote is precisely the case the default must not cover.
            review_status: 'pending',
        });
    });

    return { rows, rejected };
}
