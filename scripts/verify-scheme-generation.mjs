/**
 * Verification harness for the marking-scheme generator.
 *
 *   node scripts/verify-scheme-generation.mjs
 *
 * The live call to the AI provider is not exercised here — there are no AI
 * credentials in this environment, and `verify-marking.mjs` sets the
 * precedent for this codebase of testing the deterministic parts of an AI
 * feature rather than the network call itself. What is checked is everything
 * around that call with no I/O in it: reading the model's JSON reply, the
 * options it is shown a multiple-choice question with, and the confidence it
 * claims.
 *
 * `parseVerdict` matters most. A marking scheme this produces can sit on a
 * live question for a long time before anyone reads it again — unlike a wrong
 * extracted question, which a teacher rejects on sight in the preview table —
 * so the read of what the model said has to survive the same messiness real
 * models produce: a code fence around the JSON, stray prose before or after
 * it, a field of the wrong type.
 */

import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
    alias: { '@': new URL('../src', import.meta.url).pathname },
    interopDefault: true,
});

const { parseVerdict, clampConfidence, optionsToLines } = await jiti.import(
    '../src/services/schemeGeneration.ts'
);
const { cleanText } = await jiti.import('../src/services/paperLayout.ts');

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
    checks++;
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(
        `  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(52)} ${
            ok ? JSON.stringify(actual) : `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`
        }`
    );
}

function assert(label, condition, detail = '') {
    checks++;
    if (!condition) failures++;
    console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${label.padEnd(52)} ${detail}`);
}

const section = (t) => console.log(`\n${t}`);

// ---------------------------------------------------------------------------

section('parseVerdict reads a clean reply');
check(
    'a well-formed object',
    parseVerdict('{"marking_scheme": "Paris", "confidence": 0.9, "can_generate": true}'),
    { marking_scheme: 'Paris', confidence: 0.9, can_generate: true }
);

section('parseVerdict survives the ways a model actually replies');
check(
    'wrapped in a ```json code fence',
    parseVerdict('```json\n{"marking_scheme": "Paris", "can_generate": true}\n```'),
    { marking_scheme: 'Paris', can_generate: true }
);
check(
    'a bare code fence with no language tag',
    parseVerdict('```\n{"marking_scheme": "Paris", "can_generate": true}\n```'),
    { marking_scheme: 'Paris', can_generate: true }
);
check(
    'prose before the JSON',
    parseVerdict('Here is the marking scheme:\n{"marking_scheme": "Paris", "can_generate": true}'),
    { marking_scheme: 'Paris', can_generate: true }
);
check(
    'prose after the JSON too',
    parseVerdict('{"marking_scheme": "Paris", "can_generate": true}\nLet me know if you need anything else.'),
    { marking_scheme: 'Paris', can_generate: true }
);
check(
    'surrounding whitespace',
    parseVerdict('   \n  {"marking_scheme": "Paris", "can_generate": true}  \n  '),
    { marking_scheme: 'Paris', can_generate: true }
);

section('parseVerdict refuses rather than half-reads something broken');
check('empty string', parseVerdict(''), null);
check('no JSON object anywhere', parseVerdict('Sorry, I cannot help with that.'), null);
check('truncated mid-object', parseVerdict('{"marking_scheme": "Paris", "can_gen'), null);
check('not actually JSON inside the braces', parseVerdict('{not: valid, json: here}'), null);
// A closing brace that comes before the opening one is not a valid object,
// even though both characters are present in the string.
check('braces in the wrong order', parseVerdict('} some text {'), null);

section('clampConfidence is always a real number between 0 and 1');
check('a normal value passes through', clampConfidence(0.75), 0.75);
check('exactly 0', clampConfidence(0), 0);
check('exactly 1', clampConfidence(1), 1);
check('above 1 is capped', clampConfidence(1.5), 1);
check('negative is floored at 0', clampConfidence(-0.3), 0);
check('a numeric string is read', clampConfidence('0.4'), 0.4);
check('missing entirely defaults to a middling 0.5', clampConfidence(undefined), 0.5);
check('not a number at all defaults to 0.5', clampConfidence('high'), 0.5);
check('NaN defaults to 0.5', clampConfidence(NaN), 0.5);
check('null defaults to 0.5', clampConfidence(null), 0.5);

section('optionsToLines letters a clean set of options');
check(
    'a plain string array',
    optionsToLines(['Paris', 'London', 'Rome']),
    'A. Paris\nB. London\nC. Rome'
);
check(
    'an object keyed by letter',
    optionsToLines({ a: 'Paris', b: 'London' }),
    'A. Paris\nB. London'
);
check(
    'objects carrying a text field',
    optionsToLines([{ text: 'Paris' }, { text: 'London' }]),
    'A. Paris\nB. London'
);

section('optionsToLines has nothing to show when there is nothing to show');
check('no options at all', optionsToLines(undefined), '');
check('null', optionsToLines(null), '');
check('an empty array', optionsToLines([]), '');
check('an array of blanks', optionsToLines(['', '   ']), '');
check('a plain string rather than a list', optionsToLines('Paris'), '');

section('The question text handed to the model is cleaned, not the raw row');
// A local copy of HTML/markdown stripping used to live here and got the
// spacing wrong on a closing inline tag next to punctuation — see the fixed
// version. Reusing paperLayout's cleanText instead means one implementation to
// keep correct, already covered in depth by verify-paper-pdf.mjs. This is a
// smoke check that the reuse is real, not a re-test of that logic.
check('tags stripped, no stray space before punctuation', cleanText('<p>What is <strong>photosynthesis</strong>?</p>'), 'What is photosynthesis?');
check('a question with no markup is untouched', cleanText('Define osmosis.'), 'Define osmosis.');

// ---------------------------------------------------------------------------

console.log(`\n${failures === 0 ? 'All' : `${checks - failures}/${checks}`} scheme-generation checks passed.`);
if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
}
