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
    jsx: true,
});

const { safeNext, friendlyAuthError } = await jiti.import('../src/lib/authErrors.ts');
const { isSessionRejected } = await jiti.import('../src/utils/supabase/authFailure.ts');
const { getActor, getSignedInUser, requireAdmin, requireOwner, requireUser } = await jiti.import(
    '../src/utils/auth/guards.ts'
);
const { authEventNeedsReload } = await jiti.import('../src/lib/roles.tsx');

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

section('isSessionRejected treats "no session at all" as a verdict, not a fault');
// Every signed-out visitor to /library produces exactly this. It is decided
// locally, without a request, and arrives as a 400 — so no status rule catches
// it. Reading it as "could not reach the server" waves them all past the
// sign-in redirect, which is what it did until this check existed.
assert('the SDK missing-session error', isSessionRejected({ name: 'AuthSessionMissingError', message: 'Auth session missing!', status: 400 }), 'ok');
assert('by message alone', isSessionRejected({ message: 'Auth session missing!', status: 400 }), 'ok');
assert('by code alone', isSessionRejected({ code: 'session_missing', status: 400 }), 'ok');

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
// THE GUARDS
//
// Counted rather than described. "Asks the auth server once per request" and
// "one request's identity never answers for another" are both claims about how
// many calls happen and on whose behalf, so the fake client below counts them.
// ---------------------------------------------------------------------------

/** A Supabase client that records what was asked of it. */
function fakeClient({ user = { id: 'u1', email: 'a@example.com' }, role = 'user', authThrows = false } = {}) {
    const calls = { getUser: 0, profiles: 0 };

    return {
        calls,
        auth: {
            async getUser() {
                calls.getUser++;
                if (authThrows) throw new Error('network down');
                return { data: { user }, error: null };
            },
        },
        from(table) {
            if (table === 'profiles') calls.profiles++;
            const result = { data: role ? { role } : null, error: null };
            const chain = {
                select: () => chain,
                eq: () => chain,
                maybeSingle: async () => result,
            };
            return chain;
        },
    };
}

section('requireUser does not pay for a role it never reads');
{
    const client = fakeClient();
    const { user, failure } = await requireUser(client);
    check('the user comes back', user?.id, 'u1');
    check('their email comes back', user?.email, 'a@example.com');
    assert('no failure', !failure, 'signed in');
    check('one call to the auth server', client.calls.getUser, 1);
    // This is the whole point of splitting the guards: two thirds of the routes
    // in the app take this path and none of them look at a role.
    check('and no profiles query at all', client.calls.profiles, 0);
}

section('requireAdmin does look the role up');
{
    const admin = fakeClient({ role: 'admin' });
    const { actor } = await requireAdmin(admin);
    check('the role is resolved', actor?.role, 'admin');
    check('isAdmin follows from it', actor?.isAdmin, true);
    check('owner does not', actor?.isOwner, false);
    check('one profiles query', admin.calls.profiles, 1);

    const plain = fakeClient({ role: 'user' });
    const refused = await requireAdmin(plain);
    check('a plain user is refused', refused.failure?.status, 403);

    const owner = fakeClient({ role: 'owner' });
    const { actor: asOwner } = await requireAdmin(owner);
    assert('an owner passes an admin gate', asOwner?.isAdmin === true && asOwner?.isOwner === true, 'both');
}

section('One request, one answer');
{
    const client = fakeClient({ role: 'admin' });
    await Promise.all([requireUser(client), requireAdmin(client), requireAdmin(client), getActor(client)]);
    // Four guards on one request used to be four round trips to the auth server
    // and three profile reads.
    check('the auth server is asked once', client.calls.getUser, 1);
    check('the profile is read once', client.calls.profiles, 1);
}

section('One request never answers for another');
{
    // The reason the memo hangs off the client rather than off a module: a
    // module outlives the request, and this is exactly how one visitor ends up
    // being served as another.
    const first = fakeClient({ user: { id: 'u1', email: 'first@example.com' }, role: 'owner' });
    const second = fakeClient({ user: { id: 'u2', email: 'second@example.com' }, role: 'user' });

    const a = await getActor(first);
    const b = await getActor(second);

    check('the first request is itself', a?.id, 'u1');
    check('the second request is itself', b?.id, 'u2');
    check('and does not inherit the role', b?.isOwner, false);
    check('each asked its own auth server', second.calls.getUser, 1);
}

section('A dropped request is not remembered as an answer');
{
    // Caching a rejection would turn one network blip into a failed request for
    // everything that asks afterwards.
    const client = fakeClient({ authThrows: true });
    await getSignedInUser(client).then(
        () => assert('the first attempt fails', false, 'it resolved'),
        () => assert('the first attempt fails', true, 'threw')
    );

    client.auth.getUser = async () => {
        client.calls.getUser++;
        return { data: { user: { id: 'u9', email: 'late@example.com' } }, error: null };
    };

    const recovered = await getSignedInUser(client);
    check('a later attempt is allowed through', recovered?.id, 'u9');
}

section('Signed out is a clean refusal, not a crash');
{
    const nobody = fakeClient({ user: null });
    check('requireUser refuses', (await requireUser(nobody)).failure?.status, 401);
    check('requireAdmin refuses', (await requireAdmin(nobody)).failure?.status, 401);
    check('requireOwner refuses', (await requireOwner(nobody)).failure?.status, 401);
    check('getActor returns null', await getActor(nobody), null);
    check('and never reads a profile', nobody.calls.profiles, 0);
}

section('An auth event only reloads when the answer could have changed');
{
    // The provider holds one subscription for the tab. What it does with each
    // event is the difference between a query per tab per hour for ever and a
    // navigation that still names the previous account after switching.
    assert(
        'a refreshed token changes nothing',
        !authEventNeedsReload('TOKEN_REFRESHED', 'u1', 'u1'),
        'skipped'
    );
    assert('signing in reloads', authEventNeedsReload('SIGNED_IN', 'u1', null), 'reloads');
    assert('signing out reloads', authEventNeedsReload('SIGNED_OUT', null, 'u1'), 'reloads');
    assert(
        'switching account reloads',
        authEventNeedsReload('SIGNED_IN', 'u2', 'u1'),
        'reloads'
    );
    assert(
        'the same person signing in again does not',
        !authEventNeedsReload('SIGNED_IN', 'u1', 'u1'),
        'skipped'
    );
    // The id cannot have changed here, so this one has to be admitted by name.
    assert(
        'a changed profile reloads even at the same id',
        authEventNeedsReload('USER_UPDATED', 'u1', 'u1'),
        'reloads'
    );
    assert(
        'the very first event always reloads',
        authEventNeedsReload('INITIAL_SESSION', null, undefined),
        'reloads'
    );
}

section('A missing profile row is read as a plain user, not as an admin');
{
    // The row is created by a trigger at signup, so a missing one means the
    // request was not authenticated as far as the database is concerned. The
    // safe reading of that is the least privilege, never the most.
    const client = fakeClient({ role: null });
    const actor = await getActor(client);
    check('falls back to user', actor?.role, 'user');
    check('not to admin', actor?.isAdmin, false);
}

// ---------------------------------------------------------------------------

console.log(`\n${failures === 0 ? 'All' : `${checks - failures}/${checks}`} auth checks passed.`);
if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
}
