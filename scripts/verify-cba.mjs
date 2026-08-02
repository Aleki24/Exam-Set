/**
 * Verification harness for competency-based assessment.
 *
 *   node scripts/verify-cba.mjs
 *
 * Two things here decide whether a teacher makes a KNEC deadline.
 *
 * The completeness check is what finds a missing score while the class is still
 * in the room. Miss it and the gap is found at the portal on deadline day, when
 * the learner has gone home and the score gets guessed.
 *
 * The CSV is what gets keyed into the national grid. An unquoted comma in a
 * learner's name shifts every later column by one, and nobody notices until a
 * child is recorded against somebody else's outcome.
 */

import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
    alias: { '@': new URL('../src', import.meta.url).pathname },
    interopDefault: true,
});

const {
    PERFORMANCE_LEVELS,
    LEVEL_BY_CODE,
    isPerformanceLevel,
    levelName,
    completeness,
    distribution,
    toExportRows,
    toCsv,
} = await jiti.import('../src/lib/cbaRubric.ts');

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
    checks++;
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(
        `  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(48)} ${ok ? JSON.stringify(actual) : `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`
    );
}

function assert(label, condition, detail = '') {
    checks++;
    if (!condition) failures++;
    console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${label.padEnd(48)} ${detail}`);
}

function section(t) {
    console.log(`\n${t}`);
}

const outcomes = [
    { id: 'o1', title: 'Selects appropriate materials' },
    { id: 'o2', title: 'Works safely with tools' },
];

const learners = [
    { id: 'l1', name: 'Achieng Otieno', admissionNumber: '12' },
    { id: 'l2', name: 'Brian Kimani', admissionNumber: '13' },
];

// ---------------------------------------------------------------------------

section('the four levels, as KNEC defines them');
check('there are exactly four', PERFORMANCE_LEVELS.length, 4);
check('BE is 1', LEVEL_BY_CODE.BE.value, 1);
check('AE is 2', LEVEL_BY_CODE.AE.value, 2);
check('ME is 3', LEVEL_BY_CODE.ME.value, 3);
check('EE is 4', LEVEL_BY_CODE.EE.value, 4);
check('ME is the target, named plainly', LEVEL_BY_CODE.ME.name, 'Meeting Expectation');

section('only the four codes are accepted');
check('ME', isPerformanceLevel('ME'), true);
check('a mark out of four is not a level', isPerformanceLevel('3'), false);
check('lowercase is not a level', isPerformanceLevel('me'), false);
check('empty', isPerformanceLevel(''), false);
check('null', isPerformanceLevel(null), false);
check('an object', isPerformanceLevel({ code: 'ME' }), false);
check('unscored reads as such', levelName(null), 'Not scored');

section('completeness finds the gap while the class is still there');
{
    const partial = { l1: { o1: 'ME', o2: 'AE' }, l2: { o1: 'EE' } };
    const done = completeness(['l1', 'l2'], outcomes, partial);

    check('expected is learners x outcomes', done.expected, 4);
    check('scored counts only filled cells', done.scored, 3);
    check('missing', done.missing, 1);
    check('not complete', done.complete, false);
    check('names exactly who is unfinished', done.incompleteLearners.length, 1);
    check('and which one', done.incompleteLearners[0], 'l2');
}

section('a full sheet is complete');
{
    const full = { l1: { o1: 'ME', o2: 'AE' }, l2: { o1: 'EE', o2: 'BE' } };
    const done = completeness(['l1', 'l2'], outcomes, full);
    check('complete', done.complete, true);
    check('nothing missing', done.missing, 0);
    check('nobody unfinished', done.incompleteLearners.length, 0);
}

section('an empty sheet is not "complete"');
{
    // Zero of zero is arithmetically 100%, and would tell a teacher an
    // unstarted assessment was ready for the portal.
    const done = completeness([], [], {});
    check('no learners, no outcomes, not complete', done.complete, false);
    const noneScored = completeness(['l1', 'l2'], outcomes, {});
    check('nothing scored at all', noneScored.complete, false);
    check('everything missing', noneScored.missing, 4);
}

section('distribution counts levels rather than averaging them');
{
    const sheet = { l1: { o1: 'ME' }, l2: { o1: 'ME' }, l3: { o1: 'BE' } };
    const d = distribution('o1', ['l1', 'l2', 'l3', 'l4'], sheet);
    check('two meeting', d.ME, 2);
    check('one below', d.BE, 1);
    check('none approaching', d.AE, 0);
    // The fourth learner has no score, and that is its own category — not a zero
    // that would drag an average nobody should be computing anyway.
    check('one unscored, counted separately', d.unscored, 1);
}

section('export rows are ordered like the register a teacher reads from');
{
    const sheet = { l2: { o1: 'EE', o2: 'ME' }, l1: { o1: 'ME', o2: 'AE' } };
    // Deliberately passed out of order.
    const rows = toExportRows([learners[1], learners[0]], outcomes, sheet);
    check('a row per learner per outcome', rows.length, 4);
    check('sorted by name, not insertion', rows[0].learnerName, 'Achieng Otieno');
    check('outcomes stay in order', rows[0].outcome, 'Selects appropriate materials');
    check('level travels with it', rows[0].level, 'ME');
    check('and its ordinal for the portal', rows[0].levelValue, 3);
}

section('an unscored cell exports blank, never as a level');
{
    const rows = toExportRows(learners, outcomes, { l1: { o1: 'ME' } });
    const blank = rows.find((r) => r.learnerName === 'Achieng Otieno' && r.outcome === 'Works safely with tools');
    check('level is empty', blank.level, '');
    check('and so is the ordinal', blank.levelValue, '');
}

section('CSV quoting — an unquoted comma shifts every later column');
{
    const tricky = [{ id: 'l9', name: 'Otieno, Achieng', admissionNumber: '7' }];
    const trickyOutcomes = [{ id: 'o1', title: 'Measures, cuts and joins' }];
    const csv = toCsv(toExportRows(tricky, trickyOutcomes, { l9: { o1: 'ME' } }));
    const line = csv.split('\n')[1];

    assert('a name with a comma is quoted', line.includes('"Otieno, Achieng"'), line);
    assert('an outcome with a comma is quoted', line.includes('"Measures, cuts and joins"'), line);
    // Header is 5 columns; a broken escape would make the row longer.
    check('the row still has five fields', splitCsvLine(line).length, 5);
}

section('CSV escaping of quotes themselves');
{
    const quoted = [{ id: 'l1', name: 'The "Captain" Mwangi', admissionNumber: '1' }];
    const csv = toCsv(toExportRows(quoted, outcomes, {}));
    const line = csv.split('\n')[1];
    assert('inner quotes are doubled', line.includes('"The ""Captain"" Mwangi"'), line);
    check('and the row is still five fields', splitCsvLine(line).length, 5);
}

section('CSV header');
{
    const csv = toCsv(toExportRows(learners, outcomes, {}));
    check('header names the admission number first', csv.split('\n')[0].split(',')[0], 'Admission number');
    check('one header plus a row per cell', csv.split('\n').length, 1 + learners.length * outcomes.length);
}

/** A minimal RFC-4180 splitter, so the tests do not trust the code they test. */
function splitCsvLine(line) {
    const out = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inQuotes) {
            if (c === '"' && line[i + 1] === '"') {
                field += '"';
                i++;
            } else if (c === '"') {
                inQuotes = false;
            } else {
                field += c;
            }
        } else if (c === '"') {
            inQuotes = true;
        } else if (c === ',') {
            out.push(field);
            field = '';
        } else {
            field += c;
        }
    }
    out.push(field);
    return out;
}

// ---------------------------------------------------------------------------

console.log(`\n${failures === 0 ? 'All' : `${checks - failures}/${checks}`} CBA checks passed.`);
if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
}
