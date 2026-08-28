/**
 * Verification harness for what an upload may be.
 *
 *   node scripts/verify-upload-formats.mjs
 *
 * The shop accepted PDFs in five separate places that each spelled
 * `application/pdf` out by hand, and adding Word meant reducing those five to
 * one list — `src/lib/uploadFormats.ts`. What this checks is the awkward half
 * of that list: the devices that describe a .docx as something else.
 *
 * That is not a hypothetical. Android's file picker, Chrome OS and Windows
 * without Office installed all report a .docx as `application/octet-stream`,
 * and some report nothing at all. Those are ordinary phones in this market. If
 * resolution falls back to the filename incorrectly — or fails to — the upload
 * is refused by a picker or, worse, authorised by the browser and then rejected
 * by the bucket after the bytes have crossed a mobile connection.
 *
 * Needs no API key, no session and no network, which is the point: nobody
 * uploads from a misreporting device on purpose, so this is the only place
 * those cases ever get exercised.
 */

import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
    alias: { '@': new URL('../src', import.meta.url).pathname },
    interopDefault: true,
});

const {
    ACCEPTED_CONTENT_TYPES,
    PAPER_FILE_ACCEPT,
    PAPER_FORMATS,
    describeFormats,
    formatByContentType,
    formatByExtension,
    formatFromKey,
    resolvePaperFormat,
    titleFromFilename,
} = await jiti.import('../src/lib/uploadFormats.ts');

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

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const resolved = (name, type) => resolvePaperFormat({ name, type })?.format ?? null;

console.log('\nThe formats a paper may arrive in');
{
    check('a PDF', resolved('paper.pdf', 'application/pdf'), 'pdf');
    check('a .docx', resolved('scheme.docx', DOCX), 'docx');
    check('a legacy .doc', resolved('scheme.doc', 'application/msword'), 'doc');
}

console.log('\nA device that misreports the type is not a device that is refused');
{
    // Every one of these is a real browser on a real phone.
    check('Android reports octet-stream', resolved('Grade 9 Maths.docx', 'application/octet-stream'), 'docx');
    check('the picker reports nothing', resolved('Grade 9 Maths.docx', ''), 'docx');
    check('the type is missing entirely', resolved('Grade 9 Maths.docx', undefined), 'docx');
    check('a .doc as octet-stream', resolved('Old Scheme.doc', 'application/octet-stream'), 'doc');
    check('a PDF as octet-stream', resolved('Paper 1.pdf', 'application/octet-stream'), 'pdf');
    check('uppercase extension', resolved('PAPER.DOCX', 'application/octet-stream'), 'docx');
}

console.log('\nWhat is not a paper is still refused');
{
    check('a spreadsheet', resolved('marks.xlsx', 'application/vnd.ms-excel'), null);
    check('a photo of a cover', resolved('cover.jpg', 'image/jpeg'), null);
    check('a zip of the whole folder', resolved('term2.zip', 'application/zip'), null);
    check('no name and no type', resolved('', ''), null);
    check('a name with no extension', resolved('Grade 9 Maths', 'application/octet-stream'), null);
}

console.log('\nThe type wins when it is one we know, so a rename cannot mislabel');
{
    // A .docx renamed to .pdf: the platform still knows what it is, and storing
    // it under `.pdf` would serve a Word document that no reader can open.
    check('a docx wearing a .pdf name', resolved('paper.pdf', DOCX), 'docx');
    check('a PDF wearing a .docx name', resolved('paper.docx', 'application/pdf'), 'pdf');
}

console.log('\nAliases resolve, because browsers use them');
{
    check('application/x-pdf', formatByContentType('application/x-pdf')?.format, 'pdf');
    check('application/x-msword', formatByContentType('application/x-msword')?.format, 'doc');
    check('a charset parameter', formatByContentType('application/pdf; charset=binary')?.format, 'pdf');
    check('mixed case', formatByContentType('APPLICATION/PDF')?.format, 'pdf');
    check('an unknown type', formatByContentType('application/x-fictional'), null);
}

console.log('\nThe key is the record of the format — every reader trusts it');
{
    check('a docx key', formatFromKey('papers/abc/1700-grade-9.docx').format, 'docx');
    check('a doc key', formatFromKey('papers/abc/1700-grade-9.doc').format, 'doc');
    check('a pdf key', formatFromKey('papers/abc/1700-grade-9.pdf').format, 'pdf');
    check('a scheme key', formatFromKey('papers/abc/1700-x-marking-scheme.docx').format, 'docx');
    // Every paper stocked before Word was accepted is a PDF, so an unreadable
    // key must land on PDF rather than on nothing.
    check('a key with no extension', formatFromKey('papers/abc/1700-grade-9').format, 'pdf');
    check('no key at all', formatFromKey(null).format, 'pdf');
    check('a dot in the folder, not the file', formatFromKey('papers/a.b/paper').format, 'pdf');
}

console.log('\nWhat the shop tells a buyer they are downloading');
{
    check('paper only', describeFormats(['papers/a/p.pdf']), 'PDF');
    check('paper and scheme, both Word', describeFormats(['papers/a/p.docx', 'papers/a/p-ms.docx']), 'Word');
    check('.doc and .docx are both Word', describeFormats(['papers/a/p.doc', 'papers/a/p-ms.docx']), 'Word');
    check('a mixed pair', describeFormats(['papers/a/p.pdf', 'papers/a/p-ms.docx']), 'PDF + Word');
    check('nothing stored yet', describeFormats([null, undefined]), 'PDF');
}

console.log('\nThe picker offers extensions as well as types');
{
    // Content types alone grey out .docx on exactly the machines that
    // misreport it — which is the population this whole change exists for.
    for (const format of PAPER_FORMATS) {
        check(`accept offers ${format.extension}`, PAPER_FILE_ACCEPT.includes(format.extension), true);
        check(`accept offers ${format.format} by type`, PAPER_FILE_ACCEPT.includes(format.contentType), true);
    }
}

console.log('\nThe bucket and the app agree on the list');
{
    const { readFileSync } = await import('fs');
    // Comments are stripped first: both files explain in prose why
    // `application/octet-stream` never reaches storage, and a substring search
    // over the prose would find the very string it is checking is absent.
    const withoutComments = (text) =>
        text
            .split('\n')
            .filter((line) => !line.trim().startsWith('--'))
            .join('\n');

    const sql = withoutComments(
        readFileSync(new URL('../supabase/migrations/034_word_uploads.sql', import.meta.url), 'utf8')
    );
    const setup = withoutComments(
        readFileSync(new URL('../supabase/production-setup.sql', import.meta.url), 'utf8')
    );

    /*
     * Storage carries its own `allowed_mime_types`, and when the two lists
     * disagree the app hands the browser a signed URL for a file the bucket
     * will then refuse — a failure that lands in the browser with nothing in
     * this app able to explain it. So the migration is read here rather than
     * trusted.
     */
    for (const format of PAPER_FORMATS) {
        check(`migration allows ${format.format}`, sql.includes(format.contentType), true);
        check(`production-setup allows ${format.format}`, setup.includes(format.contentType), true);
    }
    check('no alias reaches the bucket', sql.includes('octet-stream'), false);
    check('every canonical type is accepted by the routes', PAPER_FORMATS.every((f) => ACCEPTED_CONTENT_TYPES.includes(f.contentType)), true);
}

console.log('\nA paper names itself, so the title can fill itself in');
{
    check('a plain name', titleFromFilename('Grade 9 Maths EOT2.pdf'), 'Grade 9 Maths EOT2');
    check('underscores are separators', titleFromFilename('grade_9_maths_eot2.docx'), 'Grade 9 Maths Eot2');
    check('spaced hyphens are separators', titleFromFilename('grade 9 - maths.pdf'), 'Grade 9 Maths');
    // `end-term` is one word with a hyphen in it, not two words.
    check('a hyphen inside a word survives', titleFromFilename('grade 9 end-term.pdf'), 'Grade 9 End-term');
    check('capitals are left alone', titleFromFilename('KCSE 2024 Chemistry.pdf'), 'KCSE 2024 Chemistry');
    check('a path from a folder drag', titleFromFilename('Term 2/Grade 8 English.docx'), 'Grade 8 English');
    check('too short to be a title', titleFromFilename('ms.pdf'), '');
    check('nothing at all', titleFromFilename(''), '');
}

console.log(
    failures === 0
        ? `\nAll ${checks} upload-format checks passed.\n`
        : `\n${failures} of ${checks} upload-format checks FAILED.\n`
);
process.exit(failures === 0 ? 0 : 1);
