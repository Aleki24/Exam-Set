/**
 * Verification harness for the auth helpers.
 *
 *   node scripts/verify-auth.mjs
 *
 * `isSessionRejected` decides whether a signed-in user keeps their session. It
 * is checked hardest in the direction that hurts: every transient fault must
 * come back false, because a false positive here signs somebody out mid-task
 * for having a slow connection, and that is the bug this function exists to
 * prevent. The reverse mistake costs a redirect to a sign-in page.
 *
 * `safeNext` guards every emailed link in the product. The `next` value travels
 * through the user's inbox, so anyone who can trigger a signup or reset email
 * chooses it — which makes this the one piece of auth an attacker can reach
 * without an account. It is tested for what it rejects, not what it accepts.
 *
 * `friendlyAuthError` exists so Supabase's internal messages never reach a
 * teacher's screen. The checks pin the cases that actually occur.
 */

import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
    alias: { '@': new URL('../src', import.meta.url).pathname },
    interopDefault: true,
});

const { safeNext, friendlyAuthError } = await jiti.import('../src/lib/authErrors.ts');
const { isSessionRejected } = await jiti.import('../src/utils/supabase/authFailure.ts');

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
    checks++;
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(46)} ${ok ? JSON.stringify(actual) : `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`);
}

function assert(label, condition, detail = '') {
    checks++;
    if (!condition) failures++;
    console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${label.padEnd(46)} ${detail}`);
}

function section(t) { console.log(`\n${t}`); }

// ---------------------------------------------------------------------------

section('safeNext accepts genuine same-site paths');
check('a plain path', safeNext('/library'), '/library');
check('a nested path', safeNext('/papers/abc-123'), '/papers/abc-123');
check('a path with a query', safeNext('/?level=junior-school'), '/?level=junior-school');
check('the reset page', safeNext('/auth/reset-password'), '/auth/reset-password');

section('safeNext rejects anything that leaves the site');
check('protocol-relative //host', safeNext('//evil.com'), '/');
check('protocol-relative with path', safeNext('//evil.com/steal'), '/');
check('backslash escape', safeNext('/\\evil.com'), '/');
check('absolute http', safeNext('http://evil.com'), '/');
check('absolute https', safeNext('https://evil.com'), '/');
check('scheme-less host', safeNext('evil.com'), '/');
check('javascript: scheme', safeNext('javascript:alert(1)'), '/');
check('data: scheme', safeNext('data:text/html,<script>'), '/');
check('empty string', safeNext(''), '/');
check('null', safeNext(null), '/');
check('undefined', safeNext(undefined), '/');

section('safeNext honours the caller fallback');
check('recovery fallback used', safeNext(null, '/auth/reset-password'), '/auth/reset-password');
check('hostile value falls back too', safeNext('//evil.com', '/auth/reset-password'), '/auth/reset-password');

section('friendlyAuthError hides internals');
{
    const pkce = friendlyAuthError(
        'PKCE code verifier not found in storage. This can happen if the auth flow was initiated in a different browser or device. For SSR frameworks (Next.js, SvelteKit, etc.), use @supabase/ssr on both the server and client.'
    );
    assert('no framework names leak', !/next\.js|sveltekit|@supabase\/ssr/i.test(pkce), pkce.slice(0, 48) + '…');
    assert('tells them what to do', /same device|same browser/i.test(pkce), 'actionable');
}
{
    const net = friendlyAuthError('Unexpected token \'H\', "Host not i"... is not valid JSON');
    assert('parse errors become plain English', !net.includes('JSON'), net);
}

section('friendlyAuthError maps the cases that actually happen');
assert('wrong password', /do not match an account/i.test(friendlyAuthError('Invalid login credentials')), 'ok');
assert('unconfirmed', /not been confirmed/i.test(friendlyAuthError('Email not confirmed')), 'ok');
assert('already registered', /already has an account/i.test(friendlyAuthError('User already registered')), 'ok');
assert('expired link', /expired/i.test(friendlyAuthError('Email link is invalid or has expired')), 'ok');
assert('rate limited', /wait a few minutes/i.test(friendlyAuthError('over_email_send_rate_limit')), 'ok');
assert('weak password', /too weak/i.test(friendlyAuthError('Password should be at least 6 characters')), 'ok');

section('friendlyAuthError does not swallow the unknown');
check('unrecognised passes through', friendlyAuthError('Some brand new failure'), 'Some brand new failure');
check('empty gets a fallback', friendlyAuthError(''), 'Something went wrong. Please try again.');
check('null gets a fallback', friendlyAuthError(null), 'Something went wrong. Please try again.');


// ---------------------------------------------------------------------------

section('isSessionRejected says yes only when the server ruled against the session');
assert('spent refresh token', isSessionRejected({ status: 400, message: 'Invalid Refresh Token: Already Used' }), 'ok');
assert('refresh token gone', isSessionRejected({ status: 400, code: 'refresh_token_not_found' }), 'ok');
assert('session revoked', isSessionRejected({ status: 403, code: 'session_not_found' }), 'ok');
assert('unparseable jwt', isSessionRejected({ status: 401, code: 'bad_jwt' }), 'ok');
assert('account deleted', isSessionRejected({ status: 403, code: 'user_not_found' }), 'ok');
assert('jwt expired', isSessionRejected({ status: 401, message: 'JWT expired' }), 'ok');
assert('bare 401 counts', isSessionRejected({ status: 401, message: 'Unauthorized' }), 'ok');

section('isSessionRejected never mistakes an unanswered request for a verdict');
assert('the SDK retryable error', !isSessionRejected({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }), 'ok');
assert('a 500 from the auth host', !isSessionRejected({ status: 500, message: 'Internal Server Error' }), 'ok');
assert('a 502 from a proxy', !isSessionRejected({ status: 502, message: 'Bad Gateway' }), 'ok');
assert('a 504 timeout', !isSessionRejected({ status: 504, message: 'Gateway Timeout' }), 'ok');
assert('rate limiting', !isSessionRejected({ status: 429, message: 'Too Many Requests' }), 'ok');
assert('no status at all', !isSessionRejected({ message: 'fetch failed' }), 'ok');
assert('status zero', !isSessionRejected({ status: 0, message: 'Network request failed' }), 'ok');
assert('an aborted request', !isSessionRejected({ name: 'AbortError', message: 'The operation was aborted' }), 'ok');
assert('a dropped connection', !isSessionRejected({ message: 'TypeError: NetworkError when attempting to fetch resource' }), 'ok');
assert('nothing at all', !isSessionRejected(null), 'ok');
assert('undefined', !isSessionRejected(undefined), 'ok');

section('isSessionRejected is not fooled by a retryable error carrying a rejection message');
assert('retryable wins over wording', !isSessionRejected({ name: 'AuthRetryableFetchError', status: 0, message: 'invalid refresh token' }), 'ok');

// ---------------------------------------------------------------------------

console.log(`\n${failures === 0 ? 'All' : `${checks - failures}/${checks}`} auth checks passed.`);
if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
}
