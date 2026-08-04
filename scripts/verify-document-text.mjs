/**
 * Verification harness for reading text out of an uploaded document.
 *
 *   node scripts/verify-document-text.mjs
 *
 * This exists because the PDF path shipped broken and nothing caught it.
 * `pdf-parse` was rewritten as a class at 2.x; the route still called it as
 * the old callable function; every single PDF upload threw synchronously,
 * before the file was ever looked at, and the route's own try/catch turned
 * that into a clean "Failed to parse PDF" that gave no sign it was the same
 * failure every time. The verification that existed for question extraction
 * checked the code that reads the model's *response* — a different function,
 * never wrong — and never once ran a real PDF through the parser.
 *
 * So this generates real files — a genuine PDF via jsPDF, a genuine .docx via
 * JSZip building the actual zipped-XML format Word reads — and runs them
 * through `extractPdfText` / `extractWordText` directly. Not a description of
 * what those functions should do: the same functions the route calls, with
 * files a real upload would actually produce. If a dependency's API changes
 * out from under this again, a generated file fails to parse here instead of
 * a teacher's upload failing in production with a message that does not say
 * why.
 */

import { execFileSync } from 'node:child_process';
import { createJiti } from 'jiti';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';

const jiti = createJiti(import.meta.url, {
    alias: { '@': new URL('../src', import.meta.url).pathname },
    interopDefault: true,
});

const { extractPdfText, extractWordText, __DOMMatrixImplementation: DOMMatrixImpl } =
    await jiti.import('../src/services/documentText.ts');

let failures = 0;
let checks = 0;

function assert(label, condition, detail = '') {
    checks++;
    if (!condition) failures++;
    console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${label.padEnd(52)} ${detail}`);
}

async function assertRejects(label, promise) {
    checks++;
    try {
        await promise;
        failures++;
        console.log(`  FAIL ${label.padEnd(52)} resolved instead of throwing`);
    } catch (e) {
        console.log(`  ok   ${label.padEnd(52)} ${e.constructor.name}`);
    }
}

const section = (t) => console.log(`\n${t}`);

// ---------------------------------------------------------------------------
// REAL FIXTURES — not hand-written strings standing in for a file format
// ---------------------------------------------------------------------------

function makeSinglePagePdf() {
    const doc = new jsPDF();
    doc.text('1. Define photosynthesis. (2 marks)', 20, 20);
    doc.text('2. State two factors affecting osmosis. (3 marks)', 20, 30);
    return Buffer.from(doc.output('arraybuffer'));
}

function makeMultiPagePdf() {
    const doc = new jsPDF();
    for (let p = 1; p <= 3; p++) {
        if (p > 1) doc.addPage();
        doc.text(`Page ${p}: Question ${p}. Explain something. (${p} marks)`, 20, 20);
    }
    return Buffer.from(doc.output('arraybuffer'));
}

/** A genuine .docx — a zip of the real OOXML parts Word itself would write. */
async function makeDocx(paragraphs) {
    const zip = new JSZip();
    zip.file(
        '[Content_Types].xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
    );
    zip.folder('_rels').file(
        '.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
    );
    const body = paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('\n');
    zip.folder('word').file(
        'document.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
${body}
</w:body>
</w:document>`
    );
    return zip.generateAsync({ type: 'nodebuffer' });
}

// ---------------------------------------------------------------------------

section('A real PDF, single page');
{
    const text = await extractPdfText(makeSinglePagePdf());
    assert('the first question is present', text.includes('1. Define photosynthesis. (2 marks)'), 'found');
    assert('the second question is present', text.includes('2. State two factors affecting osmosis. (3 marks)'), 'found');
}

section('A real PDF, multiple pages');
{
    const text = await extractPdfText(makeMultiPagePdf());
    assert('page 1 text is present', text.includes('Page 1: Question 1.'), 'found');
    assert('page 2 text is present', text.includes('Page 2: Question 2.'), 'found');
    assert('page 3 text is present', text.includes('Page 3: Question 3.'), 'found');
    assert('the pages are in order', text.indexOf('Page 1') < text.indexOf('Page 2') && text.indexOf('Page 2') < text.indexOf('Page 3'), 'ordered');
    // The library's own page-boundary marker is not something a model
    // extracting questions needs to see.
    assert('no "-- N of M --" page marker leaks through', !/--\s*\d+\s+of\s+\d+\s*--/.test(text), 'stripped');
}

section('A PDF that is not readable is rejected, not hung or crashed');
await assertRejects('a buffer that is not a PDF at all', extractPdfText(Buffer.from('not a pdf, just some bytes')));
await assertRejects('an empty buffer', extractPdfText(Buffer.alloc(0)));

section('A real .docx, one paragraph per question');
{
    const buffer = await makeDocx(['1. Define osmosis. (2 marks)', '2. Explain the water cycle. (3 marks)']);
    const text = await extractWordText(buffer);
    assert('the first paragraph is present', text.includes('1. Define osmosis. (2 marks)'), 'found');
    assert('the second paragraph is present', text.includes('2. Explain the water cycle. (3 marks)'), 'found');
}

section('A .docx that is not readable is rejected, not hung or crashed');
await assertRejects('a buffer that is not a docx at all', extractWordText(Buffer.from('not a docx, just some bytes')));
await assertRejects('an empty buffer', extractWordText(Buffer.alloc(0)));

// ---------------------------------------------------------------------------
// THE WAYS THIS SHIPPED BROKEN TWICE MORE
//
// Everything above passed while production failed on every PDF, twice running.
// Both faults were the same shape: a file pdfjs reaches for by a route no
// bundler can follow, present on this machine and absent from the deployment.
// First `@napi-rs/canvas`, which it borrows `DOMMatrix` from — without it,
// `ReferenceError: DOMMatrix is not defined`. Then its own worker, loaded by a
// specifier assembled at runtime — without it, "Setting up fake worker
// failed". Checks that run where both resolve were never going to see either,
// so this one goes and makes them not resolve.
//
// `verify-deployment-tracing.mjs` covers the other half of it: that the worker
// is actually in what gets uploaded. Between them — the code does not need the
// unfollowable path, and the file ships anyway.
// ---------------------------------------------------------------------------

section('A PDF still reads under the deployment’s conditions');
{
    // A child process, because the blocks have to be in place before pdfjs
    // loads and this one has already loaded it.
    const output = execFileSync(process.execPath, [new URL('_extract-as-deployed.mjs', import.meta.url).pathname], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    assert('no native canvas, no fake-worker path, still reads', output.startsWith('TEXT:'), output.slice(0, 80));
    if (output.startsWith('TEXT:')) {
        const text = JSON.parse(output.slice('TEXT:'.length));
        assert('the text is the same as with them', text.includes('1. Define photosynthesis. (2 marks)'), 'identical');
        assert('every question is there, not just the first', text.includes('2. State two factors affecting osmosis. (3 marks)'), 'identical');
    }
}

section('The DOMMatrix supplied in its place is real arithmetic, not a stub');
{
    const identity = new DOMMatrixImpl();
    assert('a new matrix is the identity', identity.isIdentity === true, 'identity');
    assert('and reports itself as 2D', identity.is2D === true, 'true');

    const fromSix = new DOMMatrixImpl([2, 0, 0, 3, 10, 20]);
    assert('six values are read in order', `${fromSix.a},${fromSix.d},${fromSix.e},${fromSix.f}` === '2,3,10,20', '2,3,10,20');
    assert('the 4x4 names are the same numbers', fromSix.m11 === 2 && fromSix.m22 === 3 && fromSix.m41 === 10, 'aliased');

    // Scaling by 2 then translating by (5,5) must move a point to (10,10) —
    // the translation happening in the already-scaled space.
    const scaledThenTranslated = new DOMMatrixImpl().scale(2).translate(5, 5);
    const moved = scaledThenTranslated.transformPoint({ x: 0, y: 0 });
    assert('scale then translate composes in the right order', moved.x === 10 && moved.y === 10, `(${moved.x}, ${moved.y})`);

    const point = new DOMMatrixImpl([2, 0, 0, 3, 10, 20]).transformPoint({ x: 1, y: 1 });
    assert('a point is transformed correctly', point.x === 12 && point.y === 23, `(${point.x}, ${point.y})`);

    // The real test of the inverse: it must undo the original exactly.
    const original = new DOMMatrixImpl([2, 1, 1, 3, 10, 20]);
    const roundTripped = original.multiply(original.inverse());
    const isIdentityish = ['a', 'b', 'c', 'd', 'e', 'f'].every((k) => Math.abs(roundTripped[k] - (k === 'a' || k === 'd' ? 1 : 0)) < 1e-9);
    assert('a matrix times its inverse is the identity', isIdentityish, 'within 1e-9');

    const singular = new DOMMatrixImpl([1, 2, 2, 4, 0, 0]).inverse();
    assert('a matrix with no inverse yields NaN, not a wrong answer', Number.isNaN(singular.a), 'NaN');

    // Refusing beats half-reading: a wrong transform would mean wrong text.
    let refusedString = false;
    try {
        new DOMMatrixImpl('translate(10px, 10px)');
    } catch {
        refusedString = true;
    }
    assert('a CSS transform string is refused, not guessed at', refusedString, 'throws');

    let refusedLength = false;
    try {
        new DOMMatrixImpl([1, 2, 3]);
    } catch {
        refusedLength = true;
    }
    assert('a wrong number of values is refused', refusedLength, 'throws');
}

section('A DOMMatrix that already exists is never replaced');
{
    const { ensureDomMatrix } = await jiti.import('../src/services/documentText.ts');
    const sentinel = class RealDOMMatrix {};
    const had = Object.hasOwn(globalThis, 'DOMMatrix');
    const previous = globalThis.DOMMatrix;
    globalThis.DOMMatrix = sentinel;
    ensureDomMatrix();
    assert('the platform’s own implementation wins', globalThis.DOMMatrix === sentinel, 'untouched');
    if (had) globalThis.DOMMatrix = previous;
    else delete globalThis.DOMMatrix;
}

// ---------------------------------------------------------------------------

console.log(`\n${failures === 0 ? 'All' : `${checks - failures}/${checks}`} document-text checks passed.`);
if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
}
