/**
 * HOW BIG IS A PAPER, AND WHAT SHAPE IS IT
 * ----------------------------------------------------------------------------
 * Everything this app produced was laid out as though it were a full
 * end-of-term paper. A CAT is not that. It is twenty minutes and thirty marks,
 * set by a teacher on a Tuesday, and dressing it in the whole KNEC apparatus —
 * a cover page, a printing-integrity notice, a full examiner's table — makes it
 * look like something it is not and wastes a sheet of the class's paper budget.
 *
 * There is no single right total. A CAT is thirty marks, or forty, or fifty,
 * or sixty, depending on what the teacher wants; the point is not to enforce a
 * number but to know roughly what kind of document is being made, so the paper
 * can be laid out to match and a total that is obviously wrong for the kind can
 * be flagged before it is sold.
 *
 * The bounds below are advisory on purpose. `marksLookWrong` returns a sentence
 * to show somebody, never a refusal — a teacher setting a 90-mark CAT has a
 * reason, and this does not get to overrule them.
 */

import { EXAM_TYPES, type ExamTypeSlug } from '@/lib/catalog';

/** Full-length formal paper, or a short classroom assessment. */
export type ExamScale = 'full' | 'short';

export interface ExamShape {
    scale: ExamScale;
    /**
     * Whether the paper carries the full apparatus — its own cover page, the
     * "this paper consists of N printed pages" notice, the examiner's table.
     *
     * A mock and an end-of-term paper do. A class test handed out on a Tuesday
     * does not, and printing one that way costs a sheet per pupil for nothing.
     */
    formal: boolean;
    /** What teachers actually set for this, commonest first. Advisory. */
    typicalMarks: number[];
    /** Outside this range the paper is probably typed as the wrong kind. */
    minMarks: number;
    maxMarks: number;
}

const FULL: ExamShape = {
    scale: 'full',
    formal: true,
    typicalMarks: [100, 80, 60],
    minMarks: 40,
    maxMarks: 200,
};

const SHORT: ExamShape = {
    scale: 'short',
    formal: false,
    typicalMarks: [30, 40, 50, 20],
    minMarks: 10,
    maxMarks: 70,
};

/** A practical or project is marked out of far less, and takes far longer. */
const TASK: ExamShape = {
    scale: 'short',
    formal: false,
    typicalMarks: [20, 30, 40],
    minMarks: 5,
    maxMarks: 60,
};

const BY_SLUG: Partial<Record<ExamTypeSlug, ExamShape>> = {
    // Full-length, formal.
    'end-term': FULL,
    'mid-term': FULL,
    mock: FULL,
    'county-mock': FULL,
    'joint-mock': FULL,
    'pre-mock': FULL,
    trial: FULL,
    'past-paper': FULL,
    kpsea: FULL,
    kjsea: FULL,
    kcse: FULL,
    entrance: FULL,
    summative: FULL,

    // Short classroom assessment.
    cat: SHORT,
    topical: SHORT,
    formative: SHORT,
    opener: SHORT,
    holiday: SHORT,
    'revision-booklet': SHORT,

    // Coursework.
    sba: TASK,
    project: TASK,
    practical: TASK,
    oral: TASK,
};

/** The shape of this kind of paper. Unknown types are treated as full papers. */
export function examShape(slug?: string | null): ExamShape {
    if (!slug) return FULL;
    return BY_SLUG[slug as ExamTypeSlug] ?? FULL;
}

/** The human name, for a message a teacher reads. */
function typeName(slug?: string | null): string {
    return EXAM_TYPES.find((t) => t.slug === slug)?.name ?? 'paper';
}

/**
 * A sentence to show when a paper's total does not fit the kind it claims,
 * or null when it does.
 *
 * Advisory, and worded as an observation rather than an error. The commonest
 * cause is the exam type left on its default while the questions were chosen
 * for something else — a 100-mark paper still labelled "CAT / Class Test" is
 * a mislabelled paper in the shop, which a buyer discovers after paying.
 */
export function marksLookWrong(slug: string | null | undefined, totalMarks: number): string | null {
    if (!Number.isFinite(totalMarks) || totalMarks <= 0) return null;

    const shape = examShape(slug);
    const name = typeName(slug);

    if (totalMarks < shape.minMarks) {
        return (
            `${totalMarks} marks is short for a ${name} — these usually run ` +
            `${shape.typicalMarks[0]} marks or more. Check the exam type is right.`
        );
    }
    if (totalMarks > shape.maxMarks) {
        return (
            `${totalMarks} marks is long for a ${name} — these usually run up to ` +
            `${shape.maxMarks}. Check the exam type is right.`
        );
    }
    return null;
}
