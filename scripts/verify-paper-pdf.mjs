/**
 * Verification harness for the paper renderer.
 *
 *   node scripts/verify-paper-pdf.mjs [--out /tmp/sample.pdf]
 *
 * A paper built in the setter is a list of question ids. Turning it into a real
 * PDF is what makes it sellable at all, so this checks the renderer produces a
 * valid document, paginates a long paper, survives the awkward inputs the
 * question bank actually contains, and never leaks HTML into the printed page.
 *
 * Pass --out to write a sample you can open and look at.
 */

import { writeFileSync } from 'fs';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
    alias: { '@': new URL('../src', import.meta.url).pathname },
    interopDefault: true,
});

const { renderPaperPdf, renderMarkingSchemePdf } = await jiti.import('../src/services/paperPdf.ts');

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
    checks++;
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(44)} ${ok ? actual : `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`);
}

function assert(label, condition, detail = '') {
    checks++;
    if (!condition) failures++;
    console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${label.padEnd(44)} ${detail}`);
}

function section(t) { console.log(`\n${t}`); }

const isPdf = (buf) => buf.subarray(0, 5).toString() === '%PDF-';
const pageCount = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

const PAPER = {
    title: 'End of Term 3 Examination',
    subject: 'Mathematics',
    grade_label: 'Form 4',
    exam_type: 'end-term',
    term_slug: 'term-3',
    year: 2026,
    time_limit: '2 Hours',
    institution: 'Skulbase Academy',
    total_marks: 60,
    instructions: '1. Answer ALL questions in the spaces provided.\n2. Show all your working clearly.',
};

const QUESTIONS = [
    { text: 'Evaluate 3x + 5 = 20, giving x.', marks: 3, type: 'Short Answer', marking_scheme: '3x = 15, so x = 5.' },
    {
        text: 'Which of the following is a prime number?',
        marks: 1,
        type: 'Multiple Choice',
        options: ['9', '15', '17', '21'],
        marking_scheme: 'C — 17',
    },
    {
        text: 'A triangle has sides of 3 cm, 4 cm and 5 cm.',
        marks: 6,
        type: 'Structured',
        sub_parts: [
            { text: 'Show that the triangle is right-angled.', marks: 3, marking_scheme: '3² + 4² = 9 + 16 = 25 = 5²' },
            { text: 'Find its area.', marks: 3, marking_scheme: '½ × 3 × 4 = 6 cm²' },
        ],
    },
    { text: 'Discuss the importance of statistics in agriculture.', marks: 10, type: 'Essay' },
];

// ---------------------------------------------------------------------------

section('A paper renders to a real PDF');
{
    const buf = renderPaperPdf(PAPER, QUESTIONS);
    assert('produces a PDF header', isPdf(buf), buf.subarray(0, 5).toString());
    assert('has meaningful size', buf.length > 2000, `${buf.length} bytes`);
    assert('at least one page', pageCount(buf) >= 1, `${pageCount(buf)} page(s)`);
}

section('The marking scheme is a separate document');
{
    const paper = renderPaperPdf(PAPER, QUESTIONS);
    const scheme = renderMarkingSchemePdf(PAPER, QUESTIONS);
    assert('scheme is a PDF', isPdf(scheme), `${scheme.length} bytes`);
    assert('differs from the question paper', !paper.equals(scheme), 'answers are not in the paper');
}

section('Long papers paginate');
{
    const many = Array.from({ length: 40 }, (_, i) => ({
        text: `Question ${i + 1}: explain, with reference to at least two examples, the significance of this topic in modern Kenyan agriculture and industry.`,
        marks: 8,
        type: 'Essay',
    }));
    const buf = renderPaperPdf(PAPER, many);
    assert('spills onto several pages', pageCount(buf) > 3, `${pageCount(buf)} pages`);
    assert('still valid', isPdf(buf), 'header intact');
}

section('Awkward inputs from the real question bank');
{
    // HTML from the rich-text editor must never reach the printed page.
    const html = renderPaperPdf(PAPER, [
        { text: '<p>What is <strong>photosynthesis</strong>?</p>', marks: 2, type: 'Short Answer' },
    ]);
    const body = html.toString('latin1');
    assert('no <p> tag in output', !body.includes('<p>'), 'stripped');
    assert('no <strong> tag in output', !body.includes('<strong>'), 'stripped');

    // Questions with no marks, no type and no answer space.
    const sparse = renderPaperPdf(PAPER, [{ text: 'State one use of a barometer.' }]);
    assert('renders a bare question', isPdf(sparse), `${sparse.length} bytes`);

    // A question with no marking scheme must still produce a scheme document.
    const noScheme = renderMarkingSchemePdf(PAPER, [{ text: 'Define osmosis.', marks: 2 }]);
    assert('scheme handles a missing answer', isPdf(noScheme), `${noScheme.length} bytes`);

    // An empty paper should not throw.
    const empty = renderPaperPdf(PAPER, []);
    assert('empty paper does not throw', isPdf(empty), `${empty.length} bytes`);

    // Options supplied as an object rather than an array.
    const objOptions = renderPaperPdf(PAPER, [
        { text: 'Pick one.', marks: 1, type: 'Multiple Choice', options: { a: 'First', b: 'Second' } },
    ]);
    assert('object-shaped options render', isPdf(objOptions), `${objOptions.length} bytes`);

    // Very long single question — must not loop forever.
    const long = renderPaperPdf(PAPER, [{ text: 'Explain. '.repeat(2000), marks: 20, type: 'Essay' }]);
    assert('a very long question terminates', isPdf(long), `${pageCount(long)} pages`);
}

section('Shaped like the live question bank');
{
    // Every row in the real bank looks like this: HTML-wrapped text, one mark,
    // empty options/sub_parts, answer_lines 0 and an empty marking scheme.
    const real = [
        { text: '<p>State three fundamental principles of freehand sketching.</p>', marks: 1, type: 'Structured', options: [], sub_parts: [], answer_lines: 0, marking_scheme: '' },
        { text: '<p>Define the term "dimensioning" in technical drawing.</p>', marks: 1, type: 'Structured', options: [], sub_parts: [], answer_lines: 0, marking_scheme: '' },
    ];

    // 0 must mean "unspecified", so it should lay out exactly like the default
    // for a one-mark question (two lines) and clearly unlike twelve. Page count
    // is the honest measure here; byte size is not, because the stream is
    // compressed.
    const many = (lines) => Array.from({ length: 30 }, () => ({ ...real[0], answer_lines: lines }));
    const atZero = pageCount(renderPaperPdf(PAPER, many(0)));
    const atDefault = pageCount(renderPaperPdf(PAPER, many(2)));
    const atTwelve = pageCount(renderPaperPdf(PAPER, many(12)));

    assert('answer_lines 0 falls back to the default', atZero === atDefault,
        `0 -> ${atZero} pages, explicit 2 -> ${atDefault} pages`);
    assert('and is not simply ignored', atZero < atTwelve,
        `${atZero} pages vs ${atTwelve} at twelve lines`);

    const withLines = renderPaperPdf(PAPER, real);
    const body = withLines.toString('latin1');
    assert('editor HTML is stripped', !body.includes('<p>'), 'clean');

    const scheme = renderMarkingSchemePdf(PAPER, real);
    assert('empty marking_scheme is reported honestly', isPdf(scheme), `${scheme.length} bytes`);
}

section('Minimal metadata still produces a usable paper');
{
    const bare = renderPaperPdf({ title: 'Untitled Paper' }, QUESTIONS);
    assert('renders without subject, grade or institution', isPdf(bare), `${bare.length} bytes`);
}

// ---------------------------------------------------------------------------

const outFlag = process.argv.indexOf('--out');
if (outFlag !== -1 && process.argv[outFlag + 1]) {
    const path = process.argv[outFlag + 1];
    writeFileSync(path, renderPaperPdf(PAPER, QUESTIONS));
    writeFileSync(path.replace(/\.pdf$/, '-scheme.pdf'), renderMarkingSchemePdf(PAPER, QUESTIONS));
    console.log(`\nSample written to ${path}`);
}

console.log(`\n${failures === 0 ? 'All' : `${checks - failures}/${checks}`} paper-renderer checks passed.`);
if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
}
