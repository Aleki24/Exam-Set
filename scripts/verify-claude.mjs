/**
 * Verification harness for the AI provider.
 *
 *   node scripts/verify-claude.mjs
 *
 * Two things are checked here, and neither needs a network call.
 *
 * The first is what a person is told when the provider says no. This app spent
 * four rounds returning "AI extraction failed" for four unrelated faults, and
 * the fix was not a better sentence — it was one sentence per fault, each
 * naming the thing to go and do. That property is easy to lose: add a branch,
 * reuse a message, and two different failures read the same again. So the
 * distinctness is asserted, not just the wording.
 *
 * The second is which images are accepted. The provider reads PNG, JPEG, WebP
 * and GIF and nothing else, and a teacher photographing a paper on an iPhone
 * gets HEIC. Refusing that at the boundary with the list of what does work
 * beats a 400 from the API that says less.
 */

import { createJiti } from 'jiti';
import Anthropic from '@anthropic-ai/sdk';

const jiti = createJiti(import.meta.url, {
    alias: { '@': new URL('../src', import.meta.url).pathname },
    interopDefault: true,
});

const { __describeFailure: describe, supportedImageType, SUPPORTED_IMAGE_TYPES, MODEL } =
    await jiti.import('../src/services/claude.ts');

let failures = 0;
let checks = 0;

function assert(label, condition, detail = '') {
    checks++;
    if (!condition) failures++;
    console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${label.padEnd(52)} ${detail}`);
}

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

const section = (t) => console.log(`\n${t}`);

/** The SDK's errors need a real Headers object, not a plain one. */
const H = () => new Headers();

// ---------------------------------------------------------------------------

section('The model is named once, and it is not a search-grounded one');
assert('the configured model', MODEL === 'claude-sonnet-5', MODEL);

section('Each provider failure names the thing to go and fix');
{
    const auth = describe(new Anthropic.AuthenticationError(401, {}, 'invalid x-api-key', H()));
    assert('a rejected key points at the key', /API key/i.test(auth.message), 'names the key');
    assert('and names the variable to check', /ANTHROPIC_API_KEY/.test(auth.message), 'ANTHROPIC_API_KEY');
    assert('a rejected key is not worth retrying', auth.retryable === false, 'false');

    const rate = describe(new Anthropic.RateLimitError(429, {}, 'slow down', H()));
    assert('rate limiting says so', /rate limit/i.test(rate.message), 'names it');
    assert('and is worth retrying', rate.retryable === true, 'true');

    const missing = describe(new Anthropic.NotFoundError(404, {}, 'no such model', H()));
    assert('an unknown model names the model', missing.message.includes(MODEL), MODEL);
    assert('and is not worth retrying', missing.retryable === false, 'false');

    const bad = describe(new Anthropic.BadRequestError(400, {}, 'bad request', H()));
    assert('a refused request points at the detail', /detail/i.test(bad.message), 'points at detail');
    assert('and is not worth retrying', bad.retryable === false, 'false');

    const denied = describe(new Anthropic.PermissionDeniedError(403, {}, 'no access', H()));
    assert('a key without access says so', /permission/i.test(denied.message), 'names permissions');

    const server = describe(new Anthropic.InternalServerError(503, {}, 'overloaded', H()));
    assert('a provider outage is their end, not ours', /their end/i.test(server.message), 'their end');
    assert('and is worth retrying', server.retryable === true, 'true');

    const timeout = describe(new Anthropic.APIConnectionTimeoutError({ message: 'timed out' }));
    assert('a timeout says it did not answer in time', /in time/i.test(timeout.message), 'names the timeout');
    assert('and is worth retrying', timeout.retryable === true, 'true');

    // APIConnectionTimeoutError extends APIConnectionError, so an ordering
    // mistake here silently reports every timeout as "could not reach".
    const conn = describe(new Anthropic.APIConnectionError({ message: 'socket hang up' }));
    assert('an unreachable service is distinct from a timeout', conn.message !== timeout.message, 'distinct');
    assert('and is worth retrying', conn.retryable === true, 'true');

    const unknown = describe(new Error('something nobody predicted'));
    assert('an unrecognised error still says something', unknown.message.length > 0, unknown.message);
    assert('and is not silently retried forever', unknown.retryable === false, 'false');
}

section('No two failures read the same — the whole point of the exercise');
{
    const messages = [
        describe(new Anthropic.AuthenticationError(401, {}, 'a', H())),
        describe(new Anthropic.PermissionDeniedError(403, {}, 'b', H())),
        describe(new Anthropic.RateLimitError(429, {}, 'c', H())),
        describe(new Anthropic.NotFoundError(404, {}, 'd', H())),
        describe(new Anthropic.BadRequestError(400, {}, 'e', H())),
        describe(new Anthropic.InternalServerError(503, {}, 'f', H())),
        describe(new Anthropic.APIConnectionTimeoutError({ message: 'g' })),
        describe(new Anthropic.APIConnectionError({ message: 'h' })),
        describe(new Error('i')),
    ].map((f) => f.message);

    check('nine distinct failures, nine distinct sentences', new Set(messages).size, messages.length);
    assert('none of them is the old non-answer', !messages.includes('AI extraction failed'), 'gone');
}

section('The provider’s own words come back, without leaking internals');
{
    // The SDK builds an APIError's message from the response body, so the body
    // is what has to carry the provider's words — passing {} here would test
    // nothing, which is exactly the mistake this comment exists to prevent.
    const body = { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } };
    const detail = describe(new Anthropic.AuthenticationError(401, body, 'unused', H())).detail;
    assert('the status is named', detail.startsWith('401'), detail.slice(0, 40));
    assert('and the provider’s message travels with it', /invalid x-api-key/.test(detail), 'included');
    assert('without repeating the status twice', !/^HTTP \d+: \d+/.test(detail), detail.slice(0, 20));

    const hugeBody = { error: { message: 'x'.repeat(2000) } };
    const long = describe(new Anthropic.BadRequestError(400, hugeBody, 'unused', H())).detail;
    assert('a huge upstream message is truncated', long.length <= 240, `${long.length} chars`);

    const plain = describe(new Error('boom')).detail;
    check('a plain error reports its name and message', plain, 'Error: boom');

    assert('nothing to report is undefined, not "undefined"', describe('a bare string') .detail === undefined, 'undefined');
}

section('Only images the model can actually read are accepted');
{
    for (const type of SUPPORTED_IMAGE_TYPES) {
        check(`${type} is accepted`, supportedImageType(type), type);
    }
    check('uppercase from a browser still matches', supportedImageType('IMAGE/PNG'), 'image/png');
    check('HEIC off an iPhone is refused', supportedImageType('image/heic'), null);
    check('a TIFF scan is refused', supportedImageType('image/tiff'), null);
    check('an SVG is refused', supportedImageType('image/svg+xml'), null);
    check('a PDF is not an image', supportedImageType('application/pdf'), null);
    check('empty is refused', supportedImageType(''), null);
}

// ---------------------------------------------------------------------------

console.log(`\n${failures === 0 ? 'All' : `${checks - failures}/${checks}`} provider checks passed.`);
if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
}
