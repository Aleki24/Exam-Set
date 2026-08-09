/**
 * WHAT MAKES A MATHS PAPER A MATHS PAPER
 * ----------------------------------------------------------------------------
 * Every paper this app produced looked the same: ruled lines under every
 * question and one generic rubric at the top. That is right for History and
 * wrong for Mathematics, and a Kenyan teacher can tell at a glance.
 *
 * Two conventions matter, and both come from the subject rather than from the
 * question:
 *
 *   WHERE THE ANSWER GOES. A calculation is not written along a line. It is
 *   worked down the page — a fraction over a fraction, a long division, a
 *   force diagram in the margin — and ruled lines actively obstruct that. Look
 *   at any KCSE Mathematics, Physics or Chemistry paper and the space below
 *   each question is blank. Look at History or CRE and it is ruled. This is not
 *   decoration; a candidate given lines under a simultaneous-equations question
 *   writes smaller and shows less working, and working is where the method
 *   marks are.
 *
 *   WHAT THE RUBRIC SAYS. "Non-programmable silent electronic calculators and
 *   KNEC Mathematical tables may be used" belongs on a Mathematics paper and
 *   nowhere else. "You may use the Periodic Table" is Chemistry. "Candidates
 *   should answer the questions in English" appears on Geography and History
 *   and would be absurd on a Kiswahili paper. Each subject gets the rubric its
 *   real paper carries.
 *
 * Matched on the subject name because that is the only thing the shop reliably
 * has. Anything unrecognised falls to `general`, which is the old generic
 * behaviour — an unknown subject gets a plain, correct paper rather than a
 * wrong guess.
 */

export type AnswerStyle = 'ruled' | 'blank';

export type SubjectFamily =
    | 'mathematics'
    | 'physical-science'
    | 'life-science'
    | 'language'
    | 'kiswahili'
    | 'humanity'
    | 'business'
    | 'technical'
    | 'general';

export interface SubjectProfile {
    family: SubjectFamily;
    /**
     * `blank` leaves clear working space; `ruled` prints lines.
     *
     * See the note at the top of the file — this is the single most visible
     * difference between a paper that looks like a real one and one that does
     * not.
     */
    answerStyle: AnswerStyle;
    /**
     * How generous the space is, against the ruled-line baseline.
     *
     * Working takes more room than a sentence. A four-mark "find the value of
     * x" needs somewhere to set out three or four steps, where a four-mark
     * "state four functions" needs four short lines.
     */
    spaceScale: number;
    /**
     * The subject's own rubric lines, in the order a real paper prints them.
     *
     * Appended after the general instructions, so the paper reads: who you are,
     * what to answer, then the rules peculiar to this subject.
     */
    instructions: string[];
}

const GENERAL: SubjectProfile = {
    family: 'general',
    answerStyle: 'ruled',
    spaceScale: 1,
    instructions: [],
};

/**
 * Ordered most specific first.
 *
 * "Integrated Science" has to be tested before "Science", and "Business
 * Studies" before "Studies" would ever match anything. Matching stops at the
 * first hit, so the order below is the specification.
 */
const PROFILES: { match: RegExp; profile: SubjectProfile }[] = [
    {
        // Includes "Mathematics (Alt A)" and the CBC "Integrated Mathematics".
        match: /\bmath(s|ematic)/i,
        profile: {
            family: 'mathematics',
            answerStyle: 'blank',
            spaceScale: 1.6,
            instructions: [
                'Show all the steps in your calculations, giving your answers at each stage in the spaces provided below each question.',
                'Marks may be given for correct working even if the answer is wrong.',
                'Non-programmable silent electronic calculators and KNEC Mathematical tables may be used, except where stated otherwise.',
            ],
        },
    },
    {
        match: /\bphysics\b/i,
        profile: {
            family: 'physical-science',
            answerStyle: 'blank',
            spaceScale: 1.5,
            instructions: [
                'All working MUST be clearly shown in the spaces provided.',
                'Mathematical tables and non-programmable silent electronic calculators may be used.',
                'Take the acceleration due to gravity, g, as 10 m/s² where necessary.',
            ],
        },
    },
    {
        match: /\bchemistry\b/i,
        profile: {
            family: 'physical-science',
            answerStyle: 'blank',
            spaceScale: 1.5,
            instructions: [
                'All working MUST be clearly shown where necessary.',
                'Mathematical tables and non-programmable silent electronic calculators may be used.',
                'You may use the Periodic Table where it is required.',
            ],
        },
    },
    {
        // Biology, Integrated Science, Science and Technology, General Science,
        // Agriculture, Home Science. Prose answers with occasional diagrams.
        match: /\b(biology|science|agricultur)/i,
        profile: {
            family: 'life-science',
            answerStyle: 'ruled',
            spaceScale: 1,
            instructions: [
                'Answer the questions in English.',
                'Diagrams should be drawn in pencil and labelled where they are required.',
            ],
        },
    },
    {
        // Kiswahili and Fasihi. Tested before the language rule below so it does
        // not pick up "answer in English".
        match: /\b(kiswahili|fasihi|lugha)\b/i,
        profile: {
            family: 'kiswahili',
            answerStyle: 'ruled',
            spaceScale: 1.1,
            instructions: [
                'Jibu maswali yote kwa Kiswahili sanifu.',
                'Karatasi hii ina kurasa zilizopigwa chapa kama ilivyoonyeshwa.',
            ],
        },
    },
    {
        match: /\b(english|literature|french|german|arabic|sign language)\b/i,
        profile: {
            family: 'language',
            answerStyle: 'ruled',
            spaceScale: 1.2,
            instructions: [
                'Answer the questions in English.',
                'Candidates must answer in continuous prose where the question asks for it.',
            ],
        },
    },
    {
        // Accounting and costing questions are worked, not written.
        match: /\b(business|commerce|account|economic)/i,
        profile: {
            family: 'business',
            answerStyle: 'ruled',
            spaceScale: 1.2,
            instructions: [
                'Show all your working where a calculation is required.',
                'Answer the questions in English.',
            ],
        },
    },
    {
        /*
         * Anchored per alternative, not around the group. A trailing \b after
         * the whole group demands a boundary after "geograph", which "Geography"
         * does not have — so Geography silently fell through to the generic
         * profile. The ones written as prefixes below have no trailing anchor;
         * the ones that need one keep it, because `\bcre` without it swallows
         * "Creative Arts".
         */
        match: /\bgeograph|\bhistor|\bgovernment\b|\bsocial studies\b|\bc\.?r\.?e\b|\bi\.?r\.?e\b|\bh\.?r\.?e\b|\breligious\b|\blife skills\b|\bcitizenship\b/i,
        profile: {
            family: 'humanity',
            answerStyle: 'ruled',
            spaceScale: 1.1,
            instructions: [
                'Answer the questions in English.',
                'Sketch maps and diagrams must be drawn where they are required.',
            ],
        },
    },
    {
        // Same anchoring rule as above: "Power Mechanics" and "Electricity"
        // both carry a suffix, so neither may be closed with \b.
        match: /\bcomputer|\bict\b|\bart|\bdesign|\bmusic\b|\bwoodwork|\bmetalwork|\bbuilding\b|\bpower mechanic|\belectric|\bdrawing\b|\baviation\b|\bmedia technolog|\bpre-?technical/i,
        profile: {
            family: 'technical',
            answerStyle: 'ruled',
            spaceScale: 1.1,
            instructions: [
                'Answer the questions in English.',
                'Drawings must be made in pencil and dimensioned where they are required.',
            ],
        },
    },
];

/** The conventions a paper in this subject should follow. */
export function subjectProfile(subject?: string | null): SubjectProfile {
    const name = String(subject ?? '').trim();
    if (!name) return GENERAL;

    for (const { match, profile } of PROFILES) {
        if (match.test(name)) return profile;
    }
    return GENERAL;
}
