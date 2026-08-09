/**
 * Verification harness for maths typesetting.
 *
 *   node scripts/verify-math-typesetting.mjs
 *
 * Until this shipped, a question written `$\frac{3x+2}{x-1}$` printed those
 * literal characters onto the paper. That is not a cosmetic problem: it is a
 * question no candidate can answer, on a document somebody paid for.
 *
 * Three things are checked, and they fail differently.
 *
 *   THE PARSE. A dropped term is silently wrong — the question still reads,
 *   and it is a different question. So unknown input is preserved rather than
 *   discarded, and every structural form a school paper uses is exercised.
 *
 *   THE SPACING. "V=pr2h" and "V = πr² h" are the same characters. TeX's
 *   operator spacing is most of the difference between set and typed.
 *
 *   MEASURE AGAINST DRAW. The renderer lays out the whole paper twice before
 *   committing. If `measureNodes` and `drawNodes` disagree by a point, a
 *   fraction is drawn over the question above it — so they are checked against
 *   each other on every sample here, which is the check most likely to catch a
 *   future edit.
 *
 * No network, no storage, no database.
 */

import { jsPDF } from 'jspdf';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
    alias: { '@': new URL('../src', import.meta.url).pathname },
    interopDefault: true,
});

const { parseMath, segmentText, hasMath, SYM, SYMBOL_WIDTHS } =
    await jiti.import('../src/services/mathText.ts');
const { measureNodes, drawNodes } = await jiti.import('../src/services/mathDraw.ts');
const { renderPaperPdf } = await jiti.import('../src/services/paperPdf.ts');

let failures = 0;
let checks = 0;

function stable(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
}

function check(label, actual, expected) {
    checks++;
    const ok = stable(actual) === stable(expected);
    if (!ok) failures++;
    console.log(
        `  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(54)} ${
            ok ? '' : `got ${stable(actual)}, wanted ${stable(expected)}`
        }`
    );
}

function assert(label, condition, detail = '') {
    checks++;
    if (!condition) failures++;
    console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${label.padEnd(54)} ${detail}`);
}

/** A compact rendering of the node stream, for readable expectations. */
const show = (nodes) =>
    nodes
        .map((n) =>
            n.kind === 'text'
                ? JSON.stringify(n.value)
                : n.kind === 'sym'
                  ? `sym:${n.code.toString(16)}`
                  : n.kind === 'space'
                    ? 'sp'
                    : n.kind
        )
        .join(' ');

console.log('\nThe structures a school paper is made of');
{
    check('a fraction', show(parseMath('\\frac{a}{b}')), 'frac');
    check('an index', show(parseMath('x^2')), '"x" sup');
    check('a subscript', show(parseMath('H_2O')), '"H" sub "O"');
    check('a surd', show(parseMath('\\sqrt{5}')), 'sqrt');
    check('a cube root keeps its index', parseMath('\\sqrt[3]{8}')[0].index !== null, true);
    check('a plain surd has none', parseMath('\\sqrt{8}')[0].index, null);
    check('a braced index', show(parseMath('x^{10}')), '"x" sup');
    check('nested fractions', parseMath('\\frac{\\frac{1}{2}}{3}')[0].num[0].kind, 'frac');

    // The whole point of the exercise: this used to print as its own source.
    const q = parseMath('\\frac{3x+2}{x-1}');
    check('a real fraction, not its source', q.length === 1 && q[0].kind === 'frac', true);
}

console.log('\nSymbols come from the Symbol font, and every one has a width');
{
    check('pi', show(parseMath('\\pi')), `sym:${SYM.pi.toString(16)}`);
    check('theta', show(parseMath('\\theta')), `sym:${SYM.theta.toString(16)}`);
    check('a minus is a minus, not a hyphen', show(parseMath('5-3')), '"5" sp sym:2d sp "3"');
    check('times', show(parseMath('\\times')), `sym:${SYM.times.toString(16)}`);

    /*
     * The guard that matters most here. Positioning is absolute — a glyph with
     * no width silently falls back to an average and collides with whatever
     * follows it, which is exactly the bug this table was added to fix.
     */
    const missing = Object.entries(SYM).filter(([, code]) => !(code in SYMBOL_WIDTHS));
    assert(
        'every symbol in SYM has a measured width',
        missing.length === 0,
        missing.length ? `missing: ${missing.map(([n]) => n).join(', ')}` : ''
    );
}

console.log('\nOperator spacing, which is most of what "set" means');
{
    check('a relation is spaced', show(parseMath('a=b')), '"a" sp "=" sp "b"');
    check('so is a symbol relation', show(parseMath('a\\le b')), `"a" sp sym:${SYM.le.toString(16)} sp "b"`);
    check('juxtaposition is not', show(parseMath('\\pi r')), `sym:${SYM.pi.toString(16)} "r"`);

    // A sign, not a subtraction. "−b ± √…", never "− b ± √…".
    check('a leading minus is unary', show(parseMath('-b')), 'sym:2d "b"');
    check('a minus after a relation is unary', show(parseMath('x=-1')), '"x" sp "=" sp sym:2d "1"');
    check('a minus after a bracket is unary', show(parseMath('(-3)')), '"(" sym:2d "3)"');
    check('but between terms it is binary', show(parseMath('a-b')), '"a" sp sym:2d sp "b"');

    // The command-name space LaTeX eats, which printed "π= x".
    check('a command swallows its trailing space', show(parseMath('\\pi = x')), `sym:${SYM.pi.toString(16)} sp "=" sp "x"`);
    check("but the author's own space is not doubled", show(parseMath('a - b')), '"a" sp sym:2d sp "b"');

    check('a function name is spaced from its argument', show(parseMath('\\sin\\theta')), `"sin" sp sym:${SYM.theta.toString(16)}`);
}

console.log('\nDegrees sit on the line, not above it');
{
    // ° is already a raised glyph; superscripting it floats it off the line.
    check('^\\circ is a degree sign', show(parseMath('90^\\circ')), '"90" "°"');
    check('and not a superscript', parseMath('90^\\circ').every((n) => n.kind !== 'sup'), true);
}

console.log('\nA question is split into prose and maths');
{
    check('plain prose stays whole', segmentText('State two uses.').map((s) => s.kind), ['prose']);
    check('maths is found', segmentText('Find $x^2$ here.').map((s) => s.kind), ['prose', 'math', 'prose']);
    check('display maths too', segmentText('$$a=b$$').map((s) => s.kind), ['math']);
    check('two expressions', segmentText('$a$ and $b$').map((s) => s.kind), ['math', 'prose', 'math']);

    /*
     * "The book costs $5 and the pen $3" is not an equation. Swallowing the
     * text between two stray dollars would eat half a question.
     */
    check('an unclosed dollar is prose', hasMath('It costs $5 at the shop'), false);
    check('an empty string is nothing', segmentText(''), []);
    check('a question with no maths needs no typesetter', hasMath('State two uses of a lever.'), false);
}

console.log('\nUnknown input is preserved, never silently dropped');
{
    // A question that loses a term is wrong in a way nobody can see.
    check('an unknown command prints its name', show(parseMath('\\wibble')), '"wibble"');
    check('an unmatched brace does not hang', show(parseMath('\\frac{a}{b')), 'frac');
    check('an empty expression is empty', parseMath(''), []);
}

console.log('\nMeasuring and drawing agree, or fractions overprint');
{
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const style = { font: 'times', size: 10.5 };

    const samples = [
        'x^2', '\\frac{1}{2}', '\\sqrt{5}', '\\sqrt[3]{27x^6}', '\\pi r^2 h',
        '\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}', '2\\frac{1}{4}', 'H_2SO_4',
        '\\frac{\\frac{1}{2}+\\frac{3}{8}}{\\frac{5}{6}}', '0^\\circ \\le \\theta \\le 90^\\circ',
    ];

    let worst = 0;
    for (const src of samples) {
        const nodes = parseMath(src);
        const measured = measureNodes(doc, nodes, style).width;
        const drawn = drawNodes(doc, nodes, 0, 100, style);
        worst = Math.max(worst, Math.abs(measured - drawn));
    }
    assert('width measured equals width drawn', worst < 0.01, `worst gap ${worst.toFixed(4)}pt`);

    // A fraction has to claim more height than a plain run, or the paginator
    // will not leave room for it.
    const plain = measureNodes(doc, parseMath('x'), style);
    const frac = measureNodes(doc, parseMath('\\frac{1}{2}'), style);
    assert('a fraction reaches higher than a letter', frac.ascent > plain.ascent, `${frac.ascent.toFixed(1)} vs ${plain.ascent.toFixed(1)}`);
    assert('and lower', frac.descent > plain.descent, `${frac.descent.toFixed(1)} vs ${plain.descent.toFixed(1)}`);
}

console.log('\nAnd none of it reaches the printed page as LaTeX');
{
    const paper = { title: 'T', subject: 'Mathematics', time_limit: '2 Hours' };
    const buf = renderPaperPdf(paper, [
        { text: 'Simplify $\\frac{3x+2}{x-1}$ and find $\\sqrt{49}$.', marks: 3, type: 'Structured' },
    ]);
    const body = buf.toString('latin1');

    assert('the document is a PDF', body.startsWith('%PDF-'));
    assert('no \\frac survives to the page', !body.includes('frac{'), '');
    assert('no \\sqrt survives either', !body.includes('sqrt{'), '');
    assert('the Symbol font is used', body.includes('Symbol'), '');

    // A paper with no maths must be untouched by any of this.
    const prose = renderPaperPdf({ title: 'T', subject: 'History' }, [
        { text: 'State two archaeological sites in Kenya.', marks: 2, type: 'Structured' },
    ]);
    assert('a prose paper still renders', prose.toString('latin1').startsWith('%PDF-'));
}

console.log(
    failures === 0
        ? `\nAll ${checks} maths-typesetting checks passed.\n`
        : `\n${failures} of ${checks} maths-typesetting checks FAILED.\n`
);
process.exit(failures === 0 ? 0 : 1);
