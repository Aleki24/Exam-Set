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
 * Reading the model's reply used to be the riskiest part and is now the
 * safest: the reply is constrained to a schema at the API, so the fence-
 * stripping and brace-hunting that used to stand between a model's prose and a
 * marking scheme are gone. What is left to check is that the schema still
 * describes what the code reads, and that the values it cannot constrain — a
 * confidence outside 0..1, an options list of the wrong shape — are still
 * handled here. A scheme this produces can sit on a live question for a long
 * time before anyone reads it again, unlike a wrong extracted question that a
 * teacher rejects on sight in the preview table.
 */

import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
    alias: { '@': new URL('../src', import.meta.url).pathname },
    interopDefault: true,
});

const { clampConfidence, optionsToLines, SCHEME_SCHEMA } = await jiti.import(
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

section('The reply shape is guaranteed by the schema, not by parsing prose');
{
    // parseVerdict used to live here: it stripped ```json fences, hunted for
    // the first `{` and the last `}`, and returned null when a model wrapped
    // its answer in a sentence. `output_config.format` constrains the reply at
    // the API instead, so there is no prose to dig a JSON object out of and
    // nothing left to test on that path. What still has to hold is that the
    // schema and the code agree about the field names — a rename on one side
    // and not the other would fail only in production.
    const fields = Object.keys(SCHEME_SCHEMA.properties);
    check('the schema names exactly the fields the code reads', fields.sort(), [
        'can_generate',
        'confidence',
        'marking_scheme',
        'reason',
    ]);
    check('every one of them is required', [...SCHEME_SCHEMA.required].sort(), fields.sort());
    assert('and nothing else may be returned', SCHEME_SCHEMA.additionalProperties === false, 'false');
    assert('marking_scheme is a string', SCHEME_SCHEMA.properties.marking_scheme.type === 'string', 'string');
    assert('can_generate is a boolean', SCHEME_SCHEMA.properties.can_generate.type === 'boolean', 'boolean');
    assert('confidence is a number', SCHEME_SCHEMA.properties.confidence.type === 'number', 'number');
}

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
