/**
 * Verification harness for guest download access.
 *
 *   node scripts/verify-order-access.mjs
 *
 * A buyer who pays without signing in holds a signed token naming their order,
 * and that token is the only thing standing between a stranger and somebody
 * else's paid papers. Every way it can be wrong is a way to steal a download,
 * so every way it can be wrong is pinned here: the wrong signature, the wrong
 * key, the expired token, the one edited to last longer, the one from a
 * different order.
 *
 * The rule the whole design rests on — a token opens ONE order and never an
 * account — is checked last.
 */

import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
    alias: { '@': new URL('../src', import.meta.url).pathname },
    interopDefault: true,
});

const { signOrderToken, verifyOrderToken, ORDER_TOKEN_TTL_MS } = await jiti.import(
    '../src/lib/orderAccess.ts'
);

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
    checks++;
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(
        `  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(48)} ${ok ? JSON.stringify(actual) : `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`
    );
}

function section(t) {
    console.log(`\n${t}`);
}

const SECRET = 'a-service-role-key-shaped-secret';
const OTHER = 'a-different-secret-entirely';
const ORDER = '3f8b1c22-0000-4000-8000-000000000001';
const NOW = 1_780_000_000_000;

// ---------------------------------------------------------------------------
section('A token opens the order it was cut for');

{
    const token = signOrderToken(ORDER, SECRET, NOW);
    check('the order comes back', verifyOrderToken(token, SECRET, NOW), ORDER);
    check('still valid a day later', verifyOrderToken(token, SECRET, NOW + 86_400_000), ORDER);
}

// ---------------------------------------------------------------------------
section('And nothing else does');

{
    const token = signOrderToken(ORDER, SECRET, NOW);

    check('a different key does not verify', verifyOrderToken(token, OTHER, NOW), null);
    check('no token', verifyOrderToken(null, SECRET, NOW), null);
    check('empty string', verifyOrderToken('', SECRET, NOW), null);
    check('not a token at all', verifyOrderToken('nonsense', SECRET, NOW), null);
    check('too few parts', verifyOrderToken(`${ORDER}.123`, SECRET, NOW), null);
    check('an unsigned order id', verifyOrderToken(`${ORDER}.9999999999999.`, SECRET, NOW), null);

    // Swapping the order id keeps the signature valid for the OLD id, which is
    // precisely the attack: pay for a cheap order, download an expensive one.
    const [, expiry, sig] = token.split('.');
    const stolen = `3f8b1c22-0000-4000-8000-999999999999.${expiry}.${sig}`;
    check('another order id, same signature', verifyOrderToken(stolen, SECRET, NOW), null);

    // Editing the expiry to last longer must break the signature, or the TTL is
    // decoration rather than a limit.
    const extended = `${ORDER}.${NOW + ORDER_TOKEN_TTL_MS * 100}.${sig}`;
    check('an expiry edited to last longer', verifyOrderToken(extended, SECRET, NOW), null);

    // One flipped character in the signature.
    const flipped = token.slice(0, -1) + (token.at(-1) === 'A' ? 'B' : 'A');
    check('one character of the signature', verifyOrderToken(flipped, SECRET, NOW), null);
}

// ---------------------------------------------------------------------------
section('Access does not last forever');

{
    const token = signOrderToken(ORDER, SECRET, NOW);
    const expiry = NOW + ORDER_TOKEN_TTL_MS;

    check('valid the moment before', verifyOrderToken(token, SECRET, expiry - 1), ORDER);
    check('dead exactly on expiry', verifyOrderToken(token, SECRET, expiry), null);
    check('dead well after', verifyOrderToken(token, SECRET, expiry + 86_400_000), null);
}

// ---------------------------------------------------------------------------
section('A token is one order, never an account');

{
    // The whole design rests on this. Two orders by the same buyer produce two
    // tokens, and neither opens the other — so a token that leaks costs one
    // order, not a library.
    const first = signOrderToken(ORDER, SECRET, NOW);
    const second = signOrderToken('3f8b1c22-0000-4000-8000-000000000002', SECRET, NOW);

    check('two orders, two tokens', first === second, false);
    check('the first opens only the first', verifyOrderToken(first, SECRET, NOW), ORDER);
    check(
        'the second opens only the second',
        verifyOrderToken(second, SECRET, NOW),
        '3f8b1c22-0000-4000-8000-000000000002'
    );
    // Nothing in a token names a user, so nothing in it can be used as one.
    check('no user id is encoded in it', /user|profile/i.test(first), false);
}

// ---------------------------------------------------------------------------
console.log(
    failures === 0
        ? `\nAll ${checks} order-access checks passed.`
        : `\n${failures} of ${checks} order-access checks FAILED.`
);
process.exit(failures === 0 ? 0 : 1);
