/**
 * Verification harness for bulk listing.
 *
 *   node scripts/verify-bulk-classify.mjs
 *
 * The classifier reads covers with a model; this checks the decisions that are
 * not the model's to make — which scheme belongs to which paper, which years
 * are real, and which pages were too blank to have been read at all.
 *
 * Those are exactly the cases nobody uploads on purpose, so they are the ones
 * that never get tested by hand. They need no API key, no session and no
 * network, which is why they are checkable here at all.
 */

import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
    alias: { '@': new URL('../src', import.meta.url).pathname },
    interopDefault: true,
});

const { pairSchemes, pairingStem, sensibleYear, hasReadableText } =
    await jiti.import('../src/lib/bulkClassify.ts');

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
    checks++;
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(
        `  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(52)} ${
            ok ? JSON.stringify(actual) : `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`
        }`
    );
}

const paper = (key, filename) => ({ key, filename, ok: true, is_marking_scheme: false });
const scheme = (key, filename) => ({ key, filename, ok: true, is_marking_scheme: true });
const pairedTo = (rows, key) => rows.find((r) => r.key === key)?.pairs_with ?? null;

console.log('\nA scheme finds its paper however it was named');
{
    const naming = [
        'Grade 9 Maths EOT2 MS.pdf',
        'Grade 9 Maths EOT2 marking scheme.pdf',
        'Grade 9 Maths EOT2 - Marking Guide.pdf',
        'Grade 9 Maths EOT2 answers.pdf',
        'Grade_9_Maths_EOT2_ANSWER_KEY.pdf',
    ];
    for (const name of naming) {
        const rows = pairSchemes([paper('p1', 'Grade 9 Maths EOT2.pdf'), scheme('s1', name)]);
        check(name.slice(0, 44), pairedTo(rows, 's1'), 'p1');
    }
}

console.log('\nPunctuation and case are not a difference');
{
    const rows = pairSchemes([
        paper('p1', 'grade-9-maths-eot2.pdf'),
        scheme('s1', 'Grade 9 Maths EOT2 MS.PDF'),
    ]);
    check('hyphens, spaces and case all pair', pairedTo(rows, 's1'), 'p1');
}

console.log('\nA scheme with no paper is left unpaired, not guessed at');
{
    const rows = pairSchemes([
        paper('p1', 'Grade 7 English Opener.pdf'),
        scheme('s1', 'Grade 9 Chemistry Mock MS.pdf'),
    ]);
    check('no match means null', pairedTo(rows, 's1'), null);
}

console.log('\nAmbiguity is refused rather than resolved');
{
    // Two papers with the same stem: attaching the scheme to whichever came
    // first would put the wrong answers behind the right paywall.
    const rows = pairSchemes([
        paper('p1', 'Grade 9 Maths.pdf'),
        paper('p2', 'Grade 9 Maths.pdf'),
        scheme('s1', 'Grade 9 Maths MS.pdf'),
    ]);
    check('two candidates means neither', pairedTo(rows, 's1'), null);
}

console.log('\nA stem too short to be distinctive matches nothing');
{
    const rows = pairSchemes([paper('p1', 'Maths.pdf'), scheme('s1', 'MS.pdf')]);
    check('"MS.pdf" does not claim a paper', pairedTo(rows, 's1'), null);
}

console.log('\nPapers are never given a pairing');
{
    const rows = pairSchemes([paper('p1', 'a.pdf'), scheme('s1', 'a MS.pdf')]);
    check('the paper row is untouched', rows.find((r) => r.key === 'p1').pairs_with, undefined);
}

console.log('\nStems strip what distinguishes a scheme and nothing else');
{
    check('scheme words go', pairingStem('Form 4 Physics P1 marking scheme.pdf'), 'form4physicsp1');
    check('the paper keeps its identity', pairingStem('Form 4 Physics P1.pdf'), 'form4physicsp1');
    check('"answers" in a topic is still stripped', pairingStem('answers.pdf'), '');
}

console.log('\nOnly a year a paper could carry is kept');
{
    check('a real year survives', sensibleYear(2024, 2026), 2024);
    check('next year is allowed — papers are set ahead', sensibleYear(2027, 2026), 2027);
    check('two years out is a misread', sensibleYear(2028, 2026), undefined);
    check('a mark total mistaken for a year', sensibleYear(100, 2026), undefined);
    check('a phone number is not a year', sensibleYear(254712, 2026), undefined);
    check('1999 predates the curriculum', sensibleYear(1999, 2026), undefined);
    check('nothing read', sensibleYear(null, 2026), undefined);
    check('a decimal is not a year', sensibleYear(2024.5, 2026), undefined);
}

console.log('\nA scan with no text layer is not sent to the model');
{
    check('a real cover is readable', hasReadableText('SKULBASE ACADEMY END OF TERM 3 EXAMINATION Grade 8'), true);
    check('a handful of stray characters is not', hasReadableText('\\f  \\n .'), false);
    check('empty is not', hasReadableText(''), false);
    check('whitespace is not', hasReadableText('   \\n\\n\\t  '), false);
}

console.log('\nA scanned page is recognised as a scan, not as an empty file');
{
    const { extractPdfPageImages } = await jiti.import('../src/services/documentText.ts');
    const { readFileSync, existsSync } = await import('fs');

    // A text-layer PDF must not be mistaken for a scan, or every upload would
    // be sent to the model as a photograph at many times the cost.
    const textPdf = new URL('../.verify-sample.pdf', import.meta.url).pathname;
    if (existsSync(textPdf)) {
        const imgs = await extractPdfPageImages(readFileSync(textPdf));
        check('a text PDF yields no page images', imgs.length, 0);
    } else {
        console.log('  skip  no sample PDF present (run verify:pdf --out first)');
    }
}

console.log(
    failures === 0
        ? `\nAll ${checks} bulk-listing checks passed.\n`
        : `\n${failures} of ${checks} bulk-listing checks FAILED.\n`
);
process.exit(failures === 0 ? 0 : 1);
