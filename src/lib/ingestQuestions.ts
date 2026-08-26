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

/**
 * HTML DOES NOT BELONG IN A QUESTION.
 *
 * 101 questions reached the bank carrying markup — `<ol><li><p>Convert the
 * following masses…</p></li></ol>` — because a rich-text editor wrote its own
 * output straight into a plain-text column. Two things then went wrong at once.
 * The review screen prints the text as-is, so a reviewer was asked to approve
 * tag soup; and the paper renderer passes question text through
 * `LatexRenderer`, which injects with `dangerouslySetInnerHTML`, so the same
 * markup rendered silently onto the printed paper instead.
 *
 * That second path is the reason this strips rather than escapes: text arriving
 * from a contributor should never be able to reach an HTML sink at all.
 *
 * Block-level closers become newlines first, so a question whose parts were
 * separate list items does not collapse into one run-on line.
 */
export function stripHtml(value: string): string {
    return value
        .replace(/<\/(p|li|div|h[1-6]|tr)>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/\n{2,}/g, '\n')
        .trim();
}
const oneOf = <T extends readonly string[]>(v: unknown, allowed: T, fallback: T[number]): T[number] =>
    (allowed as readonly string[]).includes(str(v)) ? (str(v) as T[number]) : fallback;

export interface TaxonomyRow {
    id: string;
    name: string;
    /** Set on grades. Two rows can share a name across curricula. */
    curriculumId?: string | null;
    /**
     * Set on grades. A row with no level cannot be reached by the level filter
     * the setter uses, so it is a worse answer than one that has it — even
     * when both names match exactly.
     */
    level?: string | null;
}

export interface NormaliseContext {
    subjects: TaxonomyRow[];
    grades: TaxonomyRow[];
    /** The curriculum these questions belong to. Breaks name ties. */
    curriculumId?: string | null;
    createdBy: string;
}

const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The taxonomy row a name means, when a name does not uniquely mean one.
 *
 * `grades` holds two rows called "Grade 9" — one CBC, one IGCSE — and the same
 * for Grade 10 and Grade 11. A name-only lookup picks whichever comes back
 * first, and picking wrong is silent: the question is written, it looks correct
 * in the table, and it never appears in the setter because the row it landed on
 * has no `level` for the level filter to match. That happened to the first
 * twenty-seven questions loaded this way.
 *
 * So ties break on evidence, in order: the right curriculum, then a row that is
 * actually configured, then whatever matched.
 */
function findId(list: TaxonomyRow[], wanted: string, curriculumId?: string | null): string | null {
    if (!wanted) return null;
    const want = key(wanted);

    let candidates = list.filter((r) => key(r.name) === want);

    if (candidates.length === 0) {
        // Containment, which catches "Maths" against "Mathematics" and
        // "Integrated Science" against the combined "Integrated Science /
        // Health Education" the CBE rationalisation created.
        const lower = wanted.toLowerCase();
        candidates = list.filter(
            (r) => r.name.toLowerCase().includes(lower) || lower.includes(r.name.toLowerCase())
        );
    }
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0].id;

    const sameCurriculum = candidates.filter((r) => curriculumId && r.curriculumId === curriculumId);
    if (sameCurriculum.length === 1) return sameCurriculum[0].id;
    if (sameCurriculum.length > 1) candidates = sameCurriculum;

    // Prefer a row the filters can actually reach.
    const configured = candidates.filter((r) => r.level);
    return (configured[0] ?? candidates[0]).id;
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
        // Stripped before the length check, so markup cannot pad a question up
        // to the minimum: `<p></p><p></p>` is 14 characters and no question.
        const text = stripHtml(str(q.text));
        const scheme = stripHtml(str(q.marking_scheme));
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
            grade_id: findId(ctx.grades, str(q.grade), ctx.curriculumId),
            // Written explicitly: the setter's primary query filters on it, so a
            // question with no curriculum is invisible there no matter how well
            // its grade and subject are tagged.
            curriculum_id: ctx.curriculumId ?? null,
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
