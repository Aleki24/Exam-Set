/**
 * PRIMARY PAPER FORMATS (GRADES 1–6)
 * ----------------------------------------------------------------------------
 * School conventions, and nothing claiming to be more than that.
 *
 * KPSEA is sat at Grade 6 and its papers are objective-heavy, but its published
 * structure is not quoted here because it was not confirmed against a KNEC
 * source while these were written. Rather than dress a plausible guess as a
 * national format, every entry below is `origin: 'school'` — the shape schools
 * actually set for openers, mid-terms and end-terms.
 *
 * Lower primary is deliberately gentler and shorter: an hour is a long time for
 * a Grade 2 class, and a 100-mark paper at that age measures stamina.
 */

import type { PaperFormat } from '@/types/paperPlan';

const LOWER = ['Grade 1', 'Grade 2', 'Grade 3'];
const UPPER = ['Grade 4', 'Grade 5', 'Grade 6'];

const ANSWER_ALL = 'Answer ALL the questions in this section.';
const ANSWER_ALL_SPACES = 'Answer ALL the questions in the spaces provided.';

export const PRIMARY_FORMATS: PaperFormat[] = [
    {
        id: 'upper-primary-end-term',
        name: 'Upper Primary End of Term',
        origin: 'school',
        level: 'upper-primary',
        grades: UPPER,
        subjectAliases: [],
        examTypes: ['end-term', 'mid-term', 'mock', 'summative'],
        scoredMarks: 50,
        durationMinutes: 60,
        language: 'en',
        difficultyMix: { Easy: 40, Medium: 45, Difficult: 15 },
        sections: [
            {
                id: 'A',
                label: 'SECTION A',
                title: 'Objective Questions',
                instruction: ANSWER_ALL,
                types: ['Multiple Choice', 'True/False', 'Fill-in-the-blank'],
                marks: 25,
                questionsSet: 25,
                marksPerQuestion: 1,
            },
            {
                id: 'B',
                label: 'SECTION B',
                title: 'Structured Questions',
                instruction: ANSWER_ALL_SPACES,
                types: ['Structured', 'Short Answer', 'Numeric'],
                marks: 25,
            },
        ],
        note: 'A school convention, not a KNEC structure. KPSEA is sat at Grade 6 and its published format is not quoted here.',
    },

    {
        id: 'upper-primary-cat',
        name: 'Upper Primary CAT',
        origin: 'school',
        level: 'upper-primary',
        grades: UPPER,
        subjectAliases: [],
        examTypes: ['cat', 'opener', 'topical'],
        scoredMarks: 20,
        durationMinutes: 30,
        language: 'en',
        difficultyMix: { Easy: 50, Medium: 40, Difficult: 10 },
        sections: [
            {
                id: 'A',
                label: 'SECTION A',
                title: 'Questions',
                instruction: ANSWER_ALL_SPACES,
                types: ['Multiple Choice', 'True/False', 'Fill-in-the-blank', 'Short Answer'],
                marks: 20,
                questionsSet: 20,
                marksPerQuestion: 1,
            },
        ],
        note: 'Set its coverage to the strands actually taught this term.',
    },

    {
        id: 'lower-primary-assessment',
        name: 'Lower Primary Assessment',
        origin: 'school',
        level: 'lower-primary',
        grades: LOWER,
        subjectAliases: [],
        scoredMarks: 30,
        durationMinutes: 40,
        language: 'en',
        difficultyMix: { Easy: 55, Medium: 35, Difficult: 10 },
        sections: [
            {
                id: 'A',
                label: 'SECTION A',
                title: 'Questions',
                instruction: ANSWER_ALL_SPACES,
                types: ['Multiple Choice', 'True/False', 'Fill-in-the-blank', 'Matching', 'Short Answer'],
                marks: 30,
                questionsSet: 30,
                marksPerQuestion: 1,
            },
        ],
        note: 'One short run of questions rather than sections — at this age a paper divided into parts tests navigation as much as the learning area. Topics come from lib/curriculum.ts, which holds the lower primary design as a closed list.',
    },
];
