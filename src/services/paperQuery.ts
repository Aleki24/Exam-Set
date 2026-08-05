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
    /**
     * The sittings named in the request — see lib/examSets.ts.
     *
     * A list because a school name on its own ("kabras") legitimately means
     * every sitting that school has published, while a full set name identifies
     * one. Populated only from sets that actually exist: this parser does not
     * invent a school any more than it invents a subject.
     */
    setIds?: string[];
    /** The set or school name as matched, for echoing back. */
    setLabel?: string;
    /** Whatever was left after the known words were consumed. */
    leftover: string;
    /** True when nothing at all was recognised. */
    empty: boolean;
}

/** The subset of an exam set this parser needs. Mirrors lib/examSets.ts. */
export interface KnownSet {
    id: string;
    name: string;
    institution?: string | null;
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
 *
 * `knownSets` does the same job for school sittings. It has to come from the
 * database for the same reason and one more: a school name is not a closed
 * vocabulary the way grades and terms are, so the only safe way to recognise
 * "Kabras" is to check whether a Kabras sitting exists. Without this list the
 * word lands in `leftover` and is thrown away, which is what happened to every
 * school name anybody typed before sets existed.
 */
export function parsePaperQuery(
    input: string,
    knownSubjects: string[] = [],
    knownSets: KnownSet[] = []
): ParsedQuery {
    let text = normalise(input);
    if (!text) return { leftover: '', empty: true };

    const result: ParsedQuery = { leftover: '', empty: true };
    // Tracks which words have been claimed, so the leftover is genuinely leftover.
    const consumed = new Set<number>();
    const words = text.split(' ');

    // --- Exam set -----------------------------------------------------------
    //
    // Runs first, and what it matches is then removed from everything that
    // follows.
    //
    // A set name contains the other dimensions: "Kabras Mock End Term 2 2025"
    // has an exam type, a term and a year inside it. Leaving those words in
    // place means the later passes read the *name* as filters and the query
    // becomes `set = Kabras 2025 AND type = end-term AND term = 2 AND year =
    // 2025` — filters nobody asked for, derived from a label. When the set's
    // papers are typed `mock` rather than `end-term`, that combination matches
    // nothing and the relaxation ladder has to unpick it.
    //
    // So the matched phrase is struck out and the rest of the sentence parses
    // normally. "kabras form 4 maths term 3" still yields the school, the grade,
    // the subject and the term, because only "kabras" was claimed.
    matchSet(text, words, consumed, knownSets, result);
    if (result.setIds?.length) {
        for (const i of consumed) words[i] = '';
        text = words.filter(Boolean).join(' ');
    }

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

    result.empty =
        !result.grade &&
        !result.level &&
        !result.subject &&
        !result.examType &&
        !result.term &&
        !result.year &&
        !result.setIds?.length;

    return result;
}

/**
 * Finds the sitting somebody named, and claims the words that named it.
 *
 * Two things can match, and the more specific one wins:
 *
 *   the set's own name   "kabras mock end term 2 2025" -> that one sitting
 *   the school name      "kabras"                      -> all its sittings
 *
 * Full names are tried first and longest-first, the same precedence trick that
 * makes "county mock" beat "mock" in the exam-type pass. Falling straight to the
 * school name would answer a request for one specific sitting with every paper
 * the school has ever published, which reads as the bot ignoring half the
 * sentence.
 *
 * Only whole words match. Without the word boundary "cre" finds "Sacred Heart"
 * and a subject request becomes a school request.
 */
function matchSet(
    text: string,
    words: string[],
    consumed: Set<number>,
    knownSets: KnownSet[],
    result: ParsedQuery
): void {
    if (knownSets.length === 0) return;

    const claim = (phrase: string) => {
        for (const word of normalise(phrase).split(' ')) {
            const i = words.indexOf(word);
            if (i >= 0) consumed.add(i);
        }
    };

    const contains = (haystack: string, needle: string) => {
        const safe = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
        return new RegExp(`\\b${safe}\\b`).test(haystack);
    };

    // Exact set names, longest first.
    const byName = [...knownSets]
        .filter((s) => s.name)
        .sort((a, b) => b.name.length - a.name.length);

    for (const set of byName) {
        const name = normalise(set.name);
        if (name && contains(text, name)) {
            result.setIds = [set.id];
            result.setLabel = set.name;
            claim(set.name);
            return;
        }
    }

    // Then the school, which may own several sittings.
    const institutions = new Map<string, { label: string; ids: string[] }>();
    for (const set of knownSets) {
        const key = normalise(set.institution ?? '');
        if (!key) continue;
        const seen = institutions.get(key) ?? { label: set.institution as string, ids: [] };
        seen.ids.push(set.id);
        institutions.set(key, seen);
    }

    const byInstitution = [...institutions.entries()].sort((a, b) => b[0].length - a[0].length);
    for (const [key, { label, ids }] of byInstitution) {
        if (contains(text, key)) {
            result.setIds = ids;
            result.setLabel = label;
            claim(label);
            return;
        }
    }
}

/**
 * A short, human description of what was understood, for the bot to echo back.
 * Confirming the interpretation is what stops someone paying for the wrong paper.
 */
export function describeQuery(q: ParsedQuery): string {
    const parts = [
        // First, because it is the most specific thing anybody said and the one
        // they will check hardest: somebody who asked for Kabras needs to see
        // "Kabras" come back before they trust the rest of the line.
        q.setLabel,
        q.grade,
        q.subject,
        q.examType ? EXAM_TYPES.find((t) => t.slug === q.examType)?.name : null,
        q.term ? TERMS.find((t) => t.slug === q.term)?.name : null,
        q.year ? String(q.year) : null,
    ].filter(Boolean);

    return parts.join(' · ');
}
