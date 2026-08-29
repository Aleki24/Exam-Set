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
// EXAM SETS
//
// Before sets existed, a school name was silently dropped: "kabras mock end
// term 2" parsed to a mock in term 2 and the word Kabras went into `leftover`,
// which nothing reads. These are the cases that used to fail.
// ---------------------------------------------------------------------------

const SETS = [
    { id: 'set-kabras-t2', name: 'Kabras Mock End Term 2 2025', institution: 'Kabras High School' },
    { id: 'set-kabras-t1', name: 'Kabras Mock End Term 1 2025', institution: 'Kabras High School' },
    { id: 'set-bunyore', name: 'Bunyore Girls Joint Mock 2025', institution: 'Bunyore Girls' },
];

section('The school name is no longer thrown away');
{
    const q = parsePaperQuery('kabras mock end term 2 2025', SUBJECTS, SETS);
    check('set matched', JSON.stringify(q.setIds), JSON.stringify(['set-kabras-t2']));
    check('label echoed', q.setLabel, 'Kabras Mock End Term 2 2025');
    check('not empty', q.empty, false);
    check('nothing left over', q.leftover, '');
}

section('A school on its own means every sitting it published');
{
    const q = parsePaperQuery('kabras high school maths', SUBJECTS, SETS);
    check(
        'both Kabras sets',
        JSON.stringify([...(q.setIds ?? [])].sort()),
        JSON.stringify(['set-kabras-t1', 'set-kabras-t2'])
    );
    check('subject still parsed', q.subject, 'Mathematics');
    check('school consumed', q.leftover, '');
}

section('The full set name beats the school name');
{
    // Both match the text; the specific one must win, or asking for one sitting
    // returns every paper the school has ever published.
    const q = parsePaperQuery('kabras mock end term 1 2025', SUBJECTS, SETS);
    check('one set, not two', q.setIds?.length, 1);
    check('the right one', q.setIds?.[0], 'set-kabras-t1');
}

section('A set is never invented');
{
    const q = parsePaperQuery('shimba hills mock', SUBJECTS, SETS);
    check('no set', q.setIds, undefined);
    check('exam type still read', q.examType, 'mock');
}
{
    // Word boundaries: without them "cre" matches inside a school name and a
    // subject request quietly becomes a school request.
    const q = parsePaperQuery('cre form 4', SUBJECTS, [
        { id: 'set-sacred', name: 'Sacred Heart Mock 2025', institution: 'Sacred Heart' },
    ]);
    check('no accidental school', q.setIds, undefined);
}

section('With no sets stocked, the sentence parses as it always did');
{
    // "end term" wins over "mock" here because it is the longer synonym — the
    // pre-existing behaviour, unchanged. The point of the check is that the
    // school name is the only thing lost when there are no sets to match.
    const q = parsePaperQuery('kabras mock end term 2', SUBJECTS, []);
    check('no set', q.setIds, undefined);
    check('exam type', q.examType, 'end-term');
    check('term', q.term, 'term-2');
    // "mock" lingers because the exam-type pass matched "end term" and claimed
    // only those words — pre-existing, and harmless since nothing reads
    // leftover. The school name landing here is the loss this feature undoes.
    check('school falls to leftover', q.leftover, 'kabras mock');
}

section('A matched set name is not also read as filters');
{
    // The set name contains "mock", "end term 2" and "2025". None of them
    // should survive as filters: they describe the set, and the set is already
    // the filter.
    const q = parsePaperQuery('kabras mock end term 2 2025', SUBJECTS, SETS);
    check('no exam type', q.examType, undefined);
    check('no term', q.term, undefined);
    check('no year', q.year, undefined);
}
{
    // But a dimension the person added themselves must survive.
    const q = parsePaperQuery('kabras high school form 4 maths term 3', SUBJECTS, SETS);
    check('school matched', q.setIds?.length, 2);
    check('grade kept', q.grade, 'Form 4');
    check('subject kept', q.subject, 'Mathematics');
    check('term kept', q.term, 'term-3');
}

section('A school is recognised by the name people call it');
{
    // Nobody types "Kabras High School" — they type "kabras". Until this
    // matched, the shortest and commonest way to name a school found nothing.
    const q = parsePaperQuery('kabras form 4 maths', SUBJECTS, SETS);
    check('both sittings matched', q.setIds?.length, 2);
    check('the school is named back', q.setLabel, 'Kabras High School');
    check('the rest still parses', q.grade, 'Form 4');
    check('nothing left over', q.leftover, '');
}
{
    // The words every school shares identify none of them. Answering "high" or
    // "school" with whichever institution sorted first is a wrong paper
    // delivered confidently, which is worse than no match at all.
    for (const generic of ['high school papers', 'girls school', 'mock']) {
        const q = parsePaperQuery(generic, SUBJECTS, SETS);
        check(`"${generic}" names no school`, q.setIds, undefined);
    }
}
{
    // Two schools sharing a distinctive word is the ambiguous case. Neither is
    // picked; the word falls through to the free-text search, where it belongs.
    const shared = [
        { id: 'a', name: 'Nyeri Mock 2025', institution: 'Nyeri Boys' },
        { id: 'b', name: 'Nyeri Joint 2025', institution: 'Nyeri Girls' },
    ];
    const q = parsePaperQuery('nyeri maths', SUBJECTS, shared);
    check('an ambiguous school is not guessed', q.setIds, undefined);
    check('and the word survives to be searched', q.leftover, 'nyeri');
}

section('describeQuery leads with the sitting');
{
    const q = parsePaperQuery('kabras mock end term 2 2025 mathematics', SUBJECTS, SETS);
    check('summary', describeQuery(q), 'Kabras Mock End Term 2 2025 · Mathematics');
}

// ---------------------------------------------------------------------------

console.log(`\n${failures === 0 ? 'All' : `${checks - failures}/${checks}`} query-parser checks passed.`);
if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
}
