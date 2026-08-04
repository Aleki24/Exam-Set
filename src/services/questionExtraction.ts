/**
 * READING WHATEVER A MODEL SAYS IT FOUND, DEFENSIVELY
 * ----------------------------------------------------------------------------
 * `/api/questions/extract` asks a model to turn a document into structured
 * questions and gets back JSON it did not write. This is the part that reads
 * that JSON — not to decide whether the *content* is right (that is what the
 * human review step in `EnhancedBulkImport` is for) but to make sure a
 * malformed or out-of-range value from the model cannot reach the browser as
 * something that looks like valid data. A `type` the bank does not recognise,
 * a `marks` of -4 or "many", a `text` that is actually the whole rest of the
 * document — none of these should survive to a `<select>` rendering an unknown
 * option or a form silently accepting a broken row.
 *
 * Kept out of the route file so it can be tested without a network call: this
 * is the one part of extraction with no I/O in it at all, so it is the one
 * part that can be checked by giving it inputs and looking at what comes back.
 */

export const QUESTION_TYPES = [
    'Multiple Choice',
    'True/False',
    'Matching',
    'Fill-in-the-blank',
    'Numeric',
    'Structured',
    'Short Answer',
    'Essay',
    'Practical',
    'Oral',
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

const QUESTION_TYPE_SET: Set<string> = new Set(QUESTION_TYPES);

export const DIFFICULTIES = ['Easy', 'Medium', 'Difficult'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

const DIFFICULTY_SET: Set<string> = new Set(DIFFICULTIES);

/** However many marks a real question carries, this is well past any of them. */
const MAX_MARKS = 100;
const MAX_TEXT_LENGTH = 2000;
const MAX_SCHEME_LENGTH = 2000;
const MAX_TOPIC_LENGTH = 200;
const MAX_OPTIONS = 8;

export interface ExtractedQuestion {
    text: string;
    marks: number;
    difficulty: Difficulty;
    topic: string;
    subtopic: string;
    type: QuestionType;
    options?: string[];
    markingScheme?: string;
}

/**
 * Reads one question out of whatever the model returned. Returns null when
 * there is no usable text — every other field falls back to a safe default
 * rather than failing the whole row, because a paper genuinely does have
 * questions with no stated mark allocation, and refusing those would throw
 * away real content over a formatting gap.
 */
export function sanitiseExtractedQuestion(raw: unknown): ExtractedQuestion | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;

    const text = typeof r.text === 'string' ? r.text.trim().slice(0, MAX_TEXT_LENGTH) : '';
    if (!text) return null;

    const marksValue = Number(r.marks);
    const marks = Number.isFinite(marksValue) && marksValue > 0 ? Math.min(marksValue, MAX_MARKS) : 1;

    const type = typeof r.type === 'string' && QUESTION_TYPE_SET.has(r.type) ? (r.type as QuestionType) : 'Structured';

    const difficulty =
        typeof r.difficulty === 'string' && DIFFICULTY_SET.has(r.difficulty) ? (r.difficulty as Difficulty) : 'Medium';

    const options = Array.isArray(r.options)
        ? r.options.filter((o): o is string => typeof o === 'string' && o.trim().length > 0).slice(0, MAX_OPTIONS)
        : undefined;

    const markingScheme =
        typeof r.markingScheme === 'string' && r.markingScheme.trim()
            ? r.markingScheme.trim().slice(0, MAX_SCHEME_LENGTH)
            : undefined;

    return {
        text,
        marks,
        difficulty,
        topic: typeof r.topic === 'string' ? r.topic.trim().slice(0, MAX_TOPIC_LENGTH) : '',
        subtopic: typeof r.subtopic === 'string' ? r.subtopic.trim().slice(0, MAX_TOPIC_LENGTH) : '',
        type,
        options: options && options.length > 0 ? options : undefined,
        markingScheme,
    };
}

/**
 * Sanitises a whole batch and caps it at `max`.
 *
 * The cap exists because a batch bigger than a person can reasonably review is
 * not a batch anyone will actually review — see the module note on
 * `/api/questions/extract`. `truncated` is reported back so the UI can say so,
 * rather than silently handing back fewer questions than the document had.
 */
export function sanitiseExtractedBatch(
    raw: unknown,
    max: number
): { questions: ExtractedQuestion[]; truncated: boolean } {
    const list = Array.isArray(raw) ? raw : [];
    const cleaned = list
        .map(sanitiseExtractedQuestion)
        .filter((q): q is ExtractedQuestion => q !== null);

    return {
        questions: cleaned.slice(0, max),
        truncated: cleaned.length > max,
    };
}
