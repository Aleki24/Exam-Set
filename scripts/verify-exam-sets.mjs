/**
 * Verification harness for exam sets.
 *
 *   node scripts/verify-exam-sets.mjs
 *
 * No database and no network. Three things are checked, and they are the three
 * that decide whether a school's twelve-subject sitting stays one set:
 *
 *   1. the name offered for a new set,
 *   2. the fingerprint that decides two uploads belong together,
 *   3. that the filter builder actually restricts by set.
 *
 * The fingerprint cases matter most. Too loose and two schools merge into one
 * set, which nobody notices until a teacher buys the wrong exam; too strict and
 * a sitting fragments into twelve sets of one, which is the feature quietly not
 * working.
 */

import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
    alias: { '@': new URL('../src', import.meta.url).pathname },
    interopDefault: true,
});

const { suggestSetName, setFingerprint, setSlugStem, describeSet, canSuggestSet } =
    await jiti.import('../src/lib/examSets.ts');
const { applyPaperFilters } = await jiti.import('../src/services/paperSearch.ts');
const { shortTitle, paperFacts } = await jiti.import('../src/services/whatsappBot.ts');

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
    checks++;
    const ok = actual === expected;
    if (!ok) failures++;
    const status = ok ? 'ok  ' : 'FAIL';
    const detail = ok ? `${actual}` : `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`;
    console.log(`  ${status} ${label.padEnd(38)} ${detail}`);
}

function section(title) {
    console.log(`\n${title}`);
}

const KABRAS = {
    institution: 'Kabras High School',
    exam_type: 'mock',
    term_slug: 'term-2',
    year: 2025,
};

// ---------------------------------------------------------------------------

section('The name offered for a new set');
{
    check('the example from the brief', suggestSetName(KABRAS), 'Kabras High School Mock Exam Term 2 2025');
    check(
        'a school with nothing else known',
        suggestSetName({ institution: 'Bunyore Girls' }),
        'Bunyore Girls'
    );
    check('nothing known at all', suggestSetName({}), '');
}

section('There is nothing to suggest without a school');
{
    check('school present', canSuggestSet(KABRAS), true);
    check('school absent', canSuggestSet({ exam_type: 'mock', year: 2025 }), false);
    check('school is whitespace', canSuggestSet({ institution: '   ' }), false);
}

section('Two uploads from the same sitting fingerprint alike');
{
    const base = setFingerprint(KABRAS);
    check('identical input', setFingerprint({ ...KABRAS }), base);
    check('different case', setFingerprint({ ...KABRAS, institution: 'KABRAS HIGH SCHOOL' }), base);
    check('extra whitespace', setFingerprint({ ...KABRAS, institution: ' Kabras  High   School ' }), base);
    check('year as a string', setFingerprint({ ...KABRAS, year: '2025' }), base);
}

section('Genuinely different sittings do not');
{
    const base = setFingerprint(KABRAS);
    const differs = (label, patch) => {
        checks++;
        const ok = setFingerprint({ ...KABRAS, ...patch }) !== base;
        if (!ok) failures++;
        console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(38)} ${ok ? 'differs' : 'COLLIDED'}`);
    };

    differs('another term', { term_slug: 'term-3' });
    differs('another year', { year: 2024 });
    differs('another exam type', { exam_type: 'end-term' });
    // The normalisation is deliberately shallow: merging two schools is a worse
    // failure than duplicating one, because a wrong merge sells the wrong exam.
    differs('a different school', { institution: 'Kabras Boys High School' });
}

section('Slugs are URL-safe and never empty');
{
    check('the example', setSlugStem('Kabras High School Mock Term 2 2025'), 'kabras-high-school-mock-term-2-2025');
    check('punctuation stripped', setSlugStem("St. Mary's — Joint Mock"), 'st-mary-s-joint-mock');
    check('nothing usable', setSlugStem('!!!'), 'set');
}

section('A set describes itself without repeating the school');
{
    check(
        'full',
        describeSet({ exam_type: 'mock', term_slug: 'term-2', year: 2025, paper_count: 12 }),
        'Mock Exam · Term 2 · 2025 · 12 papers'
    );
    check('one paper', describeSet({ paper_count: 1 }), '1 paper');
    check('nothing known', describeSet({}), '');
}

section('The filter builder restricts by set');
{
    // A stand-in for the Supabase query builder: records what was asked of it.
    const calls = [];
    const stub = {
        eq: (col, val) => (calls.push(`eq:${col}=${val}`), stub),
        gt: (col, val) => (calls.push(`gt:${col}=${val}`), stub),
        in: (col, vals) => (calls.push(`in:${col}=[${vals.join(',')}]`), stub),
        or: (expr) => (calls.push(`or:${expr}`), stub),
    };

    applyPaperFilters(stub, { setIds: ['a', 'b'], subject: 'Mathematics' });
    check('set restricted', calls.includes('in:set_id=[a,b]'), true);
    check('other filters untouched', calls.includes('eq:subject=Mathematics'), true);

    calls.length = 0;
    applyPaperFilters(stub, { subject: 'Mathematics' });
    check(
        'no set filter when none asked for',
        calls.some((c) => c.startsWith('in:set_id')),
        false
    );

    calls.length = 0;
    applyPaperFilters(stub, { setIds: [] });
    check(
        'an empty list is not a filter',
        calls.some((c) => c.startsWith('in:set_id')),
        false
    );
}

section('A sitting renders as distinguishable WhatsApp rows');
{
    // The failure this prevents: every paper in one school's Form 4 mock used
    // to render as the identical row "Form 4 Mathematics", with nothing on
    // screen to tell Paper 1 from Paper 2 and a PDF arriving either way.
    const p1 = {
        grade_label: 'Form 4',
        subject: 'Mathematics',
        paper_number: 'Paper 1',
        exam_type: 'mock',
        year: 2025,
        total_marks: 100,
        has_marking_scheme: true,
        exam_sets: { name: 'Kabras Mock End Term 2 2025' },
    };
    const p2 = { ...p1, paper_number: 'Paper 2' };

    check('paper 1 titled', shortTitle(p1), 'Form 4 Mathematics P1');
    check('paper 2 titled', shortTitle(p2), 'Form 4 Mathematics P2');
    checks++;
    if (shortTitle(p1) === shortTitle(p2)) {
        failures++;
        console.log('  FAIL two papers, one row                    IDENTICAL');
    } else {
        console.log('  ok   two papers, two rows                   distinct');
    }

    // Meta truncates list titles at 24 characters, so a longer title than that
    // loses the very part that distinguishes it.
    const longA = shortTitle({ ...p1, subject: 'Integrated Science' });
    const longB = shortTitle({ ...p2, subject: 'Integrated Science' });
    checks++;
    if (longA.length <= 24 && longB.length <= 24) {
        console.log(`  ok   fits Meta's 24-char title limit        ${longA.length} chars`);
    } else {
        failures++;
        console.log(`  FAIL fits Meta's 24-char title limit        ${longA.length} chars: ${longA}`);
    }
    // And the part that got shortened is the subject, not the paper number.
    check('long subject keeps its number', longA.endsWith('P1'), true);
    checks++;
    if (longA !== longB) {
        console.log('  ok   long subjects stay distinguishable     distinct');
    } else {
        failures++;
        console.log(`  FAIL long subjects stay distinguishable     both "${longA}"`);
    }

    check('the sitting names the row', paperFacts(p1), 'Kabras Mock End Term 2 2025 · 2025 · 100 marks · + scheme');
    check(
        'an ungrouped paper still says its type',
        paperFacts({ ...p1, exam_sets: undefined }),
        'Mock Exam · 2025 · 100 marks · + scheme'
    );
    check('no paper number, no noise', shortTitle({ grade_label: 'Grade 9', subject: 'English' }), 'Grade 9 English');
}

// ---------------------------------------------------------------------------

console.log(`\n${failures === 0 ? 'All' : `${checks - failures}/${checks}`} exam-set checks passed.`);
if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
}
