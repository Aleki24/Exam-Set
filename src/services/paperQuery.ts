/**
 * PARSING WHAT SOMEBODY TYPED INTO A CATALOG QUERY
 * ----------------------------------------------------------------------------
 * "i want form 4 mathematics term 3 exam" -> { grade: 'Form 4',
 *                                              subject: 'Mathematics',
 *                                              term: 'term-3',
 *                                              examType: 'end-term' }
 *
 * Deliberately a matcher rather than a language model. The vocabulary is closed
 * and small — six levels, fifteen grades, twenty-five exam types, three terms —
 * so a lookup is faster, free, identical every time, and can report precisely
 * which part of the sentence it failed to understand. A model would add a
 * network round trip and a bill to the most common request on the platform, and
 * could still invent a subject that is not stocked.
 *
 * The parser never invents filters. Words it does not recognise are dropped
 * rather than passed through as a search term, because "i want" and "please"
 * would otherwise match nothing and turn a good query into an empty result.
 */

import {
    ALL_GRADES,
    EXAM_TYPES,
    LEVELS,
    TERMS,
    catalogYears,
    levelForGrade,
    type ExamTypeSlug,
    type LevelSlug,
    type TermSlug,
} from '@/lib/catalog';

export interface ParsedQuery {
    grade?: string;
    level?: LevelSlug;
    subject?: string;
    examType?: ExamTypeSlug;
    term?: TermSlug;
    year?: number;
    /** Whatever was left after the known words were consumed. */
    leftover: string;
    /** True when nothing at all was recognised. */
    empty: boolean;
}

// ----------------------------------------------------------------------------
// Normalisation
// ----------------------------------------------------------------------------

/** Lowercase, strip punctuation, collapse whitespace. */
function normalise(input: string): string {
    return input
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Number words, because people type "form four" as often as "form 4".
 * Only 1-12 — the range of grades and forms that exist.
 */
const NUMBER_WORDS: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    first: 1, second: 2, third: 3,
};

function digitsFor(word: string): number | null {
    if (/^\d+$/.test(word)) return Number(word);
    return NUMBER_WORDS[word] ?? null;
}

// ----------------------------------------------------------------------------
// Subject aliases
//
// The catalog does not own the subject list — it lives in the `exams` rows, so
// it grows as stock is added. These are only the shorthands people type, mapped
// onto the canonical name; anything not listed still matches by prefix.
// ----------------------------------------------------------------------------

const SUBJECT_ALIASES: Record<string, string> = {
    maths: 'Mathematics',
    math: 'Mathematics',
    mathematics: 'Mathematics',
    eng: 'English',
    english: 'English',
    kisw: 'Kiswahili',
    kiswahili: 'Kiswahili',
    chem: 'Chemistry',
    chemistry: 'Chemistry',
    bio: 'Biology',
    biology: 'Biology',
    phy: 'Physics',
    physics: 'Physics',
    geo: 'Geography',
    geography: 'Geography',
    hist: 'History',
    history: 'History',
    cre: 'CRE',
    ire: 'IRE',
    bst: 'Business Studies',
    business: 'Business Studies',
    agri: 'Agriculture',
    agriculture: 'Agriculture',
    compute: 'Computer Studies',
    computer: 'Computer Studies',
    science: 'Science',
    'integrated science': 'Integrated Science',
    'social studies': 'Social Studies',
    'home science': 'Home Science',
};

// ----------------------------------------------------------------------------
// Exam type synonyms
//
// The catalog names are formal ("End of Term Exam"); people are not.
// ----------------------------------------------------------------------------

const EXAM_TYPE_SYNONYMS: [RegExp, ExamTypeSlug][] = [
    [/\bend\s?of\s?term\b|\bend\s?term\b|\bendterm\b|\bet\b/, 'end-term'],
    [/\bmid\s?term\b|\bmidterm\b/, 'mid-term'],
    [/\bopener\b|\bopening\b/, 'opener'],
    [/\bcounty\s?mock\b/, 'county-mock'],
    [/\bjoint\s?mock\b|\bcluster\s?mock\b/, 'joint-mock'],
    [/\bpre\s?mock\b/, 'pre-mock'],
    [/\bmock\b/, 'mock'],
    [/\btrial\b/, 'trial'],
    // A named national exam beats the generic descriptor: "kcse biology past
    // paper" is stocked as KCSE, and matching it to `past-paper` would miss it.
    [/\bkcse\b/, 'kcse'],
    [/\bkpsea\b/, 'kpsea'],
    [/\bkjsea\b/, 'kjsea'],
    [/\bpast\s?paper\b|\bpastpaper\b/, 'past-paper'],
    [/\bcat\b|\bclass\s?test\b/, 'cat'],
    [/\btopical\b/, 'topical'],
    [/\bformative\b/, 'formative'],
    [/\bsummative\b/, 'summative'],
    [/\bsba\b/, 'sba'],
    [/\bpractical\b/, 'practical'],
    [/\boral\b|\baural\b/, 'oral'],
    [/\bproject\b|\binquiry\b/, 'project'],
    [/\bholiday\b/, 'holiday'],
    [/\bentrance\b|\bplacement\b/, 'entrance'],
    [/\brevision\b|\bbooklet\b/, 'revision-booklet'],
    [/\bmarking\s?scheme\b|\bmarking\b|\banswers\b/, 'marking-scheme'],
];

// Words that carry no meaning for a catalog lookup. Removed so they cannot end
// up as a stray search term.
const STOP_WORDS = new Set([
    'i', 'want', 'need', 'please', 'send', 'me', 'get', 'give', 'a', 'an', 'the',
    'for', 'of', 'my', 'do', 'you', 'have', 'any', 'hi', 'hello', 'hey', 'kindly',
    'exam', 'exams', 'paper', 'papers', 'test', 'pdf', 'nataka', 'naomba',
]);

// ----------------------------------------------------------------------------
// The parser
// ----------------------------------------------------------------------------

/**
 * Pulls every catalog dimension it can recognise out of a sentence.
 *
 * `knownSubjects` comes from the database so the subject list stays in step with
 * what is actually stocked. Passing nothing still works — the aliases above
 * cover the common cases.
 */
export function parsePaperQuery(input: string, knownSubjects: string[] = []): ParsedQuery {
    const text = normalise(input);
    if (!text) return { leftover: '', empty: true };

    const result: ParsedQuery = { leftover: '', empty: true };
    // Tracks which words have been claimed, so the leftover is genuinely leftover.
    const consumed = new Set<number>();
    const words = text.split(' ');

    // --- Grade / form -------------------------------------------------------
    // "form 4", "form four", "grade 9", "f4", "g9", "pp2"
    for (let i = 0; i < words.length; i++) {
        const w = words[i];

        // Two-word: "form 4", "grade 9"
        if ((w === 'form' || w === 'grade' || w === 'class' || w === 'std' || w === 'standard') && i + 1 < words.length) {
            const n = digitsFor(words[i + 1]);
            if (n !== null) {
                const label = w === 'form' ? `Form ${n}` : `Grade ${n}`;
                const match = ALL_GRADES.find((g) => g.toLowerCase() === label.toLowerCase());
                if (match) {
                    result.grade = match;
                    consumed.add(i).add(i + 1);
                    break;
                }
            }
        }

        // One-word: "f4", "g9", "pp2"
        const compact = /^(f|g|pp)(\d{1,2})$/.exec(w);
        if (compact) {
            const [, prefix, num] = compact;
            const label = prefix === 'f' ? `Form ${num}` : prefix === 'g' ? `Grade ${num}` : `PP${num}`;
            const match = ALL_GRADES.find((g) => g.toLowerCase() === label.toLowerCase());
            if (match) {
                result.grade = match;
                consumed.add(i);
                break;
            }
        }
    }

    if (result.grade) {
        result.level = levelForGrade(result.grade)?.slug;
    } else {
        // No specific grade — maybe they named the level band instead.
        for (const level of LEVELS) {
            const name = level.name.toLowerCase();
            if (text.includes(name) || text.includes(level.slug.replace(/-/g, ' '))) {
                result.level = level.slug;
                break;
            }
        }
    }

    // --- Term ---------------------------------------------------------------
    // "term 3", "term three", "t3", "third term"
    const termMatch =
        /\bterm\s?(\d|one|two|three|first|second|third)\b/.exec(text) ||
        /\b(\d|one|two|three|first|second|third)\s?(?:st|nd|rd)?\s+term\b/.exec(text) ||
        /\bt([123])\b/.exec(text);
    if (termMatch) {
        const n = digitsFor(termMatch[1]);
        const term = TERMS.find((t) => t.slug === `term-${n}`);
        if (term) {
            result.term = term.slug;
            words.forEach((w, i) => {
                if (w === 'term' || digitsFor(w) === n || /^t[123]$/.test(w)) consumed.add(i);
            });
        }
    }

    // --- Year ---------------------------------------------------------------
    const validYears = new Set(catalogYears());
    for (let i = 0; i < words.length; i++) {
        const n = Number(words[i]);
        if (/^\d{4}$/.test(words[i]) && validYears.has(n)) {
            result.year = n;
            consumed.add(i);
            break;
        }
    }

    // --- Exam type ----------------------------------------------------------
    // Longest patterns first, so "county mock" beats "mock".
    for (const [pattern, slug] of EXAM_TYPE_SYNONYMS) {
        if (pattern.test(text)) {
            result.examType = slug;
            const hit = pattern.exec(text)?.[0] ?? '';
            hit.split(' ').forEach((h) => {
                const i = words.indexOf(h);
                if (i >= 0) consumed.add(i);
            });
            break;
        }
    }
    // Fall back to the formal catalog names.
    if (!result.examType) {
        for (const type of EXAM_TYPES) {
            if (text.includes(type.name.toLowerCase())) {
                result.examType = type.slug;
                break;
            }
        }
    }

    // --- Subject ------------------------------------------------------------
    // What is actually stocked wins over the alias table, so a subject added to
    // the catalog tomorrow is findable today.
    const subjectPool = knownSubjects.length > 0 ? knownSubjects : [];

    // Longest first: "integrated science" must beat "science".
    const sortedPool = [...subjectPool].sort((a, b) => b.length - a.length);
    for (const subject of sortedPool) {
        if (text.includes(subject.toLowerCase())) {
            result.subject = subject;
            subject.toLowerCase().split(' ').forEach((s) => {
                const i = words.indexOf(s);
                if (i >= 0) consumed.add(i);
            });
            break;
        }
    }

    if (!result.subject) {
        const aliasKeys = Object.keys(SUBJECT_ALIASES).sort((a, b) => b.length - a.length);
        for (const alias of aliasKeys) {
            const pattern = new RegExp(`\\b${alias.replace(/\s/g, '\\s')}\\b`);
            if (pattern.test(text)) {
                const canonical = SUBJECT_ALIASES[alias];
                // Prefer the stocked spelling when we have one.
                result.subject =
                    subjectPool.find((s) => s.toLowerCase() === canonical.toLowerCase()) ?? canonical;
                alias.split(' ').forEach((a) => {
                    const i = words.indexOf(a);
                    if (i >= 0) consumed.add(i);
                });
                break;
            }
        }
    }

    // --- Leftover -----------------------------------------------------------
    result.leftover = words
        .filter((w, i) => !consumed.has(i) && !STOP_WORDS.has(w))
        .join(' ')
        .trim();

    result.empty = !result.grade && !result.level && !result.subject && !result.examType && !result.term && !result.year;

    return result;
}

/**
 * A short, human description of what was understood, for the bot to echo back.
 * Confirming the interpretation is what stops someone paying for the wrong paper.
 */
export function describeQuery(q: ParsedQuery): string {
    const parts = [
        q.grade,
        q.subject,
        q.examType ? EXAM_TYPES.find((t) => t.slug === q.examType)?.name : null,
        q.term ? TERMS.find((t) => t.slug === q.term)?.name : null,
        q.year ? String(q.year) : null,
    ].filter(Boolean);

    return parts.join(' · ');
}
