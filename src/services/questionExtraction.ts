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

/**
 * SAYING WHAT WENT WRONG
 * ----------------------------------------------------------------------------
 * Everything below turns a failure into something a person can act on, and
 * exists because the absence of it cost four rounds of guessing on one bug.
 *
 * Uploading a PDF answered "Failed to parse PDF. Please copy and paste the
 * text instead." for three unrelated faults in a row — a package whose API had
 * been rewritten, a native module missing from the deployment, then a worker
 * file missing from the deployment. Identical wording every time, so it could
 * not distinguish "this file is unusual" from "this has never once worked",
 * and each real error existed but only ever reached a server log nobody was
 * watching. Then extraction got past all three and answered "AI extraction
 * failed", which is the same mistake again one step further along.
 *
 * So causes travel with the response now. One truncated line, behind a
 * sign-in, on a tool whose users are the people who run the shop. The
 * alternative is not privacy — no stack trace is being offered — it is another
 * round of somebody guessing while uploads keep failing.
 */

/** The underlying cause of a thrown error, unwrapped one level and trimmed. */
export function errorDetail(error: unknown): string | undefined {
    const cause = error instanceof Error && error.cause !== undefined ? error.cause : error;
    if (cause instanceof Error) return `${cause.name}: ${cause.message}`.slice(0, 300);
    if (typeof cause === 'string' && cause.trim()) return cause.slice(0, 300);
    return undefined;
}

/**
 * What to tell somebody when the AI provider refuses the request.
 *
 * The document has been read successfully by this point, so the failure is
 * entirely on the provider's side — and the things that actually go wrong
 * there have completely different fixes: a key that is wrong, a key with no
 * credit, too many requests at once, a model the account cannot use. "AI
 * extraction failed" pointed at none of them.
 */
export function upstreamMessage(status: number): string {
    if (status === 401 || status === 403) {
        return 'The AI service rejected the API key. Check PERPLEXITY_API_KEY on the deployment — it is set, but not accepted.';
    }
    if (status === 402) {
        return 'The AI account has no credit left. Top it up, or paste the questions in instead.';
    }
    if (status === 429) {
        return 'The AI service is rate limiting this account. Wait a moment and try again.';
    }
    if (status === 404) {
        return 'The AI service does not recognise the configured model. The detail below names it.';
    }
    if (status === 400) {
        return 'The AI service refused the request. The detail below says why — often the configured model name.';
    }
    if (status >= 500) {
        return 'The AI service is having trouble at their end. Try again shortly, or paste the text instead.';
    }
    return 'The AI service refused the request.';
}

/** The provider's own words about a refusal, trimmed to one readable line. */
export function upstreamDetail(status: number, body: string): string {
    let message = typeof body === 'string' ? body.trim() : '';
    try {
        const parsed = JSON.parse(body);
        const found = parsed?.error?.message ?? parsed?.error ?? parsed?.detail ?? parsed?.message;
        if (typeof found === 'string' && found.trim()) message = found.trim();
        else if (found !== undefined && found !== null) message = JSON.stringify(found);
    } catch {
        // Not JSON. The raw body is still better than nothing.
    }
    return `HTTP ${status}${message ? ` — ${message.slice(0, 300)}` : ''}`;
}
