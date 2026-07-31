/**
 * Verification harness for the WhatsApp query parser.
 *
 *   node scripts/verify-paper-query.mjs
 *
 * The parser decides which paper somebody gets sent, so it is worth being sure
 * about. No database and no network: these are the sentences people actually
 * type, checked against what the catalog should make of them.
 *
 * The negative cases matter as much as the positive ones. A parser that guesses
 * is worse than one that asks, because a wrong guess ends with the wrong PDF
 * delivered to somebody who paid.
 */

import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
    alias: { '@': new URL('../src', import.meta.url).pathname },
    interopDefault: true,
});

const { parsePaperQuery, describeQuery } = await jiti.import('../src/services/paperQuery.ts');

// The subjects a real database would hand us.
const SUBJECTS = [
    'Mathematics',
    'English',
    'Kiswahili',
    'Integrated Science',
    'Science',
    'Biology',
    'Chemistry',
    'Physics',
    'Social Studies',
    'Business Studies',
    'Agriculture',
    'CRE',
];

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
    checks++;
    const ok = actual === expected;
    if (!ok) failures++;
    const status = ok ? 'ok  ' : 'FAIL';
    const detail = ok ? `${actual}` : `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`;
    console.log(`  ${status} ${label.padEnd(34)} ${detail}`);
}

function section(title) {
    console.log(`\n${title}`);
}

// ---------------------------------------------------------------------------

section('The example from the brief');
{
    const q = parsePaperQuery('I want form 4 mathematics term 3 exam', SUBJECTS);
    check('grade', q.grade, 'Form 4');
    check('subject', q.subject, 'Mathematics');
    check('term', q.term, 'term-3');
    check('level', q.level, 'form-1-4');
    check('nothing left over', q.leftover, '');
}

section('Shorthand people actually type');
{
    const q = parsePaperQuery('f4 maths t3', SUBJECTS);
    check('grade', q.grade, 'Form 4');
    check('subject', q.subject, 'Mathematics');
    check('term', q.term, 'term-3');
}
{
    const q = parsePaperQuery('form four english term two', SUBJECTS);
    check('grade from a number word', q.grade, 'Form 4');
    check('subject', q.subject, 'English');
    check('term from a number word', q.term, 'term-2');
}

section('CBE grades and multi-word subjects');
{
    const q = parsePaperQuery('grade 9 integrated science end term 2 2025', SUBJECTS);
    check('grade', q.grade, 'Grade 9');
    check('level', q.level, 'junior-school');
    check('longest subject wins', q.subject, 'Integrated Science');
    check('exam type', q.examType, 'end-term');
    check('term', q.term, 'term-2');
    check('year', q.year, 2025);
}

section('Exam type precedence');
{
    const q = parsePaperQuery('form 4 chemistry county mock 2024', SUBJECTS);
    check('county mock beats mock', q.examType, 'county-mock');
    check('year', q.year, 2024);
}
{
    const q = parsePaperQuery('kcse biology past paper', SUBJECTS);
    check('kcse recognised', q.examType, 'kcse');
    check('subject', q.subject, 'Biology');
}
{
    const q = parsePaperQuery('grade 7 mathematics midterm', SUBJECTS);
    check('midterm as one word', q.examType, 'mid-term');
}

section('Level named instead of a grade');
{
    const q = parsePaperQuery('junior school kiswahili opener', SUBJECTS);
    check('level', q.level, 'junior-school');
    check('no specific grade', q.grade, undefined);
    check('subject', q.subject, 'Kiswahili');
    check('exam type', q.examType, 'opener');
}

section('Politeness costs nothing');
{
    const q = parsePaperQuery('hi please send me the grade 5 science paper', SUBJECTS);
    check('grade', q.grade, 'Grade 5');
    check('subject', q.subject, 'Science');
    check('filler dropped', q.leftover, '');
}

section('Junk produces no filters rather than wrong ones');
{
    const q = parsePaperQuery('hello there', SUBJECTS);
    check('empty', q.empty, true);
    check('no grade', q.grade, undefined);
    check('no subject', q.subject, undefined);
}
{
    const q = parsePaperQuery('', SUBJECTS);
    check('empty string is empty', q.empty, true);
}
{
    const q = parsePaperQuery('asdfgh qwerty', SUBJECTS);
    check('gibberish invents nothing', q.empty, true);
    check('kept as leftover', q.leftover, 'asdfgh qwerty');
}

section('Years outside the catalog range are not years');
{
    const q = parsePaperQuery('form 2 physics 1999', SUBJECTS);
    check('1999 rejected', q.year, undefined);
    check('grade still parsed', q.grade, 'Form 2');
}

section('Unstocked subject falls back to the alias spelling');
{
    const q = parsePaperQuery('form 3 geography term 1', []);
    check('subject from alias table', q.subject, 'Geography');
    check('grade', q.grade, 'Form 3');
}

section('describeQuery reads back what was understood');
{
    const q = parsePaperQuery('form 4 mathematics end term 3 2025', SUBJECTS);
    check(
        'summary',
        describeQuery(q),
        'Form 4 · Mathematics · End of Term Exam · Term 3 · 2025'
    );
}

// ---------------------------------------------------------------------------

console.log(`\n${failures === 0 ? 'All' : `${checks - failures}/${checks}`} query-parser checks passed.`);
if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
}
