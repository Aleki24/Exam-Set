/**
 * JUNIOR SCHOOL PAPER FORMATS (GRADES 7–9)
 * ----------------------------------------------------------------------------
 * KJSEA shapes, and the term-paper conventions schools build on them.
 *
 * Multiple choice is first-class here. That is the single biggest difference
 * between junior and senior: KJSEA opens nearly every theory paper with an
 * objective Section A carrying 20 or 30 marks, so a junior paper without one
 * does not look like the thing the learner will sit.
 *
 * WHAT IS QUOTED AND WHAT IS CONVENTION
 *
 * `origin: 'knec'` means the section split is quoted from a published structure
 * and `sourceUrl` says where from. `origin: 'school'` means schools commonly set
 * papers this way and nobody official said so. The distinction is printed,
 * because a format that merely looks official is worse than one that admits it
 * is a convention — a teacher can argue with a convention.
 *
 * Durations are marked in `note` where the source gave a section split but not a
 * time. An invented duration that looks authoritative is the same failure as an
 * invented topic (see the doctrine in lib/curriculum.ts).
 *
 * KJSEA is 60% written and 40% school-based assessment. These formats address
 * the written 60%.
 */

import type { PaperFormat } from '@/types/paperPlan';

const JSS_GRADES = ['Grade 7', 'Grade 8', 'Grade 9'];

/** KJSEA papers lean on application rather than recall, without abandoning it. */
const JSS_MIX = { Easy: 25, Medium: 50, Difficult: 25 };

const ANSWER_ALL = 'Answer ALL the questions in this section.';
const ANSWER_ALL_SPACES = 'Answer ALL the questions in the spaces provided.';

export const JSS_FORMATS: PaperFormat[] = [
    {
        id: 'kjsea-mathematics',
        name: 'KJSEA Mathematics',
        origin: 'knec',
        level: 'junior-school',
        grades: JSS_GRADES,
        subjectAliases: ['Mathematics'],
        examTypes: ['end-term', 'mock', 'summative'],
        scoredMarks: 100,
        durationMinutes: 120,
        language: 'en',
        difficultyMix: JSS_MIX,
        sections: [
            {
                id: 'A',
                label: 'SECTION A',
                title: 'Objective Questions',
                instruction: ANSWER_ALL,
                types: ['Multiple Choice'],
                marks: 20,
                questionsSet: 20,
                marksPerQuestion: 1,
            },
            {
                id: 'B',
                label: 'SECTION B',
                title: 'Structured Questions',
                instruction: ANSWER_ALL_SPACES,
                types: ['Structured', 'Short Answer', 'Numeric'],
                marks: 80,
            },
        ],
        verifiedOn: '2026-08-06',
        sourceUrl: 'https://nation.africa/kenya/news/education/how-grade-9-learners-will-be-examined-5172378',
    },

    {
        id: 'kjsea-integrated-science',
        name: 'KJSEA Integrated Science (Theory)',
        origin: 'knec',
        level: 'junior-school',
        grades: JSS_GRADES,
        subjectAliases: ['Integrated Science', 'Health Education', 'General Science'],
        examTypes: ['end-term', 'mock', 'summative'],
        scoredMarks: 70,
        durationMinutes: 100,
        language: 'en',
        difficultyMix: JSS_MIX,
        sections: [
            {
                id: 'A',
                label: 'SECTION A',
                title: 'Objective Questions',
                instruction: ANSWER_ALL,
                types: ['Multiple Choice'],
                marks: 30,
                questionsSet: 30,
                marksPerQuestion: 1,
            },
            {
                id: 'B',
                label: 'SECTION B',
                title: 'Structured Questions',
                instruction: ANSWER_ALL_SPACES,
                types: ['Structured', 'Short Answer'],
                marks: 40,
            },
        ],
        verifiedOn: '2026-08-06',
        sourceUrl: 'https://cbc.co.ke/a-look-at-grade-9-kjsea-exam-papers-and-question-setups/',
        note: 'Section split is from the published structure; the duration is the common school allowance, not a quoted figure. Integrated Science also carries a practical paper this format does not cover.',
    },

    {
        id: 'kjsea-agriculture-nutrition',
        name: 'KJSEA Agriculture and Nutrition',
        origin: 'knec',
        level: 'junior-school',
        grades: JSS_GRADES,
        subjectAliases: ['Agriculture', 'Nutrition', 'Home Science'],
        examTypes: ['end-term', 'mock', 'summative'],
        scoredMarks: 70,
        durationMinutes: 100,
        language: 'en',
        difficultyMix: JSS_MIX,
        sections: [
            {
                id: 'A',
                label: 'SECTION A',
                title: 'Objective Questions',
                instruction: ANSWER_ALL,
                types: ['Multiple Choice'],
                marks: 30,
                questionsSet: 30,
                marksPerQuestion: 1,
            },
            {
                id: 'B',
                label: 'SECTION B',
                title: 'Structured Questions',
                instruction: ANSWER_ALL_SPACES,
                types: ['Structured', 'Short Answer'],
                marks: 40,
            },
        ],
        provisional: true,
        verifiedOn: '2026-08-06',
        note: 'Follows the 30-mark objective pattern KJSEA uses across the practical learning areas. Confirm against the current KNEC structure before a school sits it.',
    },

    {
        id: 'kjsea-social-studies',
        name: 'KJSEA Social Studies',
        origin: 'knec',
        level: 'junior-school',
        grades: JSS_GRADES,
        subjectAliases: ['Social Studies', 'Life Skills'],
        examTypes: ['end-term', 'mock', 'summative'],
        scoredMarks: 100,
        durationMinutes: 120,
        language: 'en',
        difficultyMix: JSS_MIX,
        sections: [
            {
                id: 'A',
                label: 'SECTION A',
                title: 'Objective Questions',
                instruction: ANSWER_ALL,
                types: ['Multiple Choice'],
                marks: 20,
                questionsSet: 20,
                marksPerQuestion: 1,
            },
            {
                id: 'B',
                label: 'SECTION B',
                title: 'Structured Questions',
                instruction: ANSWER_ALL_SPACES,
                types: ['Structured', 'Short Answer'],
                marks: 80,
            },
        ],
        provisional: true,
        verifiedOn: '2026-08-06',
        note: 'Follows the 20-mark objective pattern KJSEA uses for the humanities. Confirm against the current KNEC structure before a school sits it.',
    },

    {
        id: 'kjsea-religious-education',
        name: 'KJSEA Religious Education (CRE / IRE / HRE)',
        origin: 'knec',
        level: 'junior-school',
        grades: JSS_GRADES,
        subjectAliases: ['Religious Education'],
        examTypes: ['end-term', 'mock', 'summative'],
        scoredMarks: 100,
        durationMinutes: 120,
        language: 'en',
        difficultyMix: JSS_MIX,
        sections: [
            {
                id: 'A',
                label: 'SECTION A',
                title: 'Objective Questions',
                instruction: ANSWER_ALL,
                types: ['Multiple Choice'],
                marks: 20,
                questionsSet: 20,
                marksPerQuestion: 1,
            },
            {
                id: 'B',
                label: 'SECTION B',
                title: 'Structured Questions',
                instruction: ANSWER_ALL_SPACES,
                types: ['Structured', 'Short Answer', 'Essay'],
                marks: 80,
            },
        ],
        provisional: true,
        verifiedOn: '2026-08-06',
        note: 'Follows the 20-mark objective pattern KJSEA uses for the humanities. Confirm against the current KNEC structure before a school sits it.',
    },

    {
        id: 'kjsea-pre-technical',
        name: 'KJSEA Pre-Technical Studies',
        origin: 'knec',
        level: 'junior-school',
        grades: JSS_GRADES,
        subjectAliases: ['Pre-Technical', 'Business Studies', 'Computer Studies', 'Computer Science'],
        examTypes: ['end-term', 'mock', 'summative'],
        scoredMarks: 70,
        durationMinutes: 100,
        language: 'en',
        difficultyMix: JSS_MIX,
        sections: [
            {
                id: 'A',
                label: 'SECTION A',
                title: 'Objective Questions',
                instruction: ANSWER_ALL,
                types: ['Multiple Choice'],
                marks: 30,
                questionsSet: 30,
                marksPerQuestion: 1,
            },
            {
                id: 'B',
                label: 'SECTION B',
                title: 'Structured Questions',
                instruction: ANSWER_ALL_SPACES,
                types: ['Structured', 'Short Answer'],
                marks: 40,
            },
        ],
        provisional: true,
        verifiedOn: '2026-08-06',
        note: 'Follows the 30-mark objective pattern KJSEA uses across the practical learning areas. Confirm against the current KNEC structure before a school sits it.',
    },

    {
        id: 'kjsea-english-paper-1',
        name: 'KJSEA English Paper 1 (Language)',
        origin: 'knec',
        level: 'junior-school',
        grades: JSS_GRADES,
        subjectAliases: ['English'],
        examTypes: ['end-term', 'mock', 'summative'],
        scoredMarks: 50,
        durationMinutes: 100,
        language: 'en',
        difficultyMix: JSS_MIX,
        sections: [
            {
                id: 'A',
                label: 'SECTION A',
                title: 'Reading Comprehension',
                instruction: ANSWER_ALL,
                types: ['Multiple Choice'],
                marks: 20,
                marksPerQuestion: 1,
            },
            {
                id: 'B',
                label: 'SECTION B',
                title: 'Grammar and Language Use',
                instruction: ANSWER_ALL,
                types: ['Multiple Choice', 'Fill-in-the-blank'],
                marks: 15,
                marksPerQuestion: 1,
            },
            {
                id: 'C',
                label: 'SECTION C',
                title: 'Oral and Listening Skills',
                instruction: ANSWER_ALL,
                types: ['Multiple Choice', 'Short Answer'],
                marks: 15,
                marksPerQuestion: 1,
            },
        ],
        provisional: true,
        verifiedOn: '2026-08-06',
        sourceUrl: 'https://cbc.co.ke/a-look-at-grade-9-kjsea-exam-papers-and-question-setups/',
        note: 'Paper 1 is largely objective and covers comprehension, grammar and oral skills; the split between those three is this format’s reading, not a quoted one. Composition and literature sit in Paper 2.',
    },

    {
        id: 'kjsea-kiswahili-karatasi-1',
        name: 'KJSEA Kiswahili Karatasi ya 1 (Lugha)',
        origin: 'knec',
        level: 'junior-school',
        grades: JSS_GRADES,
        subjectAliases: ['Kiswahili'],
        examTypes: ['end-term', 'mock', 'summative'],
        scoredMarks: 50,
        durationMinutes: 100,
        language: 'sw',
        difficultyMix: JSS_MIX,
        sections: [
            {
                id: 'A',
                label: 'SEHEMU A',
                title: 'Ufahamu',
                instruction: 'Jibu maswali YOTE katika sehemu hii.',
                types: ['Multiple Choice'],
                marks: 20,
                marksPerQuestion: 1,
            },
            {
                id: 'B',
                label: 'SEHEMU B',
                title: 'Sarufi na Matumizi ya Lugha',
                instruction: 'Jibu maswali YOTE katika sehemu hii.',
                types: ['Multiple Choice', 'Fill-in-the-blank'],
                marks: 30,
                marksPerQuestion: 1,
            },
        ],
        provisional: true,
        verifiedOn: '2026-08-06',
        sourceUrl: 'https://cbc.co.ke/a-look-at-grade-9-kjsea-exam-papers-and-question-setups/',
        note: 'Karatasi ya 1 ni ya lugha na huwa na maswali ya kuchagua; mgawanyo wa alama hapa ni wa kawaida, si wa KNEC. Insha na fasihi ziko Karatasi ya 2.',
    },

    // ------------------------------------------------------------------------
    // School conventions — not KNEC, and labelled so.
    // ------------------------------------------------------------------------

    {
        id: 'jss-cat',
        name: 'Junior School CAT',
        origin: 'school',
        level: 'junior-school',
        grades: JSS_GRADES,
        subjectAliases: [],
        examTypes: ['cat', 'opener', 'topical'],
        scoredMarks: 30,
        durationMinutes: 40,
        language: 'en',
        difficultyMix: { Easy: 40, Medium: 45, Difficult: 15 },
        sections: [
            {
                id: 'A',
                label: 'SECTION A',
                title: 'Objective Questions',
                instruction: ANSWER_ALL,
                types: ['Multiple Choice', 'True/False'],
                marks: 10,
                questionsSet: 10,
                marksPerQuestion: 1,
            },
            {
                id: 'B',
                label: 'SECTION B',
                title: 'Structured Questions',
                instruction: ANSWER_ALL_SPACES,
                types: ['Structured', 'Short Answer', 'Numeric'],
                marks: 20,
            },
        ],
        note: 'A continuous assessment test covers the term so far. Set its coverage to the strands actually taught, or the balance report will judge it against a syllabus it was never meant to sample.',
    },

    {
        id: 'jss-mid-term',
        name: 'Junior School Mid-Term',
        origin: 'school',
        level: 'junior-school',
        grades: JSS_GRADES,
        subjectAliases: [],
        examTypes: ['mid-term'],
        scoredMarks: 60,
        durationMinutes: 80,
        language: 'en',
        difficultyMix: { Easy: 35, Medium: 45, Difficult: 20 },
        sections: [
            {
                id: 'A',
                label: 'SECTION A',
                title: 'Objective Questions',
                instruction: ANSWER_ALL,
                types: ['Multiple Choice', 'True/False'],
                marks: 20,
                questionsSet: 20,
                marksPerQuestion: 1,
            },
            {
                id: 'B',
                label: 'SECTION B',
                title: 'Structured Questions',
                instruction: ANSWER_ALL_SPACES,
                types: ['Structured', 'Short Answer', 'Numeric'],
                marks: 40,
            },
        ],
    },
];
