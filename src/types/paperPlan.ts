/**
 * PAPER PLANS
 * ----------------------------------------------------------------------------
 * The shape of a paper, declared as data.
 *
 * A school does not ask for a bag of questions weighing 70 marks. It asks for
 * "Grade 9 Integrated Science: Section A, 30 multiple-choice; Section B,
 * structured; 70 marks; 1 hour 40" — a named format that is reused every term
 * and argued about by a head of department. That sentence is the product. The
 * assembler is a small thing that executes it.
 *
 * So sections are DECLARED here rather than inferred from a question ordering
 * downstream. `paperLayout` has always been able to render SECTION A / SECTION B;
 * it just had to guess at them from the running order, and the builder's sort by
 * difficulty scattered the objective questions so the guess almost never landed.
 *
 * See docs/PAPER-BUILDER-RENEWAL.md.
 */

import type { Difficulty, QuestionType } from '@/types';
import type { ExamTypeSlug, LevelSlug } from '@/lib/catalog';

/** Papers are printed in the language they are sat in, headings included. */
export type PaperLanguage = 'en' | 'sw';

/**
 * Where a format's authority comes from.
 *
 *   knec    quoted from a published national structure, with a source
 *   school  a conventional shape schools use; nobody official set it
 *   custom  a teacher built it here
 *
 * The distinction is printed, because a format that merely looks official is
 * worse than one that admits it is a convention.
 */
export type FormatOrigin = 'knec' | 'school' | 'custom';

export interface SectionPlan {
    /** 'A', 'B', 'I', 'II'. Stable — ordering and reporting both key on it. */
    id: string;
    /** The printed heading: 'SECTION A', or 'SEHEMU A' on a Kiswahili paper. */
    label: string;
    title: string;
    /** Printed verbatim beneath the heading. */
    instruction: string;

    /**
     * Which question types may appear here, in repo vocabulary —
     * 'Multiple Choice', not 'MCQ'. A structured question in the objective
     * section is a mistake, not a compromise, so this is a hard filter and the
     * assembler will leave a section short rather than substitute across it.
     */
    types: QuestionType[];

    /** Marks the candidate is scored out of in this section. */
    marks: number;

    /** How many questions to print. Absent = fill by marks. */
    questionsSet?: number;

    /**
     * How many of those the candidate actually answers.
     *
     * KCSE Mathematics Paper 1 Section II prints eight questions and asks for
     * any five. Absent means all of them are answered, which is the common case.
     */
    answerAny?: number;

    /** Set when every question in the section carries the same mark. */
    marksPerQuestion?: number;

    /** Restrict the section to these difficulties. Absent = any. */
    difficulties?: Difficulty[];
    /** Restrict the section to these strands. Absent = any. */
    strands?: string[];
}

export interface StrandWeight {
    strand: string;
    /** Share of the paper's scored marks. Shares need not sum to 100. */
    percent: number;
}

export interface PaperPlan {
    id: string;
    name: string;
    origin: FormatOrigin;

    level: LevelSlug;
    gradeLabel: string;
    subject: string;
    examType: ExamTypeSlug;

    /** What the candidate is marked out of. */
    scoredMarks: number;
    durationMinutes: number;
    language: PaperLanguage;

    sections: SectionPlan[];

    /**
     * What has actually been taught by the time this paper is sat.
     *
     * A continuous assessment test covers the term so far, not a representative
     * sample of the year. Judging a CAT against the full-year strand list marks
     * a perfectly good paper as unbalanced, and a teacher told their correct
     * paper is wrong stops reading the warnings.
     */
    coverage?: { strands: string[] };
    strandWeights?: StrandWeight[];

    difficultyMix: Record<Difficulty, number>;

    preferUnused: boolean;
    avoidDuplicates: boolean;

    /** Provenance. A format nobody has re-checked should look unchecked. */
    verifiedOn?: string;
    provisional?: boolean;
    sourceUrl?: string;
    /** Anything a setter should know before trusting it — printed in the UI. */
    note?: string;
}

// ============================================================================
// THE CATALOGUE
// ============================================================================

/**
 * A catalogue entry: one published (or conventional) format, before it is
 * pinned to a particular class.
 *
 * It differs from `PaperPlan` in carrying matchers rather than values — one
 * KJSEA Mathematics format serves Grades 7, 8 and 9, and has to match a subject
 * column that reads "Integrated Science / Health Education" as readily as
 * "Integrated Science". `resolveFormat` turns an entry into a concrete plan.
 */
export interface PaperFormat {
    id: string;
    name: string;
    origin: FormatOrigin;

    level: LevelSlug;
    /** Grade labels this format is set for, as `catalog.ts` spells them. */
    grades: string[];
    /**
     * Subject spellings this format answers to. Matched as normalised
     * substrings, because the subjects table holds composites like
     * "Pre-Technical Studies / Business Studies / Computer Studies".
     */
    subjectAliases: string[];
    /** Exam types this shape suits. Absent = any. */
    examTypes?: ExamTypeSlug[];

    scoredMarks: number;
    durationMinutes: number;
    language: PaperLanguage;
    sections: SectionPlan[];
    difficultyMix: Record<Difficulty, number>;
    strandWeights?: StrandWeight[];

    verifiedOn?: string;
    provisional?: boolean;
    sourceUrl?: string;
    note?: string;
}

// ============================================================================
// FEASIBILITY
// ============================================================================

/**
 * One thing the bank cannot supply.
 *
 * Carries its own sentence because the caller that needs this most is a teacher
 * looking at an empty bank, not a developer reading a code.
 */
export interface Deficit {
    sectionId: string;
    sectionLabel: string;
    /** Sections with a fixed question count are counted in questions. */
    unit: 'questions' | 'marks';
    need: number;
    have: number;
    missing: number;
    types: QuestionType[];
    strands?: string[];
    marksEach?: number;
    message: string;
}

export interface FeasibilityReport {
    /** True when every section can be filled from the pool as it stands. */
    fillable: boolean;
    deficits: Deficit[];

    /**
     * Questions the plan would place that carry no marking scheme. A school
     * printing forty papers needs forty schemes, and finding that out at the
     * printer is too late.
     */
    schemeGaps: number;

    /** Per-type rates — objective work is priced per question, the rest per mark. */
    estimatedMinutes: number;
    withinDuration: boolean;

    /** What the plan asks for, and what the pool could actually cover. */
    scoredMarks: number;
    coverableMarks: number;
}
