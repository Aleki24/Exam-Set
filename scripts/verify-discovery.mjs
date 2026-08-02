/**
 * Verification harness for discovery.
 *
 *   node scripts/verify-discovery.mjs
 *
 * `currentTerm` decides which papers get called "essentials" on the home page.
 * It is derived from the month rather than asked for, so getting a boundary
 * wrong means a teacher in September is shown Term 2 revision — the wrong half
 * of the year, at the exact moment the material matters most. Every boundary
 * month is pinned here, not just a sample.
 */

import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
    alias: { '@': new URL('../src', import.meta.url).pathname },
    interopDefault: true,
});

const { currentTerm } = await jiti.import('../src/services/discoveryService.ts');

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
    checks++;
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(
        `  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(34)} ${ok ? actual : `got ${actual}, expected ${expected}`}`
    );
}

function section(t) {
    console.log(`\n${t}`);
}

/** Noon on the 15th, to stay clear of timezone edges either side of midnight. */
const on = (month) => new Date(2026, month - 1, 15, 12, 0, 0);

// ---------------------------------------------------------------------------

section('Kenyan school terms, month by month');
const expected = {
    1: 'term-1',
    2: 'term-1',
    3: 'term-1',
    4: 'term-1',
    5: 'term-2',
    6: 'term-2',
    7: 'term-2',
    8: 'term-2',
    9: 'term-3',
    10: 'term-3',
    11: 'term-3',
    12: 'term-3',
};

const names = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

for (let m = 1; m <= 12; m++) {
    check(names[m], currentTerm(on(m)), expected[m]);
}

section('the boundaries themselves');
// The last day of one term and the first of the next, which is where an
// off-by-one lives.
check('30 April', currentTerm(new Date(2026, 3, 30, 12)), 'term-1');
check('1 May', currentTerm(new Date(2026, 4, 1, 12)), 'term-2');
check('31 August', currentTerm(new Date(2026, 7, 31, 12)), 'term-2');
check('1 September', currentTerm(new Date(2026, 8, 1, 12)), 'term-3');
check('31 December', currentTerm(new Date(2026, 11, 31, 12)), 'term-3');
check('1 January', currentTerm(new Date(2026, 0, 1, 12)), 'term-1');

section('it always answers');
checks++;
const live = currentTerm();
const valid = ['term-1', 'term-2', 'term-3'].includes(live);
if (!valid) failures++;
console.log(`  ${valid ? 'ok  ' : 'FAIL'} ${'called with no argument'.padEnd(34)} ${live}`);

// ---------------------------------------------------------------------------

console.log(`\n${failures === 0 ? 'All' : `${checks - failures}/${checks}`} discovery checks passed.`);
if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
}
