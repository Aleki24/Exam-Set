/**
 * WHAT A PAPER LOOKS LIKE, DECIDED ONCE
 * ----------------------------------------------------------------------------
 * A paper was being described twice: once in React for the on-screen preview and
 * again in jsPDF for the file. The two drifted, so the thing a teacher approved
 * was not the thing that came out of the printer — different spacing, different
 * marks, a rubric on one and not the other.
 *
 * This module is the single description. It takes a paper and its questions and
 * returns the finished structure of the printed page: sections, numbering,
 * cleaned text, how much room each answer needs, the examiner's mark table and
 * the rubric. It knows nothing about jsPDF or React, so both can render it and
 * neither can invent its own version of the truth.
 *
 * The shape follows a real Kenyan end-of-term paper, because that is what a
 * teacher photocopies and hands to a class: masthead, candidate details, a mark
 * table, numbered instructions, then questions with their marks in the right
 * margin and ruled space to write in.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { examTypeName } from '@/lib/catalog';

// ============================================================================
// INPUT — deliberately loose
// ============================================================================

/**
 * Papers arrive from two places with two naming conventions: snake_case rows
 * out of Postgres and camelCase objects out of the setter. Reading both here is
 * cheaper and safer than an adapter on each caller, which is where the last set
 * of mismatches came from.
 */
import { subjectProfile, type AnswerStyle, type SubjectProfile } from './subjectPaper';

export interface PaperSource {
    title?: string | null;
    subject?: string | null;
    grade_label?: string | null;
    exam_type?: string | null;
    term_slug?: string | null;
    year?: number | null;
    time_limit?: string | null;
    institution?: string | null;
    total_marks?: number | null;
    instructions?: string | null;
    code?: string | null;
}

export interface QuestionSource {
    text?: string | null;
    marks?: number | null;
    type?: string | null;
    options?: any;
    sub_parts?: any;
    subParts?: any;
    answer_lines?: number | null;
    answerLines?: number | null;
    marking_scheme?: string | null;
    markingScheme?: string | null;
    topic?: string | null;
    /** Storage key of the question's diagram — see lib/figures.ts. */
    image_path?: string | null;
    imagePath?: string | null;
    image_caption?: string | null;
    imageCaption?: string | null;
    /** True when the question cannot be answered without seeing the figure. */
    image_required?: boolean | null;
    imageRequired?: boolean | null;
}

// ============================================================================
// OUTPUT
// ============================================================================

export interface LaidOutPart {
    /** "(a)", "(b)" … */
    label: string;
    text: string;
    marks: number;
    answerLines: number;
}

export interface LaidOutQuestion {
    /** Running number across the whole paper, as printed. */
    number: number;
    text: string;
    marks: number;
    type: string;
    /** Lettered choices, empty for everything that is not multiple choice. */
    options: string[];
    /** True when every option is short enough to set two to a line. */
    optionsFitTwoColumns: boolean;
    parts: LaidOutPart[];
    /** Ruled lines under the question itself; 0 when the parts carry them. */
    answerLines: number;
    /**
     * The diagram this question is about, if it has one.
     *
     * A third of the questions on a Kenyan paper carry one — a gradient graph,
     * a net, concentric arcs — and they are often the higher-mark ones. Without
     * it the question prints as text that cannot be answered, which is worse
     * than not printing it at all.
     */
    figure: LaidOutFigure | null;
}

export interface LaidOutFigure {
    /** Storage key, resolved to a URL by the caller that has network access. */
    key: string;
    caption: string | null;
    /** When true, a paper that cannot show the figure should not use the question. */
    required: boolean;
}

export interface PaperSection {
    /** "SECTION A", or null when the paper is a single run of questions. */
    label: string | null;
    title: string | null;
    instruction: string | null;
    marks: number;
    questions: LaidOutQuestion[];
}

export interface RubricBand {
    code: string;
    name: string;
    /** "48 – 60" — the actual marks, not a percentage a teacher must convert. */
    range: string;
    percent: string;
}

export interface ExaminerRow {
    /** "1 – 5" for a section, or "1" for a single question. */
    label: string;
    marks: number;
}

export interface PaperIdentity {
    institution: string | null;
    title: string;
    subject: string;
    /** "Grade 8", "Form 4" — the level, printed on every page. */
    level: string | null;
    examType: string | null;
    term: string | null;
    year: number | null;
    duration: string | null;
    /** The one-line context strip: level · subject · exam type · term · year. */
    context: string;
    /** Short identifier for the running header, e.g. "Mathematics · Grade 8". */
    runningLabel: string;
}

export interface PaperLayout {
    identity: PaperIdentity;
    /**
     * The conventions this subject's papers follow — where the answer goes and
     * what the rubric says. See `services/subjectPaper.ts`.
     */
    profile: SubjectProfile;
    /** Shorthand for `profile.answerStyle`; the renderer reads it on every question. */
    answerStyle: AnswerStyle;
    instructions: string[];
    sections: PaperSection[];
    questions: LaidOutQuestion[];
    totalMarks: number;
    questionCount: number;
    examinerRows: ExaminerRow[];
    /** Present only for CBC levels, where it is part of the real paper. */
    rubric: RubricBand[] | null;
}

// ============================================================================
// LAYOUT
// ============================================================================

export function layoutPaper(paper: PaperSource, source: QuestionSource[]): PaperLayout {
    const profile = subjectProfile(paper.subject);
    const questions = (source ?? []).map((q, i) => layoutQuestion(q, i + 1, profile));
    return assemble(paper, questions, splitIntoSections(questions), 'en');
}

/**
 * A section as the paper's format declared it, rather than as the running order
 * suggests. Kept deliberately small: a label, what to call it, what to tell the
 * candidate, and the questions that belong to it.
 */
export interface DeclaredSection {
    /** "SECTION A", "SEHEMU A" — printed as given. */
    label: string;
    title?: string | null;
    instruction?: string | null;
    questions: QuestionSource[];
}

/**
 * Lays out a paper whose sections were decided by its format.
 *
 * `layoutPaper` has to work out where the sections are by looking at the order
 * of the questions, because a hand-set paper has no format to ask — and
 * reordering somebody's paper to fit a convention would be worse than having no
 * convention at all. A paper built from a plan does have a format, so it says so
 * here instead of leaving the renderer to guess and printing English headings on
 * a Kiswahili paper.
 *
 * Empty sections are dropped: a format may ask for thirty multiple-choice
 * questions the bank cannot supply, and a heading over nothing is worse than no
 * heading. If that leaves one section standing, the paper prints as a single
 * unlabelled run — "SECTION B" with no Section A above it would puzzle a class.
 */
export function layoutSectionedPaper(
    paper: PaperSource,
    declared: DeclaredSection[],
    language: 'en' | 'sw' = 'en'
): PaperLayout {
    const filled = (declared ?? []).filter((s) => (s.questions ?? []).length > 0);

    const profile = subjectProfile(paper.subject);

    let number = 0;
    const laidOut = filled.map((s) => ({
        declared: s,
        questions: s.questions.map((q) => layoutQuestion(q, ++number, profile)),
    }));

    const questions = laidOut.flatMap((s) => s.questions);

    const sections: PaperSection[] =
        laidOut.length > 1
            ? laidOut.map((s) => ({
                  label: s.declared.label,
                  title: s.declared.title ?? null,
                  instruction: s.declared.instruction ?? null,
                  marks: sumMarks(s.questions),
                  questions: s.questions,
              }))
            : [
                  {
                      label: null,
                      title: null,
                      instruction: laidOut[0]?.declared.instruction ?? null,
                      marks: sumMarks(questions),
                      questions,
                  },
              ];

    return assemble(paper, questions, questions.length === 0 ? [] : sections, language);
}

/**
 * A paper's declared structure, as the render surfaces pass it around.
 *
 * Optional everywhere. A paper set by hand has no format to declare and falls
 * back to inference; a paper built from a plan carries this so the preview, the
 * PDF and the marking scheme all print the same sections rather than each
 * guessing separately.
 */
export interface SectionDeclaration {
    sections: DeclaredSection[];
    language?: 'en' | 'sw';
}

/** Declared sections when there are any, inferred when there are not. */
export function layoutFor(
    paper: PaperSource,
    questions: QuestionSource[],
    declaration?: SectionDeclaration
): PaperLayout {
    if (declaration && declaration.sections.length > 0) {
        return layoutSectionedPaper(paper, declaration.sections, declaration.language ?? 'en');
    }
    return layoutPaper(paper, questions);
}

function assemble(
    paper: PaperSource,
    questions: LaidOutQuestion[],
    sections: PaperSection[],
    language: 'en' | 'sw'
): PaperLayout {
    // What the questions actually add up to wins over what the row says. A
    // stored total goes stale the moment a question is swapped out, and a paper
    // whose header claims 60 marks while its mark table adds to 20 is the kind
    // of thing a teacher notices in front of a class.
    const counted = questions.reduce((sum, q) => sum + q.marks, 0);
    const totalMarks = counted > 0 ? counted : Number(paper.total_marks) || 0;

    const profile = subjectProfile(paper.subject);

    return {
        identity: layoutIdentity(paper),
        profile,
        answerStyle: profile.answerStyle,
        instructions: buildInstructions(paper, questions, totalMarks, sections, language, profile),
        sections,
        questions,
        totalMarks,
        questionCount: questions.length,
        examinerRows: buildExaminerRows(sections, questions),
        rubric: isCbcLevel(paper.grade_label) ? buildRubric(totalMarks) : null,
    };
}

function layoutIdentity(paper: PaperSource): PaperIdentity {
    const subject = clean(paper.subject || '') || 'Subject';
    const level = clean(paper.grade_label || '') || null;
    const examType = paper.exam_type ? examTypeName(paper.exam_type) : null;
    const term = paper.term_slug ? paper.term_slug.replace('term-', 'Term ') : null;

    const context = [level, subject, examType, term, paper.year ? String(paper.year) : null]
        .filter(Boolean)
        .join('  ·  ');

    return {
        institution: clean(paper.institution || '') || null,
        title: clean(paper.title || '') || 'Examination',
        subject,
        level,
        examType,
        term,
        year: paper.year ?? null,
        duration: clean(paper.time_limit || '') || null,
        context,
        runningLabel: [subject, level].filter(Boolean).join('  ·  '),
    };
}

function layoutQuestion(q: QuestionSource, number: number, profile: SubjectProfile): LaidOutQuestion {
    const options = normaliseOptions(q.options);
    const rawParts = q.sub_parts ?? q.subParts;
    const parts: LaidOutPart[] = (Array.isArray(rawParts) ? rawParts : [])
        .map((part: any, i: number) => {
            const marks = Number(part?.marks) || 0;
            return {
                label: `(${part?.label ? String(part.label).replace(/[()]/g, '') : String.fromCharCode(97 + i)})`,
                text: cleanText(part?.text ?? ''),
                marks,
                answerLines:
                    Number(part?.answer_lines ?? part?.answerLines) ||
                    defaultAnswerLines(marks, q.type, profile),
            };
        })
        .filter((part) => part.text.length > 0);

    const marks = questionMarks(q, parts);
    const type = clean(q.type || '') || 'Short Answer';

    // `answer_lines` is 0 on effectively every row in the live bank — it was
    // written as a placeholder, not as an instruction to leave no room. Treating
    // 0 as "unspecified" is the difference between a usable paper and one with
    // nowhere to write.
    const declaredLines = Number(q.answer_lines ?? q.answerLines) || 0;
    const needsOwnLines = parts.length === 0 && options.length === 0;

    return {
        number,
        text: cleanText(q.text ?? ''),
        marks,
        type,
        options,
        optionsFitTwoColumns: options.length >= 2 && options.every((o) => o.length <= 28),
        parts,
        answerLines: needsOwnLines ? declaredLines || defaultAnswerLines(marks, type, profile) : 0,
        figure: layoutFigure(q),
    };
}

function layoutFigure(q: QuestionSource): LaidOutFigure | null {
    const key = clean(String(q.image_path ?? q.imagePath ?? ''));
    if (!key) return null;
    return {
        key,
        caption: clean(String(q.image_caption ?? q.imageCaption ?? '')) || null,
        required: Boolean(q.image_required ?? q.imageRequired),
    };
}

/** Sub-parts carry their own marks when they have them; otherwise the parent's. */
function questionMarks(q: QuestionSource, parts: LaidOutPart[]): number {
    const partTotal = parts.reduce((sum, p) => sum + p.marks, 0);
    if (partTotal > 0) return partTotal;
    return Number(q.marks) || 0;
}

/**
 * Kenyan papers are set in sections, and the commonest split by far is objective
 * questions first and structured questions after.
 *
 * Sections are only introduced when the paper already reads that way — all the
 * objective questions before all the rest. Reordering somebody's paper to fit a
 * convention would be worse than not having the convention: the setter chose
 * that running order deliberately.
 */
function splitIntoSections(questions: LaidOutQuestion[]): PaperSection[] {
    if (questions.length === 0) return [];

    const isObjective = (q: LaidOutQuestion) => q.type === 'Multiple Choice' || q.type === 'True/False';
    const objective = questions.filter(isObjective);
    const rest = questions.filter((q) => !isObjective(q));

    const cleanlySplit =
        objective.length > 0 &&
        rest.length > 0 &&
        objective[objective.length - 1].number < rest[0].number;

    if (!cleanlySplit) {
        return [
            {
                label: null,
                title: null,
                instruction: null,
                marks: sumMarks(questions),
                questions,
            },
        ];
    }

    return [
        {
            label: 'SECTION A',
            title: 'Objective Questions',
            instruction: 'Answer ALL the questions in this section.',
            marks: sumMarks(objective),
            questions: objective,
        },
        {
            label: 'SECTION B',
            title: 'Structured Questions',
            instruction: 'Answer ALL the questions in the spaces provided.',
            marks: sumMarks(rest),
            questions: rest,
        },
    ];
}

const sumMarks = (questions: LaidOutQuestion[]) => questions.reduce((sum, q) => sum + q.marks, 0);

/**
 * Instructions to candidates.
 *
 * Whatever the setter typed wins — it is their paper. Any numbering they typed
 * is stripped and reapplied so the list is consistent whether they numbered it
 * or not. When they left the box empty the paper still needs instructions, so a
 * standard Kenyan set is written from what the paper actually is.
 */
function buildInstructions(
    paper: PaperSource,
    questions: LaidOutQuestion[],
    totalMarks: number,
    sections: PaperSection[],
    language: 'en' | 'sw' = 'en',
    profile: SubjectProfile = subjectProfile(paper.subject)
): string[] {
    const typed = (paper.instructions ?? '')
        .split('\n')
        .map((line) => line.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, '').trim())
        .filter(Boolean);

    if (typed.length > 0) return typed;
    if (questions.length === 0) return [];

    // A Kiswahili paper with English rubrics at the top is not a Kiswahili
    // paper. The section headings come from the format; these do not, so they
    // are written here in both languages rather than left in one.
    if (language === 'sw') {
        const lines = [
            'Andika jina lako, nambari yako ya usajili na darasa katika nafasi ulizoachiwa hapo juu.',
            sections.length > 1
                ? 'Jibu maswali YOTE katika SEHEMU ZOTE mbili katika nafasi ulizoachiwa.'
                : 'Jibu maswali YOTE katika nafasi ulizoachiwa.',
            'Onyesha kazi yako yote pale inapohitajika.',
        ];
        if (totalMarks > 0) lines.push(`Karatasi hii ina jumla ya alama ${totalMarks}.`);
        if (paper.time_limit) lines.push(`Umepewa muda wa ${clean(paper.time_limit)} kukamilisha karatasi hii.`);
        lines.push('Andika majibu yako katika nafasi ulizoachiwa kwa kutumia kalamu ya wino wa buluu au mweusi.');
        // Only the Kiswahili profile's lines are in Kiswahili; anything else
        // would put an English sentence on a Kiswahili paper, which is the
        // thing this branch exists to prevent.
        if (profile.family === 'kiswahili') lines.push(...profile.instructions);
        return lines;
    }

    const lines = [
        'Write your name, admission number and class in the spaces provided above.',
        sections.length > 1
            ? 'Answer ALL the questions in BOTH sections in the spaces provided.'
            : 'Answer ALL the questions in the spaces provided.',
    ];

    if (totalMarks > 0) {
        lines.push(`The maximum mark for this paper is ${totalMarks} marks.`);
    }
    if (paper.time_limit) {
        lines.push(`You are allowed ${clean(paper.time_limit)} to complete this paper.`);
    }

    /*
     * The subject's own rules come last, which is where a real paper prints
     * them — after the housekeeping and immediately above the questions. A
     * Mathematics paper says what may be used and that working earns marks; a
     * Chemistry paper mentions the Periodic Table; a History paper says answer
     * in English. That line-up is the whole difference between a paper a
     * teacher recognises and one that was clearly generated.
     */
    lines.push(...profile.instructions);

    // Only for papers that rule lines. On a maths paper the pen colour is the
    // least of it, and the rubric above has already said where working goes.
    if (profile.answerStyle === 'ruled') {
        lines.push('Write your answers in the spaces provided using a blue or black pen.');
    }

    return lines;
}

/**
 * The "For Examiner's Use" table.
 *
 * One row per section when the paper has sections, otherwise one row per
 * question — but a fifty-question objective paper does not get fifty rows, it
 * gets sensible bands, which is what a printed paper does too.
 */
function buildExaminerRows(sections: PaperSection[], questions: LaidOutQuestion[]): ExaminerRow[] {
    if (questions.length === 0) return [];

    if (sections.length > 1) {
        return sections.map((section) => ({
            label: `${section.label ?? ''} (${section.questions[0].number}–${
                section.questions[section.questions.length - 1].number
            })`.trim(),
            marks: section.marks,
        }));
    }

    if (questions.length <= 20) {
        return questions.map((q) => ({ label: String(q.number), marks: q.marks }));
    }

    // Band them ten at a time so the table stays a table.
    const rows: ExaminerRow[] = [];
    for (let i = 0; i < questions.length; i += 10) {
        const band = questions.slice(i, i + 10);
        rows.push({
            label: `${band[0].number}–${band[band.length - 1].number}`,
            marks: sumMarks(band),
        });
    }
    return rows;
}

/** CBC grades are "PP1", "PP2", "Grade 1"… Forms are 8-4-4 and have no rubric. */
function isCbcLevel(gradeLabel?: string | null): boolean {
    if (!gradeLabel) return false;
    return /^\s*(pp\s*\d|grade\s*\d)/i.test(gradeLabel);
}

/**
 * The CBC performance bands, with the mark range each one actually means for
 * this paper. An empty four-box grid is decoration; a teacher cannot mark
 * against it. Converting the percentages into marks once, here, is the
 * difference between a rubric and a picture of one.
 */
function buildRubric(totalMarks: number): RubricBand[] {
    const bands: { code: string; name: string; from: number; to: number }[] = [
        { code: 'EE', name: 'Exceeding Expectation', from: 80, to: 100 },
        { code: 'ME', name: 'Meeting Expectation', from: 60, to: 79 },
        { code: 'AE', name: 'Approaching Expectation', from: 40, to: 59 },
        { code: 'BE', name: 'Below Expectation', from: 0, to: 39 },
    ];

    return bands.map((band) => {
        const percent = `${band.from}–${band.to}%`;
        if (totalMarks <= 0) return { code: band.code, name: band.name, range: '—', percent };

        const low = Math.ceil((band.from / 100) * totalMarks);
        const high = Math.floor((band.to / 100) * totalMarks);
        const top = Math.max(low, high);
        return {
            code: band.code,
            name: band.name,
            range: low === top ? `${low}` : `${low} – ${top}`,
            percent,
        };
    });
}

// ============================================================================
// TEXT
// ============================================================================

/**
 * Questions may carry light HTML from the rich-text editor, and a good part of
 * the bank was imported from markdown. The printed page is plain text, so the
 * markup is resolved rather than printed literally — a paper reading
 * "&lt;p&gt;What is photosynthesis?&lt;/p&gt;" is not a paper, and neither is one
 * reading "The **four main points of a compass**".
 */
export function cleanText(value: string): string {
    if (!value) return '';
    return value
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
        .replace(/<li[^>]*>/gi, '• ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/(?<![\w*])\*([^*\n]+)\*(?![\w*])/g, '$1')
        .replace(/(?<![\w_])__([^_\n]+)__(?![\w_])/g, '$1')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

const clean = (value: string): string => cleanText(value).replace(/\n+/g, ' ').trim();

export function normaliseOptions(options: any): string[] {
    if (!options) return [];
    const raw: unknown[] = Array.isArray(options)
        ? options
        : typeof options === 'object'
          ? Object.values(options)
          : [];

    return raw
        .map((o) => (typeof o === 'string' ? o : ((o as any)?.text ?? (o as any)?.label ?? '')))
        .map((o: string) => cleanText(o))
        .filter((o: string) => o.length > 0);
}

/**
 * Writing space proportional to what is being asked for.
 *
 * Kept tight on purpose. Two lines for a ten-mark essay is useless, but so is a
 * paper that runs to twelve pages because every one-mark question was given
 * half of one — this gets photocopied for a whole class.
 *
 * Measured in line-units whichever way it is drawn, so a ruled paper and a
 * blank-space paper paginate through exactly the same arithmetic. The subject
 * scales it: working needs more room than a sentence, because a candidate sets
 * out four steps down the page where a prose answer runs across it.
 */
export function defaultAnswerLines(
    marks: number,
    type?: string | null,
    profile?: SubjectProfile
): number {
    if (type === 'Multiple Choice' || type === 'True/False') return 0;

    const base = essayOrShort(marks, type);
    const scale = profile?.spaceScale ?? 1;
    if (scale === 1) return base;

    /*
     * The cap rises with the scale rather than staying put. Clamping a maths
     * paper to the prose ceiling is what would make a twelve-mark construction
     * question print with the same room as a four-mark one, which is the exact
     * complaint this is here to fix.
     */
    return Math.min(Math.round(20 * scale), Math.max(2, Math.round(base * scale)));
}

function essayOrShort(marks: number, type?: string | null): number {
    if (type === 'Essay') return Math.min(16, Math.max(8, Math.ceil(marks * 1.2)));
    if (marks <= 1) return 2;
    if (marks <= 3) return 3;
    if (marks <= 6) return 5;
    return Math.min(12, Math.ceil(marks * 1.1));
}

/** The marking scheme written for a question, wherever it was stored. */
export function markingSchemeOf(q: QuestionSource): string {
    return cleanText((q.marking_scheme ?? q.markingScheme ?? '') as string);
}

/** The marking scheme written for a sub-part, wherever it was stored. */
export function partMarkingScheme(part: any): string {
    return cleanText(part?.marking_scheme ?? part?.markingScheme ?? part?.answer ?? '');
}
