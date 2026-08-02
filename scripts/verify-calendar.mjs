/**
 * Verification harness for the exam calendar and trust signals.
 *
 *   node scripts/verify-calendar.mjs
 *
 * A countdown is a promise about a real date, and a learner who plans around
 * "42 days to KCSE" and finds the paper is in three weeks has been actively
 * harmed by a decorative widget. So this is tested hardest on the cases where
 * the honest answer is silence: no level, a level that sits nothing, a sitting
 * already past, and a calendar nobody has reviewed.
 */

import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
    alias: { '@': new URL('../src', import.meta.url).pathname },
    interopDefault: true,
});

const { nextSitting, countdownLabel, calendarIsStale, freshnessLabel, isCurrentYear, EXAM_CALENDAR } =
    await jiti.import('../src/lib/examCalendar.ts');

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
    checks++;
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(
        `  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(46)} ${ok ? JSON.stringify(actual) : `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`
    );
}

function assert(label, condition, detail = '') {
    checks++;
    if (!condition) failures++;
    console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${label.padEnd(46)} ${detail}`);
}

function section(t) {
    console.log(`\n${t}`);
}

const on = (iso) => new Date(`${iso}T09:00:00`);

// ---------------------------------------------------------------------------

section('silence is the right answer more often than a countdown');
check('no level at all still finds the soonest', typeof nextSitting(null, on('2026-08-01')), 'object');
check('a level that sits no national exam', nextSitting('lower-primary', on('2026-08-01')), null);
check('playgroup', nextSitting('pg', on('2026-08-01')), null);
check('pre-primary', nextSitting('pp', on('2026-08-01')), null);
check('after every sitting has passed', nextSitting('form-1-4', on('2026-12-31')), null);
check('a calendar past its review date', nextSitting('form-1-4', on('2027-08-01')), null);

section('the calendar refuses to outlive its review date');
check('inside the window', calendarIsStale(on('2027-06-29')), false);
check('past the window', calendarIsStale(on('2027-07-01')), true);

section('countdowns land on the right sitting');
{
    const kcse = nextSitting('form-1-4', on('2026-08-01'));
    assert('Form 1-4 gets KCSE', kcse?.sitting.exam === 'kcse', kcse?.sitting.name);
    const kjsea = nextSitting('junior-school', on('2026-08-01'));
    assert('Junior School gets KJSEA', kjsea?.sitting.exam === 'kjsea', kjsea?.sitting.name);
    const kpsea = nextSitting('upper-primary', on('2026-08-01'));
    assert('Upper Primary gets KPSEA', kpsea?.sitting.exam === 'kpsea', kpsea?.sitting.name);
}

section('day arithmetic, including the day itself');
{
    // KCSE 2026 starts 2 November.
    const dayBefore = nextSitting('form-1-4', on('2026-11-01'));
    check('the day before', dayBefore?.daysAway, 1);
    check('reads as tomorrow', countdownLabel(dayBefore), 'Tomorrow');

    const theDay = nextSitting('form-1-4', on('2026-11-02'));
    check('the day itself is zero, not negative', theDay?.daysAway, 0);
    check('and never says "0 days"', countdownLabel(theDay), 'Starts today');

    const week = nextSitting('form-1-4', on('2026-10-29'));
    check('four days out', week?.daysAway, 4);
    check('reads in days', countdownLabel(week), '4 days away');
}

section('nothing claims to be confirmed that has not been');
for (const sitting of EXAM_CALENDAR) {
    checks++;
    // Every entry must carry the flag explicitly; an undefined would render as
    // "expected" by accident rather than by decision.
    const ok = typeof sitting.confirmed === 'boolean';
    if (!ok) failures++;
    console.log(
        `  ${ok ? 'ok  ' : 'FAIL'} ${`${sitting.name} ${sitting.year}`.padEnd(46)} ${sitting.confirmed ? 'confirmed' : 'expected'}`
    );
}

section('freshness badges only ever say what the row says');
check('no year, no badge', freshnessLabel(null, on('2026-08-01')), null);
check('undefined year, no badge', freshnessLabel(undefined, on('2026-08-01')), null);
check('this year', freshnessLabel(2026, on('2026-08-01')), 'Updated for 2026');
check('next year', freshnessLabel(2027, on('2026-08-01')), 'For 2027');
check('last year is named, not dressed up', freshnessLabel(2025, on('2026-08-01')), '2025 paper');
check('older gets nothing', freshnessLabel(2019, on('2026-08-01')), null);

check('isCurrentYear on a null', isCurrentYear(null, on('2026-08-01')), false);
check('isCurrentYear on an old paper', isCurrentYear(2020, on('2026-08-01')), false);
check('isCurrentYear on this year', isCurrentYear(2026, on('2026-08-01')), true);

// ---------------------------------------------------------------------------

console.log(`\n${failures === 0 ? 'All' : `${checks - failures}/${checks}`} calendar checks passed.`);
if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
}
