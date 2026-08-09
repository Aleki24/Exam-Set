/**
 * Verification harness for subject-specific paper conventions.
 *
 *   node scripts/verify-subject-paper.mjs
 *
 * Three rules, all of which a Kenyan teacher checks in the first two seconds:
 *
 *   THE COVER. Page one carries no question. It carries who the candidate is,
 *   what they may use, how long they have and what the marker adds up in.
 *
 *   THE ANSWER SPACE. A calculation is worked down the page, so Mathematics,
 *   Physics and Chemistry leave it clear. Prose is written along a line, so
 *   History and English rule them. Printing lines under a simultaneous-
 *   equations question is the single most obvious tell that a paper was
 *   generated rather than set.
 *
 *   THE RUBRIC. "KNEC Mathematical tables may be used" belongs on one subject.
 *   "You may use the Periodic Table" belongs on another. "Answer in English"
 *   must never appear on a Kiswahili paper.
 *
 * Plus the encoding guard, which is not a convention but a bug that ate whole
 * lines: a real minus sign printed as a quotation mark AND letter-spaced
 * everything around it. See services/pdfText.ts.
 *
 * No network, no storage, no database.
 */

import { inflateSync } from 'node:zlib';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
    alias: { '@': new URL('../src', import.meta.url).pathname },
    interopDefault: true,
});

const { renderPaperPdf } = await jiti.import('../src/services/paperPdf.ts');
const { layoutPaper, defaultAnswerLines } = await jiti.import('../src/services/paperLayout.ts');
const { subjectProfile } = await jiti.import('../src/services/subjectPaper.ts');
const { pdfSafe, needsTransliteration } = await jiti.import('../src/services/pdfText.ts');

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
    checks++;
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(
        `  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(52)} ${
            ok ? '' : `got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`
        }`
    );
}

function assert(label, condition, detail = '') {
    checks++;
    if (!condition) failures++;
    console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${label.padEnd(52)} ${detail}`);
}

// ---------------------------------------------------------------------------
// READING A PDF BACK, PAGE BY PAGE
// ---------------------------------------------------------------------------

function contentStreams(buf) {
    const streams = [];
    const body = buf.toString('latin1');
    // "endstream" contains "stream"; without the lookbehind every real stream
    // is followed by a phantom one.
    const re = /(?<!end)stream\r?\n/g;
    let match;
    while ((match = re.exec(body)) !== null) {
        const start = match.index + match[0].length;
        const end = body.indexOf('endstream', start);
        if (end === -1) continue;
        const raw = Buffer.from(body.slice(start, end), 'latin1');
        try {
            streams.push(inflateSync(raw).toString('latin1'));
        } catch {
            streams.push(raw.toString('latin1'));
        }
    }
    return streams;
}

function pageText(stream) {
    const shown = [];
    const re = /(?:\(((?:[^()\\]|\\.)*)\)|<([0-9A-Fa-f\s]+)>)\s*Tj/g;
    let match;
    while ((match = re.exec(stream)) !== null) {
        shown.push(
            match[1] !== undefined
                ? Buffer.from(match[1].replace(/\\([()\\])/g, '$1'), 'latin1').toString('latin1')
                : Buffer.from(match[2].replace(/\s+/g, ''), 'hex').toString('latin1')
        );
    }
    return shown.join('\n');
}

const pages = (buf) => contentStreams(buf).map(pageText);

/** Ruled writing lines show up as stroked path segments. */
const strokeCount = (stream) => (stream.match(/\sl\s/g) || []).length;
const pageStrokes = (buf) => contentStreams(buf).map(strokeCount);

// ---------------------------------------------------------------------------
// FIXTURES
// ---------------------------------------------------------------------------

const BASE = {
    title: 'END OF TERM 2 EXAMINATION',
    grade_label: 'Form 3',
    exam_type: 'end-term',
    term_slug: 'term-2',
    year: 2026,
    time_limit: '2 Hours',
    institution: 'Kabras School',
};

// Identical questions in both subjects, so any difference in the output is the
// subject and nothing else.
const QUESTIONS = [
    { text: 'Question one, which asks for something.', marks: 3, type: 'Structured' },
    { text: 'Question two, which asks for something else.', marks: 4, type: 'Structured' },
];

const maths = renderPaperPdf({ ...BASE, subject: 'Mathematics' }, QUESTIONS);
const history = renderPaperPdf({ ...BASE, subject: 'History and Government' }, QUESTIONS);

console.log('\nPage one is a cover, and question one is on page two');
{
    const text = pages(maths);
    assert('the paper has at least two pages', text.length >= 2, `${text.length} pages`);
    assert('the cover carries the rubric', text[0].includes('INSTRUCTIONS TO CANDIDATES'));
    assert('the cover carries the candidate box', text[0].includes('ADM NO:'));
    assert("the cover carries the examiner's table", text[0].includes('CANDIDATE'));
    assert('the cover carries no question', !text[0].includes('Question one'), 'page 1');
    assert('question one is on page two', text[1].includes('Question one'));
    assert('the cover sends the reader on', text[0].includes('TURN OVER FOR QUESTION 1'));

    // A paper with nothing in it must not print a cover promising a page that
    // is not there.
    const empty = renderPaperPdf({ ...BASE, subject: 'Mathematics' }, []);
    check('an empty paper is one page', pages(empty).length, 1);
}

console.log('\nA maths paper leaves room to work; a history paper rules lines');
{
    const mathsStrokes = pageStrokes(maths).slice(1).reduce((a, b) => a + b, 0);
    const historyStrokes = pageStrokes(history).slice(1).reduce((a, b) => a + b, 0);

    assert(
        'history rules writing lines under its questions',
        historyStrokes > 4,
        `${historyStrokes} segments`
    );
    /*
     * Every page carries a header rule and a footer rule, so two stroked
     * segments per page is chrome, not writing lines. The claim is that maths
     * adds nothing on top of it.
     */
    const chrome = 2 * (pages(maths).length - 1);
    assert(
        'maths draws none of them, only page chrome',
        mathsStrokes === chrome,
        `${mathsStrokes} segments, chrome is ${chrome}`
    );

    // The space still has to BE there — blank is not the same as absent.
    check('maths gives more room per mark than prose', [
        defaultAnswerLines(4, 'Structured', subjectProfile('Mathematics')) >
            defaultAnswerLines(4, 'Structured', subjectProfile('History')),
        defaultAnswerLines(4, 'Structured', subjectProfile('Mathematics')) > 0,
    ], [true, true]);

    assert(
        'so the maths paper is not shorter than the prose one',
        pages(maths).length >= pages(history).length,
        `maths ${pages(maths).length}, history ${pages(history).length}`
    );
}

console.log('\nEvery subject carries its own rubric');
{
    const rubric = (subject) => layoutPaper({ ...BASE, subject }, QUESTIONS).instructions.join(' | ');

    assert('maths names the tables and calculators', rubric('Mathematics').includes('KNEC Mathematical tables'));
    assert('maths says working earns marks', rubric('Mathematics').includes('correct working even if the answer is wrong'));
    assert('chemistry names the Periodic Table', rubric('Chemistry').includes('Periodic Table'));
    assert('physics gives g', rubric('Physics').includes('10 m/s'));
    assert('biology asks for labelled diagrams', rubric('Biology').includes('labelled'));
    assert('geography asks for sketch maps', rubric('Geography').includes('Sketch maps'));

    // The one that would be embarrassing in front of a class.
    assert(
        'a Kiswahili paper never says "in English"',
        !rubric('Kiswahili').includes('in English'),
        rubric('Kiswahili').slice(0, 60)
    );
    assert('and answers in Kiswahili sanifu', rubric('Kiswahili').includes('Kiswahili sanifu'));

    // A paper that rules no lines should not tell the candidate to write on them.
    assert(
        'maths does not mention writing on the lines',
        !rubric('Mathematics').includes('blue or black pen'),
    );
    assert('history does', rubric('History').includes('blue or black pen'));
}

console.log('\nSubjects land in the right family');
{
    const family = (s) => subjectProfile(s).family;
    const style = (s) => subjectProfile(s).answerStyle;

    check('Mathematics', [family('Mathematics'), style('Mathematics')], ['mathematics', 'blank']);
    check('Maths (short form)', style('Maths'), 'blank');
    check('Mathematics (Alt A)', style('Mathematics (Alt A)'), 'blank');
    check('Physics', [family('Physics'), style('Physics')], ['physical-science', 'blank']);
    check('Chemistry', style('Chemistry'), 'blank');
    check('Biology is prose', [family('Biology'), style('Biology')], ['life-science', 'ruled']);
    check('Integrated Science is prose', family('Integrated Science'), 'life-science');
    check('Agriculture', family('Agriculture'), 'life-science');
    check('English', [family('English'), style('English')], ['language', 'ruled']);
    check('Kiswahili beats the language rule', family('Kiswahili'), 'kiswahili');
    check('Fasihi too', family('Fasihi'), 'kiswahili');
    check('History and Government', family('History and Government'), 'humanity');
    check('C.R.E.', family('C.R.E.'), 'humanity');
    check('Business Studies', family('Business Studies'), 'business');
    check('Computer Studies', family('Computer Studies'), 'technical');
    // Each of these carries a suffix that a trailing \b would have rejected.
    check('Geography', family('Geography'), 'humanity');
    check('Power Mechanics', family('Power Mechanics'), 'technical');
    check('Electricity', family('Electricity'), 'technical');
    check('Creative Arts', family('Creative Arts'), 'technical');
    // …and this one must NOT be read as C.R.E.
    check('Creative Arts is not C.R.E.', subjectProfile('Creative Arts').family !== 'humanity', true);
    check('Home Science', family('Home Science'), 'life-science');
    check('Agriculture and Nutrition', family('Agriculture and Nutrition'), 'life-science');
    check('Pre-Technical Studies', family('Pre-Technical Studies'), 'technical');
    check('Social Studies', family('Social Studies'), 'humanity');
    check('an unknown subject is left plain', [family('Underwater Basket Weaving'), style('Underwater Basket Weaving')], ['general', 'ruled']);
    check('an empty subject is left plain', family(''), 'general');
    check('a missing subject is left plain', family(undefined), 'general');
}

console.log('\nA standard-14 font can print everything that reaches it');
{
    // The exact string that shipped broken.
    check('a real minus becomes a hyphen', pdfSafe('3(2x − 4) − 5(x + 1)'), '3(2x - 4) - 5(x + 1)');
    check('subscripts survive as digits', pdfSafe('H₂SO₄'), 'H2SO4');
    check('superscripts keep their meaning', pdfSafe('2⁵ cm'), '2^5 cm');
    check('a square root is spelled out', pdfSafe('√49'), 'sqrt49');
    check('pi is spelled out', pdfSafe('area = πr²'), 'area = pir²');
    check('an equilibrium arrow', pdfSafe('N₂ + 3H₂ ⇌ 2NH₃'), 'N2 + 3H2 <=> 2NH3');
    check('inequalities', pdfSafe('x ≤ 5 and y ≥ 2'), 'x <= 5 and y >= 2');
    check('ohms', pdfSafe('a 5 Ω resistor'), 'a 5 ohms resistor');
    check('theta', pdfSafe('sin θ'), 'sin theta');

    // These are IN cp1252 and must not be touched — half a science paper.
    check('degrees pass through', pdfSafe('156° and 60°'), '156° and 60°');
    check('squared and cubed pass through', pdfSafe('5 cm² and 3 m³'), '5 cm² and 3 m³');
    check('times and divide pass through', pdfSafe('6 × 7 ÷ 2'), '6 × 7 ÷ 2');
    check('plus-or-minus and micro pass through', pdfSafe('±3 µm'), '±3 µm');
    check('halves and quarters pass through', pdfSafe('½ and ¾'), '½ and ¾');
    check('en dashes pass through', pdfSafe('16 – 19 marks'), '16 – 19 marks');
    check('curly quotes pass through', pdfSafe("Examiner's ‘use’"), "Examiner's ‘use’");

    check('plain text is returned unchanged', pdfSafe('Evaluate 3x + 5'), 'Evaluate 3x + 5');
    check('newlines survive', pdfSafe('one\ntwo'), 'one\ntwo');
    check('an array is handled', pdfSafe(['a − b', 'c']), ['a - b', 'c']);
    check('a number is left alone', pdfSafe(42), 42);
    check('undefined is left alone', pdfSafe(undefined), undefined);

    // Anything with no spelling is dropped rather than left to eat the line.
    check('an unmapped glyph is dropped, not passed', pdfSafe('a 😀 b'), 'a  b');

    check('a clean string needs no work', needsTransliteration('Evaluate 3x + 5'), false);
    check('a minus does', needsTransliteration('3 − 1'), true);
}

console.log('\nThe encoding guard reaches the printed page, not just the helper');
{
    const buf = renderPaperPdf({ ...BASE, subject: 'Mathematics' }, [
        { text: 'Solve 3x − 2y = 8, giving x ≤ 5.', marks: 3, type: 'Structured' },
    ]);
    const text = pages(buf).join('\n');

    assert('the minus printed as a hyphen', text.includes('3x - 2y = 8'), '');
    assert('the inequality printed', text.includes('x <= 5'), '');

    /*
     * The real regression test. When jsPDF falls back to UTF-16 it writes a NUL
     * before every ASCII character — that byte pattern is the letter-spacing,
     * and it is invisible in a screenshot until you look for it.
     */
    assert(
        'no UTF-16 fallback anywhere in the document',
        !contentStreams(buf).some((s) => /\(\x00/.test(s) || /\x00[A-Za-z]\x00[A-Za-z]/.test(s)),
        ''
    );
}

console.log(
    failures === 0
        ? `\nAll ${checks} subject-paper checks passed.\n`
        : `\n${failures} of ${checks} subject-paper checks FAILED.\n`
);
process.exit(failures === 0 ? 0 : 1);
