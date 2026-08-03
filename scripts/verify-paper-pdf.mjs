/**
 * Verification harness for the paper renderer.
 *
 *   node scripts/verify-paper-pdf.mjs [--out /tmp/sample.pdf]
 *
 * A paper built in the setter is a list of question ids. Turning it into a real
 * PDF is what makes it printable and sellable at all, so this checks the
 * renderer produces a valid document, paginates a long paper, survives the
 * awkward inputs the question bank actually contains, and never leaks HTML into
 * the printed page.
 *
 * It also checks the things a teacher judges a paper on before they trust it:
 * black text, a header on every page, no blank pages, no page numbered "Page 3
 * of 2", and a file small enough to send over a staffroom connection.
 *
 * The page content is inflated and read back rather than grepped out of the raw
 * bytes. Compressed streams made the old string checks meaningless — "no <p> in
 * the file" passes trivially when the file is deflated, and "no __" fails at
 * random when it is not.
 *
 * Pass --out to write samples you can open and look at.
 */

import { writeFileSync } from 'fs';
import { inflateSync } from 'zlib';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
    alias: { '@': new URL('../src', import.meta.url).pathname },
    interopDefault: true,
});

const { renderPaperPdf, renderMarkingSchemePdf } = await jiti.import('../src/services/paperPdf.ts');
const { layoutPaper, cleanText, defaultAnswerLines } = await jiti.import('../src/services/paperLayout.ts');

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
    checks++;
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(
        `  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(46)} ${
            ok ? JSON.stringify(actual) : `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`
        }`
    );
}

function assert(label, condition, detail = '') {
    checks++;
    if (!condition) failures++;
    console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${label.padEnd(46)} ${detail}`);
}

function section(t) {
    console.log(`\n${t}`);
}

// ---------------------------------------------------------------------------
// READING A PDF BACK
// ---------------------------------------------------------------------------

const isPdf = (buf) => buf.subarray(0, 5).toString() === '%PDF-';
const pageCount = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

/**
 * Every page's content stream, inflated, in page order.
 *
 * The lookbehind matters: "endstream" contains "stream", so without it every
 * real stream is followed by a phantom one, and a test that asks "does every
 * page carry a header" fails against pages that do not exist.
 */
function contentStreams(buf) {
    const streams = [];
    const body = buf.toString('latin1');
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

/**
 * WinAnsi's private range, where the punctuation a Kenyan paper is full of
 * lives: en dashes in mark ranges, middots in the running header, curly
 * apostrophes in "For Examiner's Use".
 */
const WIN_ANSI = {
    0x85: '…',
    0x91: '‘',
    0x92: '’',
    0x93: '“',
    0x94: '”',
    0x96: '–',
    0x97: '—',
};

const decodeWinAnsi = (bytes) =>
    [...bytes].map((b) => WIN_ANSI[b] ?? String.fromCharCode(b)).join('');

/**
 * The strings a page actually shows, in drawing order.
 *
 * jsPDF writes plain strings in parentheses but switches to hex the moment a
 * string contains anything outside ASCII — which is most of the headings on a
 * paper — so both forms have to be read or half the document looks blank.
 */
function pageText(stream) {
    const shown = [];
    const re = /(?:\(((?:[^()\\]|\\.)*)\)|<([0-9A-Fa-f\s]+)>)\s*Tj/g;
    let match;

    while ((match = re.exec(stream)) !== null) {
        if (match[1] !== undefined) {
            shown.push(decodeWinAnsi(Buffer.from(match[1].replace(/\\([()\\])/g, '$1'), 'latin1')));
        } else {
            shown.push(decodeWinAnsi(Buffer.from(match[2].replace(/\s+/g, ''), 'hex')));
        }
    }
    return shown;
}

const allText = (buf) => contentStreams(buf).flatMap(pageText).join('\n');

/** Every non-stroking colour used for text, as "r,g,b". */
function textColours(buf) {
    const found = new Set();
    for (const stream of contentStreams(buf)) {
        for (const m of stream.matchAll(/([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+rg/g)) {
            found.add([m[1], m[2], m[3]].map(Number).join(','));
        }
        for (const m of stream.matchAll(/(?:^|\s)([\d.]+)\s+g(?![a-zA-Z])/g)) {
            const grey = Number(m[1]);
            found.add([grey, grey, grey].join(','));
        }
    }
    return [...found];
}

// ---------------------------------------------------------------------------
// FIXTURES
// ---------------------------------------------------------------------------

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

const CBC_PAPER = { ...PAPER, grade_label: 'Grade 8', subject: 'Integrated Science', instructions: '' };

const QUESTIONS = [
    { text: 'Evaluate 3x + 5 = 20, giving x.', marks: 3, type: 'Short Answer', marking_scheme: '3x = 15, so x = 5.' },
    {
        text: 'Which of the following is a prime number?',
        marks: 1,
        type: 'Multiple Choice',
        options: ['9', '15', '17', '21'],
        marking_scheme: 'C - 17',
    },
    {
        text: 'A triangle has sides of 3 cm, 4 cm and 5 cm.',
        marks: 6,
        type: 'Structured',
        sub_parts: [
            { text: 'Show that the triangle is right-angled.', marks: 3, marking_scheme: 'Pythagoras holds.' },
            { text: 'Find its area.', marks: 3, marking_scheme: 'Half of 3 x 4 = 6 sq cm' },
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

    // Real text, not a picture of text. An image-based paper is what this
    // replaced: megabytes, blurry on a photocopier, and unsearchable.
    assert(
        'the questions are text in the file',
        allText(buf).includes('Evaluate 3x + 5 = 20, giving x.'),
        'searchable'
    );
    assert('no raster image is embedded', !buf.toString('latin1').includes('/Subtype /Image'), 'text only');
}

section('The marking scheme is a separate document');
{
    const paper = renderPaperPdf(PAPER, QUESTIONS);
    const scheme = renderMarkingSchemePdf(PAPER, QUESTIONS);
    assert('scheme is a PDF', isPdf(scheme), `${scheme.length} bytes`);
    assert('differs from the question paper', !paper.equals(scheme), 'answers are not in the paper');
    assert('the paper carries no answers', !allText(paper).includes('3x = 15'), 'scheme only');
    assert('the scheme carries them', allText(scheme).includes('3x = 15, so x = 5.'), 'present');
}

section('Black on white, at printable weight');
{
    // Anything that is not pure black is a grey, and a photocopy of grey text is
    // an unreadable page. The old renderer set 110, 90 and 140.
    const colours = textColours(renderPaperPdf(PAPER, QUESTIONS));
    assert('nothing is drawn in grey', colours.every((c) => c === '0,0,0'), colours.join(' | ') || 'black only');

    const schemeColours = textColours(renderMarkingSchemePdf(PAPER, QUESTIONS));
    assert('nor in the marking scheme', schemeColours.every((c) => c === '0,0,0'), schemeColours.join(' | '));
}

section('The same header on every page');
{
    const buf = renderPaperPdf(PAPER, QUESTIONS.concat(QUESTIONS, QUESTIONS));
    const pages = contentStreams(buf).map(pageText);
    const total = pages.length;

    assert('more than one page to check', total > 1, `${total} pages`);
    assert(
        'subject and level head every page',
        pages.every((p) => p.some((t) => t.includes('Mathematics') && t.includes('Form 4'))),
        'on all pages'
    );
    assert(
        'the paper is named on every page',
        pages.every((p) => p.some((t) => t.includes('End of Term 3 Examination'))),
        'on all pages'
    );
    assert(
        'every page is numbered X of Y',
        pages.every((p, i) => p.includes(`Page ${i + 1} of ${total}`)),
        `Page 1..${total} of ${total}`
    );
    assert(
        'the printed page count is the real one',
        allText(buf).includes(`This paper consists of ${total} printed page`),
        `${total} pages`
    );
    assert(
        'the last page says so',
        pages[total - 1].includes('THIS IS THE LAST PRINTED PAGE'),
        'closed'
    );
}

section('No blank or nearly empty pages');
{
    // A page carrying only its header and footer is a sheet of paper per pupil
    // for nothing. Header and footer come to five strings; anything at or below
    // that is an empty page.
    const papers = [
        renderPaperPdf(PAPER, QUESTIONS),
        renderPaperPdf(PAPER, Array.from({ length: 12 }, () => QUESTIONS[3])),
        renderPaperPdf(CBC_PAPER, Array.from({ length: 25 }, () => QUESTIONS[0])),
        renderMarkingSchemePdf(PAPER, Array.from({ length: 30 }, () => QUESTIONS[0])),
    ];

    papers.forEach((buf, i) => {
        const pages = contentStreams(buf).map(pageText);
        const thin = pages.filter((p) => p.length <= 6).length;
        assert(`document ${i + 1} has no empty page`, thin === 0, `${pages.length} pages, ${thin} empty`);
    });
}

section('Small enough to send');
{
    const many = Array.from({ length: 60 }, (_, i) => ({
        text: `Question ${i + 1}: explain, with reference to at least two examples, the significance of this topic in modern Kenyan agriculture and industry.`,
        marks: 8,
        type: 'Essay',
    }));
    const buf = renderPaperPdf(PAPER, many);

    // The image-based downloader this replaced produced several megabytes for a
    // paper this size. Two megabytes is the ceiling; the real figure is tens of
    // kilobytes, because only the standard-14 fonts are used and the streams are
    // deflated.
    assert('a 60-question paper stays under 2 MB', buf.length < 2 * 1024 * 1024, `${Math.round(buf.length / 1024)} KB`);
    assert('and is in fact tiny', buf.length < 200 * 1024, `${Math.round(buf.length / 1024)} KB`);
    assert('no font is embedded', !buf.toString('latin1').includes('/FontFile'), 'standard 14 only');
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
    assert('every question is numbered', allText(buf).includes('40.'), 'reaches the last one');
}

section('Markup never reaches the printed page');
{
    // The bank holds HTML from the rich-text editor and markdown from imports.
    check('strips a paragraph tag', cleanText('<p>What is <strong>photosynthesis</strong>?</p>'), 'What is photosynthesis?');
    check('turns list items into bullets', cleanText('<li>One</li><li>Two</li>'), '• One\n• Two');
    check('resolves entities', cleanText('Salt &amp; water &lt;here&gt;'), 'Salt & water <here>');
    check('strips markdown bold', cleanText('The **four main points** are'), 'The four main points are');
    check('strips markdown italics', cleanText('Name the *eight* points'), 'Name the eight points');
    check('strips underscored emphasis', cleanText('and __explain__ them'), 'and explain them');

    const text = allText(
        renderPaperPdf(PAPER, [
            { text: '<p>What is <strong>photosynthesis</strong>?</p>', marks: 2, type: 'Short Answer' },
            { text: 'The **four main points of a compass** are called.', marks: 1, type: 'Structured' },
        ])
    );
    assert('no tags in the rendered page', !text.includes('<p>') && !text.includes('<strong>'), 'clean');
    assert('no asterisks in the rendered page', !text.includes('**'), 'clean');
}

section('Awkward inputs from the real question bank');
{
    const sparse = renderPaperPdf(PAPER, [{ text: 'State one use of a barometer.' }]);
    assert('renders a bare question', isPdf(sparse), `${sparse.length} bytes`);

    const noScheme = renderMarkingSchemePdf(PAPER, [{ text: 'Define osmosis.', marks: 2 }]);
    assert('scheme handles a missing answer', isPdf(noScheme), `${noScheme.length} bytes`);
    assert('and says so rather than leaving a blank', allText(noScheme).includes('No marking scheme recorded'), 'stated');

    const empty = renderPaperPdf(PAPER, []);
    assert('empty paper does not throw', isPdf(empty), `${empty.length} bytes`);
    check('an empty paper is one page', pageCount(empty), 1);

    const objOptions = renderPaperPdf(PAPER, [
        { text: 'Pick one.', marks: 1, type: 'Multiple Choice', options: { a: 'First', b: 'Second' } },
    ]);
    assert('object-shaped options render', allText(objOptions).includes('First'), 'lettered');

    const long = renderPaperPdf(PAPER, [{ text: 'Explain. '.repeat(2000), marks: 20, type: 'Essay' }]);
    assert('a very long question terminates', isPdf(long), `${pageCount(long)} pages`);

    // The setter passes camelCase objects; Postgres rows are snake_case. Both
    // have to lay out identically, because they are the same paper.
    const snake = layoutPaper(PAPER, [
        { text: 'A question.', marks: 4, sub_parts: [{ text: 'Part one.', marks: 4 }], answer_lines: 5 },
    ]);
    const camel = layoutPaper(PAPER, [
        { text: 'A question.', marks: 4, subParts: [{ text: 'Part one.', marks: 4 }], answerLines: 5 },
    ]);
    check('camelCase and snake_case agree', camel.questions, snake.questions);
}

section('Shaped like the live question bank');
{
    // Every row in the real bank looks like this: HTML-wrapped text, one mark,
    // empty options/sub_parts, answer_lines 0 and an empty marking scheme.
    const real = {
        text: '<p>State three fundamental principles of freehand sketching.</p>',
        marks: 1,
        type: 'Structured',
        options: [],
        sub_parts: [],
        answer_lines: 0,
        marking_scheme: '',
    };

    // 0 must mean "unspecified", so it should lay out exactly like the default
    // for a one-mark question and clearly unlike twelve.
    const many = (lines) => Array.from({ length: 30 }, () => ({ ...real, answer_lines: lines }));
    const atZero = pageCount(renderPaperPdf(PAPER, many(0)));
    const atDefault = pageCount(renderPaperPdf(PAPER, many(defaultAnswerLines(1, 'Structured'))));
    const atTwelve = pageCount(renderPaperPdf(PAPER, many(12)));

    assert('answer_lines 0 falls back to the default', atZero === atDefault, `${atZero} vs ${atDefault} pages`);
    assert('and is not simply ignored', atZero < atTwelve, `${atZero} pages vs ${atTwelve} at twelve lines`);
    assert('editor HTML is stripped', !allText(renderPaperPdf(PAPER, [real])).includes('<p>'), 'clean');
}

section('The structure of a Kenyan paper');
{
    const objective = { text: 'Pick one.', marks: 1, type: 'Multiple Choice', options: ['A thing', 'Another'] };
    const structured = { text: 'Explain something.', marks: 5, type: 'Structured' };

    const split = layoutPaper(PAPER, [objective, objective, structured, structured]);
    check('objective questions form section A', split.sections.map((s) => s.label), ['SECTION A', 'SECTION B']);
    check('marks are counted per section', split.sections.map((s) => s.marks), [2, 10]);
    check('numbering runs across the paper', split.questions.map((q) => q.number), [1, 2, 3, 4]);

    // Interleaved papers are left exactly as the setter ordered them: inventing
    // sections would mean reordering somebody's paper behind their back.
    const mixed = layoutPaper(PAPER, [objective, structured, objective]);
    check('a mixed order is left alone', mixed.sections.map((s) => s.label), [null]);

    const bare = layoutPaper({ ...PAPER, instructions: '' }, [structured]);
    assert('a paper with no instructions gets some', bare.instructions.length >= 3, `${bare.instructions.length} lines`);
    assert(
        'and they say what the paper is worth',
        bare.instructions.some((line) => line.includes('5 marks')),
        'total stated'
    );

    // Whatever the setter typed wins, renumbered so the list is consistent.
    const typed = layoutPaper({ ...PAPER, instructions: '3) Do this\n- And this' }, [structured]);
    check('typed instructions are kept verbatim', typed.instructions, ['Do this', 'And this']);

    check(
        'the header carries subject and level',
        layoutPaper(PAPER, [structured]).identity.runningLabel,
        'Mathematics  ·  Form 4'
    );
}

section('The mark table and the rubric are filled in');
{
    const layout = layoutPaper(PAPER, QUESTIONS);
    check('one column per question', layout.examinerRows.map((r) => r.label), ['1', '2', '3', '4']);
    check('carrying their marks', layout.examinerRows.map((r) => r.marks), [3, 1, 6, 10]);

    // A fifty-question objective paper gets bands, not fifty columns.
    const banded = layoutPaper(PAPER, Array.from({ length: 25 }, () => QUESTIONS[1]));
    check('long papers are banded', banded.examinerRows.map((r) => r.label), ['1–10', '11–20', '21–25']);

    // CBC papers carry the rubric; 8-4-4 forms do not.
    check('a Form paper has no rubric', layoutPaper(PAPER, QUESTIONS).rubric, null);

    const cbc = layoutPaper(CBC_PAPER, QUESTIONS);
    assert('a CBC paper has one', cbc.rubric !== null, cbc.rubric ? `${cbc.rubric.length} bands` : 'missing');
    check('with the four CBC bands', cbc.rubric.map((b) => b.code), ['EE', 'ME', 'AE', 'BE']);
    // Filled with the marks they mean for this paper — an empty grid is a
    // picture of a rubric, not one a teacher can mark against.
    check('each band showing real marks', cbc.rubric.map((b) => b.range), ['16 – 20', '12 – 15', '8 – 11', '0 – 7']);

    const text = allText(renderPaperPdf(CBC_PAPER, QUESTIONS));
    assert('the paper prints the mark table', text.includes("FOR EXAMINER'S USE ONLY"), 'present');
    assert('and the rubric', text.includes('ASSESSMENT RUBRIC'), 'present');
    assert('with the bands filled in', text.includes('16 – 20 marks'), 'filled');
}

section('Totals cannot disagree with the questions');
{
    // A stored total goes stale the moment a question is swapped out.
    const stale = layoutPaper({ ...PAPER, total_marks: 999 }, QUESTIONS);
    check('the questions win over a stale total', stale.totalMarks, 20);
    check(
        'and the mark table adds to the same',
        stale.examinerRows.reduce((sum, r) => sum + r.marks, 0),
        20
    );
}

section('Minimal metadata still produces a usable paper');
{
    const bare = renderPaperPdf({ title: 'Untitled Paper' }, QUESTIONS);
    assert('renders without subject, grade or institution', isPdf(bare), `${bare.length} bytes`);
    assert('still headed on every page', allText(bare).includes('Page 1 of'), 'numbered');
}

// ---------------------------------------------------------------------------

const outFlag = process.argv.indexOf('--out');
if (outFlag !== -1 && process.argv[outFlag + 1]) {
    const path = process.argv[outFlag + 1];
    writeFileSync(path, renderPaperPdf(PAPER, QUESTIONS));
    writeFileSync(path.replace(/\.pdf$/, '-scheme.pdf'), renderMarkingSchemePdf(PAPER, QUESTIONS));
    writeFileSync(path.replace(/\.pdf$/, '-cbc.pdf'), renderPaperPdf(CBC_PAPER, QUESTIONS));
    console.log(`\nSamples written next to ${path}`);
}

console.log(`\n${failures === 0 ? 'All' : `${checks - failures}/${checks}`} paper-renderer checks passed.`);
if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
}
