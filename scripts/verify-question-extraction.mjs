/**
 * Verification harness for reading a model's extracted-questions JSON.
 *
 *   node scripts/verify-question-extraction.mjs
 *
 * `sanitiseExtractedQuestion` is the one part of `/api/questions/extract` with
 * no I/O in it — everything else is a fetch, a file parse, or a route guard.
 * It is also the part standing between "the model returned something odd" and
 * "a browser rendered an unknown option in a dropdown", so it is checked
 * directly rather than only through the route.
 *
 * The cases that matter are not well-formed JSON — those look after
 * themselves. They are a model that invented a `type` the bank has never
 * heard of, a negative or non-numeric `marks`, a `text` with nothing in it, or
 * a `markingScheme` the model added despite being told not to invent one
 * (which this cannot detect — only a human reading the source can — but which
 * must at least not become a 4000-character wall of text in a preview table).
 */

import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
    alias: { '@': new URL('../src', import.meta.url).pathname },
    interopDefault: true,
});

const {
    sanitiseExtractedQuestion,
    sanitiseExtractedBatch,
    QUESTION_TYPES,
    DIFFICULTIES,
    errorDetail,
    upstreamMessage,
    upstreamDetail,
} = await jiti.import(
    '../src/services/questionExtraction.ts'
);

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

section('A well-formed question passes through');
{
    const q = sanitiseExtractedQuestion({
        text: 'Define photosynthesis.',
        marks: 2,
        difficulty: 'Easy',
        topic: 'Biology',
        subtopic: 'Plant nutrition',
        type: 'Short Answer',
        markingScheme: 'The process by which plants make food using sunlight.',
    });
    check('text', q.text, 'Define photosynthesis.');
    check('marks', q.marks, 2);
    check('difficulty', q.difficulty, 'Easy');
    check('type', q.type, 'Short Answer');
    check('scheme kept', q.markingScheme, 'The process by which plants make food using sunlight.');
}

section('No text at all is refused outright — nothing else can save the row');
check('missing text', sanitiseExtractedQuestion({ marks: 2 }), null);
check('blank text', sanitiseExtractedQuestion({ text: '   ' }), null);
check('non-string text', sanitiseExtractedQuestion({ text: 42 }), null);
check('not an object', sanitiseExtractedQuestion('a string'), null);
check('null', sanitiseExtractedQuestion(null), null);
check('undefined', sanitiseExtractedQuestion(undefined), null);

section('A type the bank does not recognise falls back rather than passing through raw');
{
    const q = sanitiseExtractedQuestion({ text: 'x', type: 'Interpretive Dance' });
    check('unknown type becomes Structured', q.type, 'Structured');
    assert('every real type is on the allow-list', QUESTION_TYPES.includes('Multiple Choice'), 'present');
}
for (const type of QUESTION_TYPES) {
    check(`"${type}" is accepted as-is`, sanitiseExtractedQuestion({ text: 'x', type }).type, type);
}

section('A difficulty the bank does not recognise falls back to Medium');
check('gibberish difficulty', sanitiseExtractedQuestion({ text: 'x', difficulty: 'Very Hard Indeed' }).difficulty, 'Medium');
for (const difficulty of DIFFICULTIES) {
    check(`"${difficulty}" is accepted as-is`, sanitiseExtractedQuestion({ text: 'x', difficulty }).difficulty, difficulty);
}

section('Marks are a real, positive, bounded number — never taken on faith');
check('a normal value', sanitiseExtractedQuestion({ text: 'x', marks: 5 }).marks, 5);
check('missing marks defaults to 1', sanitiseExtractedQuestion({ text: 'x' }).marks, 1);
check('zero is not a mark allocation, so it defaults', sanitiseExtractedQuestion({ text: 'x', marks: 0 }).marks, 1);
check('negative marks default', sanitiseExtractedQuestion({ text: 'x', marks: -4 }).marks, 1);
check('a string that is not a number defaults', sanitiseExtractedQuestion({ text: 'x', marks: 'many' }).marks, 1);
check('NaN defaults', sanitiseExtractedQuestion({ text: 'x', marks: NaN }).marks, 1);
// A numeric string is a real value the model is entitled to send.
check('a numeric string is read', sanitiseExtractedQuestion({ text: 'x', marks: '7' }).marks, 7);
assert(
    'an absurd mark allocation is capped, not trusted',
    sanitiseExtractedQuestion({ text: 'x', marks: 100000 }).marks <= 100,
    sanitiseExtractedQuestion({ text: 'x', marks: 100000 }).marks
);

section('A marking scheme is carried only when the model actually gave one');
check('present and non-empty is kept', sanitiseExtractedQuestion({ text: 'x', markingScheme: 'Paris' }).markingScheme, 'Paris');
assert('absent stays absent, not an empty string', sanitiseExtractedQuestion({ text: 'x' }).markingScheme === undefined, 'undefined');
assert('whitespace-only is treated as absent', sanitiseExtractedQuestion({ text: 'x', markingScheme: '   ' }).markingScheme === undefined, 'undefined');
{
    const huge = 'x'.repeat(10000);
    assert('an oversized scheme is capped, not rejected', sanitiseExtractedQuestion({ text: 'x', markingScheme: huge }).markingScheme.length <= 2000, 'capped');
}

section('Multiple-choice options are a clean array of strings, or absent');
check('a normal set', sanitiseExtractedQuestion({ text: 'x', options: ['A', 'B', 'C'] }).options, ['A', 'B', 'C']);
assert('not an array is dropped rather than kept broken', sanitiseExtractedQuestion({ text: 'x', options: 'A, B, C' }).options === undefined, 'undefined');
check('non-string and empty entries are filtered out', sanitiseExtractedQuestion({ text: 'x', options: ['A', '', 42, '  ', 'B'] }).options, ['A', 'B']);
assert('an empty result is absent, not an empty array', sanitiseExtractedQuestion({ text: 'x', options: ['', null] }).options === undefined, 'undefined');
{
    const many = Array.from({ length: 20 }, (_, i) => `Option ${i}`);
    assert('an implausibly long option list is capped', sanitiseExtractedQuestion({ text: 'x', options: many }).options.length <= 8, 'capped');
}

section('Text, topic and subtopic are trimmed and length-bounded');
check('surrounding whitespace is trimmed', sanitiseExtractedQuestion({ text: '  Define osmosis.  ' }).text, 'Define osmosis.');
{
    const huge = 'Explain. '.repeat(1000);
    const q = sanitiseExtractedQuestion({ text: huge });
    assert('an enormous question is capped rather than dropped', q.text.length <= 2000 && q.text.length > 0, `${q.text.length} chars`);
}
check('a missing topic is an empty string, not undefined', sanitiseExtractedQuestion({ text: 'x' }).topic, '');

section('A whole batch is capped, and says so');
{
    const many = Array.from({ length: 200 }, (_, i) => ({ text: `Question ${i}`, marks: 1 }));
    const { questions, truncated } = sanitiseExtractedBatch(many, 80);
    check('capped at the limit', questions.length, 80);
    check('the first 80 survive, in order', questions[0].text, 'Question 0');
    assert('truncation is reported', truncated === true, 'true');
}
{
    const few = [{ text: 'Only one' }];
    const { questions, truncated } = sanitiseExtractedBatch(few, 80);
    check('under the cap is untouched', questions.length, 1);
    assert('not reported as truncated', truncated === false, 'false');
}

section('A batch with junk mixed into real questions keeps only the real ones');
{
    const mixed = [
        { text: 'A real question', marks: 3 },
        null,
        'just a string',
        { marks: 5 }, // no text
        { text: '   ' }, // blank text
        { text: 'Another real one', type: 'Numeric' },
    ];
    const { questions } = sanitiseExtractedBatch(mixed, 80);
    check('only the two real ones survive', questions.map((q) => q.text), ['A real question', 'Another real one']);
}

section('A response that is not an array at all yields nothing, not a crash');
check('a string where the list should be', sanitiseExtractedBatch('not a list', 80).questions, []);
check('null', sanitiseExtractedBatch(null, 80).questions, []);
check('undefined', sanitiseExtractedBatch(undefined, 80).questions, []);
check('an object instead of an array', sanitiseExtractedBatch({ questions: [] }, 80).questions, []);

// ---------------------------------------------------------------------------
// SAYING WHAT WENT WRONG
//
// One upload path answered with the same sentence for three unrelated faults,
// then answered "AI extraction failed" for a fourth. Each of these has a
// different thing the reader has to go and do, so each has to read
// differently.
// ---------------------------------------------------------------------------

section('A refusal from the AI service names the thing to go and fix');
{
    const namesTheKey = (s) => /API key/i.test(s);
    check('401 points at the key', namesTheKey(upstreamMessage(401)), true);
    check('403 points at the key too', namesTheKey(upstreamMessage(403)), true);
    check('402 points at credit', /credit/i.test(upstreamMessage(402)), true);
    check('429 points at rate limiting', /rate limit/i.test(upstreamMessage(429)), true);
    check('404 points at the model', /model/i.test(upstreamMessage(404)), true);
    check('500 points at their end, not ours', /their end/i.test(upstreamMessage(500)), true);
    check('503 is also their end', /their end/i.test(upstreamMessage(503)), true);

    // The failure this whole exercise was about: four faults, one sentence.
    const distinct = new Set([401, 402, 429, 404, 400, 500].map(upstreamMessage));
    check('no two of them read the same', distinct.size, 6);
    check('none of them is the old non-answer', [...distinct].some((m) => m === 'AI extraction failed'), false);
}

section('The provider’s own words survive the trip');
{
    check(
        'a JSON error message is lifted out',
        upstreamDetail(401, JSON.stringify({ error: { message: 'Invalid API key provided' } })),
        'HTTP 401 — Invalid API key provided'
    );
    check('a bare error string is lifted out', upstreamDetail(400, JSON.stringify({ error: 'bad model' })), 'HTTP 400 — bad model');
    check('a detail field is lifted out', upstreamDetail(422, JSON.stringify({ detail: 'unprocessable' })), 'HTTP 422 — unprocessable');
    check('plain text comes through as-is', upstreamDetail(502, 'upstream exploded'), 'HTTP 502 — upstream exploded');
    check('an empty body still names the status', upstreamDetail(500, ''), 'HTTP 500');
    check('a non-string body does not crash', upstreamDetail(500, undefined), 'HTTP 500');
    check(
        'a structured error is stringified rather than dropped',
        upstreamDetail(400, JSON.stringify({ error: { code: 7 } })).startsWith('HTTP 400 — {"code":7}'),
        true
    );

    const long = 'x'.repeat(1000);
    check('a huge body is truncated', upstreamDetail(500, long).length < 340, true);
}

section('A thrown error gives up its cause');
{
    check(
        'the cause is preferred over the wrapper',
        errorDetail(new Error('Failed to parse PDF', { cause: new TypeError('pdfParse is not a function') })),
        'TypeError: pdfParse is not a function'
    );
    check('an error with no cause reports itself', errorDetail(new Error('plain')), 'Error: plain');
    check('a thrown string comes through', errorDetail('something odd'), 'something odd');
    check('nothing to report is undefined, not "undefined"', errorDetail(undefined), undefined);
    check('an empty string is not a detail', errorDetail('   '), undefined);
}

// ---------------------------------------------------------------------------

console.log(`\n${failures === 0 ? 'All' : `${checks - failures}/${checks}`} question-extraction checks passed.`);
if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
}
