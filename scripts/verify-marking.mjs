/**
 * Verification harness for marking.
 *
 *   node scripts/verify-marking.mjs
 *
 * The rule this file exists to defend: UNMARKED IS NOT ZERO.
 *
 * `marks_awarded === null` means nobody marked it. `0` means it was marked and
 * earned nothing. Collapsing the two drags a learner's average down for gaps in
 * our marking schemes and reports strands as weak that were never assessed —
 * and since the whole purpose of the diagnostics is to decide what to revise
 * next, a false zero costs somebody the hours they had. Every check below is
 * ultimately about that distinction.
 */

import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
    alias: { '@': new URL('../src', import.meta.url).pathname },
    interopDefault: true,
});

const {
    markLocally,
    scorePaperWithTotals,
    parseNumber,
    numbersMatch,
    normalise,
    schemeIsUsable,
    schemeIsPlainAnswer,
    answerIsBlank,
    markLabel,
    UNMARKED,
} = await jiti.import('../src/services/markingService.ts');

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
    checks++;
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(
        `  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(50)} ${ok ? JSON.stringify(actual) : `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`
    );
}

function assert(label, condition, detail = '') {
    checks++;
    if (!condition) failures++;
    console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${label.padEnd(50)} ${detail}`);
}

function section(t) {
    console.log(`\n${t}`);
}

const q = (over = {}) => ({
    id: 'q1',
    type: 'Numeric',
    marks: 2,
    marking_scheme: '42',
    text: 'What is the answer?',
    ...over,
});

// ---------------------------------------------------------------------------

section('unmarked is never zero — the rule the whole file defends');
{
    // Real shapes from the live bank: an empty-string scheme, and a scheme that
    // points at material the marker does not have.
    const noScheme = markLocally(q({ type: 'Short Answer', marking_scheme: '' }), 'a real answer');
    check('empty scheme leaves marks null', noScheme.marksAwarded, null);
    check('and does not claim a marker', noScheme.markedBy, null);
    assert('and says why', typeof noScheme.note === 'string' && noScheme.note.length > 0, noScheme.note);

    const needsMap = markLocally(
        q({ type: 'Structured', marking_scheme: 'Answers must be read from the map of Kitu area supplied with the paper.' }),
        'North-East'
    );
    check('scheme needing absent material stays null', needsMap.marksAwarded, null);

    const nullScheme = markLocally(q({ type: 'Short Answer', marking_scheme: null }), 'answer');
    check('null scheme stays null', nullScheme.marksAwarded, null);
}

section('a blank answer IS zero — that one really was marked');
{
    const blank = markLocally(q(), '');
    check('no answer scores zero', blank.marksAwarded, 0);
    check('and is marked, not skipped', blank.markedBy, 'auto');
    check('and is not correct', blank.isCorrect, false);

    const spaces = markLocally(q(), '   ');
    check('whitespace only is also zero', spaces.marksAwarded, 0);
}

section('numeric marking, with tolerance for rounding');
{
    check('exact', markLocally(q(), '42').marksAwarded, 2);
    check('trailing zeros', markLocally(q(), '42.0').marksAwarded, 2);
    check('with units', markLocally(q({ marking_scheme: '42 cm' }), '42cm').marksAwarded, 2);
    check('thousands separator', markLocally(q({ marking_scheme: '1200' }), '1,200').marksAwarded, 2);
    check('wrong number scores zero', markLocally(q(), '41').marksAwarded, 0);
    check('and is marked', markLocally(q(), '41').markedBy, 'auto');
    check('negative numbers', markLocally(q({ marking_scheme: '-5' }), '-5').marksAwarded, 2);

    // Rounded pi is not an error worth a zero.
    check('3.14 for 3.14159', numbersMatch(3.14, 3.14159), true);
    check('3.1 for 3.14159 is too coarse', numbersMatch(3.1, 3.14159), false);

    check('parses from prose', parseNumber('about 42 apples'), 42);
    check('no number returns null', parseNumber('forty two'), null);
    check('null input', parseNumber(null), null);
}

section('a numeric scheme with no number defers rather than guessing');
{
    const deferred = markLocally(q({ marking_scheme: 'Award the mark for any correct method.' }), '42');
    check('returns null meaning "ask the model"', deferred, null);
}

section('fill-in-the-blank: only a match is trusted locally');
{
    const plain = q({ type: 'Fill-in-the-blank', marks: 1, marking_scheme: 'Nairobi' });
    check('exact match', markLocally(plain, 'Nairobi').marksAwarded, 1);
    check('case and spacing', markLocally(plain, '  nairobi ').marksAwarded, 1);
    check('trailing full stop', markLocally(plain, 'Nairobi.').marksAwarded, 1);
    check('full stop then space, as a phone types it', markLocally(plain, 'Nairobi. ').marksAwarded, 1);

    // A mismatch may be a valid synonym, so it must go to the model rather than
    // being marked wrong locally.
    check('a mismatch defers, never scores zero', markLocally(plain, 'Mombasa'), null);
}

section('a scheme listing alternatives is never matched as a string');
{
    // Straight from the live bank. Marking "nurses" wrong here would contradict
    // the examiner, who explicitly allowed it.
    const scheme = 'DOCTORS. Also accept: nurses, medical workers, health workers.';
    check('recognised as a rubric, not a plain answer', schemeIsPlainAnswer(scheme), false);
    check(
        'so it defers to the model',
        markLocally(q({ type: 'Fill-in-the-blank', marks: 1, marking_scheme: scheme }), 'nurses'),
        null
    );

    check('"any three of" is a rubric', schemeIsPlainAnswer('Any three of: a; b; c'), false);
    check('a comma list is a rubric', schemeIsPlainAnswer('North, East, South and West'), false);
    check('a plain word is not', schemeIsPlainAnswer('Cardinal points'), true);
}

section('a paper is scored out of what was actually marked');
{
    const marked = (m) => ({ marksAwarded: m, isCorrect: null, markedBy: 'auto', confidence: 1, note: null });

    const paper = scorePaperWithTotals([
        { mark: marked(3), marksPossible: 3 },
        { mark: marked(2), marksPossible: 4 },
        { mark: UNMARKED, marksPossible: 3 }, // no scheme
    ]);

    check('score counts only marked', paper.score, 5);
    // The unmarkable question's 3 marks must NOT be in the denominator, or the
    // learner is charged for our missing marking scheme.
    check('denominator excludes the unmarked', paper.maxScore, 7);
    check('percentage is out of 7, not 10', paper.percentage, 71.4);
    check('marked count', paper.markedCount, 2);
    check('unmarked count', paper.unmarkedCount, 1);
}

section('a wholly unmarkable paper reports no percentage rather than zero');
{
    const paper = scorePaperWithTotals([
        { mark: UNMARKED, marksPossible: 5 },
        { mark: UNMARKED, marksPossible: 5 },
    ]);
    check('percentage is null, not 0', paper.percentage, null);
    check('max score is zero', paper.maxScore, 0);
    check('nothing marked', paper.markedCount, 0);
}

section('a genuinely zero paper is different from an unmarked one');
{
    const zero = { marksAwarded: 0, isCorrect: false, markedBy: 'auto', confidence: 1, note: null };
    const paper = scorePaperWithTotals([
        { mark: zero, marksPossible: 5 },
        { mark: zero, marksPossible: 5 },
    ]);
    check('percentage is 0, not null', paper.percentage, 0);
    check('and it was marked', paper.markedCount, 2);
}

section('helpers');
check('blank detection', answerIsBlank('  '), true);
check('non-blank', answerIsBlank('a'), false);
check('normalise', normalise('  Hello,  World.  '), 'hello, world');
// The case that was actually broken: a phone keyboard adds a space after a
// full stop, which left the punctuation on and marked a correct answer wrong.
check('trailing punctuation THEN space', normalise('Nairobi. '), 'nairobi');
check('trailing space then punctuation', normalise('Nairobi .'), 'nairobi');
check('usable scheme', schemeIsUsable('North and South'), true);
check('empty string is not usable', schemeIsUsable(''), false);
check('single character is not usable', schemeIsUsable('.'), false);

section('every mark can be described honestly to a learner');
check('unmarked', markLabel(UNMARKED), 'Not marked');
check('arithmetic', markLabel({ ...UNMARKED, marksAwarded: 1, markedBy: 'auto' }), 'Marked automatically');
check('self', markLabel({ ...UNMARKED, marksAwarded: 1, markedBy: 'self' }), 'You marked this');
check(
    'confident AI',
    markLabel({ ...UNMARKED, marksAwarded: 1, markedBy: 'ai', confidence: 0.9 }),
    'Marked by AI'
);
check(
    'unsure AI invites a check',
    markLabel({ ...UNMARKED, marksAwarded: 1, markedBy: 'ai', confidence: 0.4 }),
    'Marked by AI — worth checking'
);

// ---------------------------------------------------------------------------

console.log(`\n${failures === 0 ? 'All' : `${checks - failures}/${checks}`} marking checks passed.`);
if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
}
