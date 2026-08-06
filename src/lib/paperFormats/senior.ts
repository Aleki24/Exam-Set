/**
 * SENIOR PAPER FORMATS
 * ----------------------------------------------------------------------------
 * Two different worlds, deliberately kept apart.
 *
 * KCSE (Form 1–4, 8-4-4) is a settled, published, structured-heavy examination
 * that schools still sit and still set mocks against. Its defining feature —
 * and the one the renewal proposal could not express — is the section that
 * prints more questions than the candidate answers: Mathematics Paper 1 sets
 * eight questions in Section II and asks for any five. A paper worth 100 marks
 * to the candidate therefore prints about 130. `answerAny` carries that, and the
 * assembler's ceiling applies to scored marks, not printed ones.
 *
 * Senior School under CBE (Grades 10–12) is not settled. KNEC ran Grade 10
 * school-based projects and practicals in Term 2 of 2026 with written tests in
 * Term 3, while KCSE continued in parallel, and no national written structure
 * has been published that mandates a shape the way KJSEA does for junior. Every
 * entry here is therefore `provisional`, and none of them forces an objective
 * section — the one thing the published senior papers agree on is that they are
 * structured and essay work throughout.
 *
 * A template written against a moving format is worse than no template, so when
 * these settle they should be re-quoted rather than quietly edited.
 */

import type { PaperFormat } from '@/types/paperPlan';

const FORMS = ['Form 1', 'Form 2', 'Form 3', 'Form 4'];
const SENIOR_GRADES = ['Grade 10', 'Grade 11', 'Grade 12'];

/** Senior papers carry more of their weight in the harder band than junior ones. */
const SENIOR_MIX = { Easy: 20, Medium: 50, Difficult: 30 };

const ANSWER_ALL_SPACES = 'Answer ALL the questions in the spaces provided.';

export const SENIOR_FORMATS: PaperFormat[] = [
    // ------------------------------------------------------------------------
    // KCSE — published, and still sat.
    // ------------------------------------------------------------------------

    {
        id: 'kcse-mathematics-paper-1',
        name: 'KCSE Mathematics Paper 1',
        origin: 'knec',
        level: 'form-1-4',
        grades: FORMS,
        subjectAliases: ['Mathematics'],
        examTypes: ['end-term', 'mock', 'summative'],
        scoredMarks: 100,
        durationMinutes: 150,
        language: 'en',
        difficultyMix: SENIOR_MIX,
        sections: [
            {
                id: 'I',
                label: 'SECTION I',
                title: 'Short Response Questions',
                instruction: 'Answer ALL the questions in this section in the spaces provided.',
                types: ['Structured', 'Short Answer', 'Numeric'],
                marks: 50,
                questionsSet: 16,
            },
            {
                id: 'II',
                label: 'SECTION II',
                title: 'Extended Response Questions',
                instruction: 'Answer any FIVE questions from this section in the spaces provided.',
                types: ['Structured', 'Numeric'],
                marks: 50,
                questionsSet: 8,
                answerAny: 5,
                marksPerQuestion: 10,
            },
        ],
        verifiedOn: '2026-08-06',
        sourceUrl:
            'https://www.studocu.com/row/document/university-of-nairobi/mathematics/maths-pp1-exam-2025-kcse-mathematics-paper-1-questions/130892744',
        note: 'Section II prints eight questions for five answers, so the paper carries about 130 printed marks against a scored total of 100.',
    },

    {
        id: 'kcse-science-theory',
        name: 'KCSE Science Theory Paper (Biology / Chemistry / Physics)',
        origin: 'knec',
        level: 'form-1-4',
        grades: FORMS,
        subjectAliases: ['Biology', 'Chemistry', 'Physics'],
        examTypes: ['end-term', 'mock', 'summative'],
        scoredMarks: 80,
        durationMinutes: 120,
        language: 'en',
        difficultyMix: SENIOR_MIX,
        sections: [
            {
                id: 'A',
                label: 'SECTION A',
                title: 'Short Response Questions',
                instruction: ANSWER_ALL_SPACES,
                types: ['Structured', 'Short Answer', 'Numeric'],
                marks: 40,
            },
            {
                id: 'B',
                label: 'SECTION B',
                title: 'Extended Response Questions',
                instruction: 'Answer any THREE questions from this section.',
                types: ['Structured', 'Essay'],
                marks: 40,
                questionsSet: 4,
                answerAny: 3,
            },
        ],
        provisional: true,
        verifiedOn: '2026-08-06',
        note: 'The two-section structured/extended shape is common to the science theory papers, but mark splits and the number of optional questions differ by subject and paper number. Check the specific paper before a school sits it.',
    },

    {
        id: 'kcse-humanities',
        name: 'KCSE Humanities (History / Geography / CRE / Business)',
        origin: 'knec',
        level: 'form-1-4',
        grades: FORMS,
        subjectAliases: [
            'History',
            'Geography',
            'Christian Religious Education',
            'Islamic Religious Education',
            'Hindu Religious Education',
            'Business Studies',
        ],
        examTypes: ['end-term', 'mock', 'summative'],
        scoredMarks: 100,
        durationMinutes: 150,
        language: 'en',
        difficultyMix: SENIOR_MIX,
        sections: [
            {
                id: 'A',
                label: 'SECTION A',
                title: 'Short Response Questions',
                instruction: ANSWER_ALL_SPACES,
                types: ['Structured', 'Short Answer'],
                marks: 25,
            },
            {
                id: 'B',
                label: 'SECTION B',
                title: 'Essay Questions',
                instruction: 'Answer any THREE questions from this section.',
                types: ['Essay', 'Structured'],
                marks: 75,
                questionsSet: 5,
                answerAny: 3,
                marksPerQuestion: 25,
            },
        ],
        provisional: true,
        verifiedOn: '2026-08-06',
        note: 'The humanities share a short-response plus optional-essay shape; the exact marks and the number of essays offered differ by subject. Check the specific paper before a school sits it.',
    },

    // ------------------------------------------------------------------------
    // Senior School under CBE — provisional, and structured throughout.
    // ------------------------------------------------------------------------

    {
        id: 'senior-cbe-structured',
        name: 'Senior School Written Test (structured)',
        origin: 'school',
        level: 'senior-school',
        grades: SENIOR_GRADES,
        subjectAliases: [],
        examTypes: ['end-term', 'mid-term', 'mock', 'summative'],
        scoredMarks: 80,
        durationMinutes: 120,
        language: 'en',
        difficultyMix: SENIOR_MIX,
        sections: [
            {
                id: 'A',
                label: 'SECTION A',
                title: 'Short Response Questions',
                instruction: ANSWER_ALL_SPACES,
                types: ['Structured', 'Short Answer', 'Numeric'],
                marks: 40,
            },
            {
                id: 'B',
                label: 'SECTION B',
                title: 'Extended Response Questions',
                instruction: 'Answer ALL the questions in this section.',
                types: ['Structured', 'Essay'],
                marks: 40,
            },
        ],
        provisional: true,
        verifiedOn: '2026-08-06',
        sourceUrl:
            'https://www.kenyans.co.ke/news/124828-knec-issues-guidelines-2026-grade-10-and-vocational-school-based-assessments',
        note: 'No national written structure has been published for Senior School the way KJSEA publishes one for junior. This is a structured-heavy school shape, deliberately forcing no objective section. Projects and practicals — a large part of the senior assessment — sit outside this builder.',
    },

    {
        id: 'senior-cbe-cat',
        name: 'Senior School CAT',
        origin: 'school',
        level: 'senior-school',
        grades: SENIOR_GRADES,
        subjectAliases: [],
        examTypes: ['cat', 'opener', 'topical'],
        scoredMarks: 30,
        durationMinutes: 40,
        language: 'en',
        difficultyMix: { Easy: 30, Medium: 50, Difficult: 20 },
        sections: [
            {
                id: 'A',
                label: 'SECTION A',
                title: 'Structured Questions',
                instruction: ANSWER_ALL_SPACES,
                types: ['Structured', 'Short Answer', 'Numeric'],
                marks: 30,
            },
        ],
        note: 'Set its coverage to the strands actually taught this term — a CAT is not a sample of the whole syllabus.',
    },
];
