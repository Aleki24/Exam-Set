/**
 * Verification harness for learner progress.
 *
 *   node scripts/verify-progress.mjs
 *
 * `trendOf` is the only place in progress tracking that exercises judgement
 * rather than arithmetic, and it is the one a learner acts on: told they are
 * improving, they revise less. So it is tested hardest on refusing to answer.
 * Claiming a direction from three papers is noise wearing a confident label,
 * and a wrong "improving" costs somebody marks in a real exam.
 */

import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
    alias: { '@': new URL('../src', import.meta.url).pathname },
    interopDefault: true,
});

const { trendOf, TREND_LABEL } = await jiti.import('../src/services/progressService.ts');

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
    checks++;
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(
        `  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(50)} ${ok ? actual : `got ${actual}, expected ${expected}`}`
    );
}

function section(t) {
    console.log(`\n${t}`);
}

/** `recent` arrives newest first, which is the order the view returns. */
const results = (...percentages) => percentages.map((p) => ({ percentage: p }));

// ---------------------------------------------------------------------------

section('trendOf refuses to guess from too little');
check('no results at all', trendOf([]), 'unknown');
check('one paper', trendOf(results(70)), 'unknown');
check('three papers, steeply up', trendOf(results(90, 70, 40)), 'unknown');
check('five papers, the cutoff', trendOf(results(90, 85, 70, 55, 40)), 'unknown');
check('six unmarked papers', trendOf(results(null, null, null, null, null, null)), 'unknown');
check('six papers, only two marked', trendOf([{ percentage: 80 }, { percentage: 20 }, ...results(null, null, null, null)]), 'unknown');

section('trendOf reads a real direction once there is evidence');
// Newest first: 80, 78, 75 against oldest 45, 42, 40 — a 35-point rise.
check('marks climbing', trendOf(results(80, 78, 75, 60, 45, 42, 40)), 'improving');
check('marks falling', trendOf(results(40, 42, 45, 60, 75, 78, 80)), 'slipping');
check('marks flat', trendOf(results(60, 61, 59, 60, 60, 61, 59)), 'steady');

section('trendOf will not call noise a trend');
// The comparison is the newest third against the oldest third, so with seven
// results that is the top two against the bottom two. 61.5 vs 58.5 is three
// points — a better morning, not progress.
check('three points up is steady', trendOf(results(62, 61, 60, 60, 60, 59, 58)), 'steady');
check('three points down is steady', trendOf(results(58, 59, 60, 60, 60, 61, 62)), 'steady');
// 65 vs 60 is exactly the five-point threshold, and the threshold is inclusive.
check('five points up is improving', trendOf(results(65, 65, 65, 60, 60, 60, 60)), 'improving');

section('trendOf ignores unmarked papers rather than scoring them zero');
// Six marked results with nulls interleaved must still read as climbing. If a
// null were coerced to 0 this would come back 'slipping'.
check(
    'nulls do not drag the average down',
    trendOf([
        { percentage: 80 },
        { percentage: null },
        { percentage: 78 },
        { percentage: 75 },
        { percentage: null },
        { percentage: 45 },
        { percentage: 42 },
        { percentage: 40 },
    ]),
    'improving'
);

section('every trend has a label a learner can read');
for (const trend of ['improving', 'steady', 'slipping', 'unknown']) {
    checks++;
    const label = TREND_LABEL[trend];
    const ok = typeof label === 'string' && label.length > 0;
    if (!ok) failures++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${trend.padEnd(50)} ${label}`);
}

// ---------------------------------------------------------------------------

console.log(`\n${failures === 0 ? 'All' : `${checks - failures}/${checks}`} progress checks passed.`);
if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
}
