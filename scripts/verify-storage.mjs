/**
 * Verification harness for storage backend selection.
 *
 *   node scripts/verify-storage.mjs
 *
 * The whole selling path depends on this: pick the wrong backend, or half-pick
 * one, and uploads and downloads fail at runtime rather than at boot. The case
 * that matters most is a PARTIAL R2 config — it must fall back to Supabase
 * Storage rather than attempt R2 with missing credentials.
 */

import { createJiti } from 'jiti';

const root = new URL('..', import.meta.url).pathname;
const jiti = createJiti(import.meta.url, {
    alias: { '@': `${root}src` },
    interopDefault: true,
});

const R2 = {
    R2_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
    R2_ACCESS_KEY_ID: 'key',
    R2_SECRET_ACCESS_KEY: 'secret',
    R2_BUCKET_NAME: 'bucket',
};

const SUPABASE = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
};

const cases = [
    ['nothing configured', {}, 'none'],
    ['supabase only', SUPABASE, 'supabase'],
    ['r2 only', R2, 'r2'],
    ['both configured', { ...SUPABASE, ...R2 }, 'r2'],
    ['partial r2, supabase present', { ...SUPABASE, R2_ENDPOINT: R2.R2_ENDPOINT }, 'supabase'],
    ['partial r2, nothing else', { R2_ENDPOINT: R2.R2_ENDPOINT }, 'none'],
];

const managedKeys = [...Object.keys(R2), ...Object.keys(SUPABASE)];
let failures = 0;

for (const [name, env, expected] of cases) {
    for (const key of managedKeys) delete process.env[key];
    Object.assign(process.env, env);

    // Re-import so the module reads the environment again.
    const storage = await jiti.import(`${root}src/utils/storage.ts`, { force: true });

    const backend = storage.storageBackend();
    const reason = storage.storageUnavailableReason();

    // A configured backend reports no reason; an unconfigured one must explain
    // itself, naming the variables to set.
    const reasonCorrect =
        expected === 'none'
            ? Boolean(reason) && /SUPABASE_SERVICE_ROLE_KEY/.test(reason)
            : reason === null;

    const ok = backend === expected && reasonCorrect;
    if (!ok) failures++;

    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(28)} -> ${backend} (expected ${expected})`);
}

// ============================================================================
// CORS PREFLIGHT VERDICTS
// ============================================================================
//
// The bug this guards against is silent and one-sided: an R2 bucket with no
// CORS policy passes every server-side check and refuses every browser upload.
// The reading of the preflight is pure, so all of it is covered here without a
// bucket, a token or a network.

Object.assign(process.env, R2);
const storage = await jiti.import(`${root}src/utils/storage.ts`, { force: true });
const { readCorsPreflight } = storage;

const ORIGIN = 'https://skulbase.example';
const ok200 = (extra) => ({ status: 200, allowOrigin: null, allowMethods: null, allowHeaders: null, ...extra });

const corsCases = [
    [
        'no policy at all — the default on a new bucket',
        ok200({ status: 403 }),
        false,
    ],
    [
        'policy for this origin, PUT and Content-Type',
        ok200({ allowOrigin: ORIGIN, allowMethods: 'PUT', allowHeaders: 'content-type' }),
        true,
    ],
    ['wildcard origin', ok200({ allowOrigin: '*', allowMethods: 'PUT', allowHeaders: 'content-type' }), true],
    [
        'policy for a different origin',
        ok200({ allowOrigin: 'https://somewhere-else.example', allowMethods: 'PUT', allowHeaders: 'content-type' }),
        false,
    ],
    [
        'origin allowed but not for PUT',
        ok200({ allowOrigin: ORIGIN, allowMethods: 'GET, HEAD', allowHeaders: 'content-type' }),
        false,
    ],
    [
        'PUT allowed but Content-Type is not — the signature requires it',
        ok200({ allowOrigin: ORIGIN, allowMethods: 'PUT', allowHeaders: 'x-amz-meta-foo' }),
        false,
    ],
    ['header wildcard', ok200({ allowOrigin: ORIGIN, allowMethods: 'PUT', allowHeaders: '*' }), true],
    [
        'case and spacing as a server may actually send them',
        ok200({ allowOrigin: ORIGIN, allowMethods: 'put, get', allowHeaders: 'Content-Type, ETag' }),
        true,
    ],
    [
        // Nothing to contradict an allowed origin is not a failure — refusing
        // here would tell an admin to fix a policy that is already correct.
        'origin allowed, nothing echoed back',
        ok200({ allowOrigin: ORIGIN }),
        true,
    ],
];

for (const [name, response, expected] of corsCases) {
    const verdict = readCorsPreflight(ORIGIN, response);

    // A failure must always carry the policy to paste, or the admin is told
    // something is wrong and not what to do about it.
    const fixCorrect = expected ? verdict.fix === null : /AllowedOrigins/.test(verdict.fix ?? '');
    const passed = verdict.ok === expected && fixCorrect;
    if (!passed) failures++;

    console.log(`  ${passed ? 'ok  ' : 'FAIL'} cors: ${name.padEnd(52)} -> ${verdict.ok} (expected ${expected})`);
}

console.log(
    failures === 0
        ? '\nStorage backend selection and CORS verdicts correct in all cases.\n'
        : `\n${failures} case(s) failed.\n`
);
process.exit(failures === 0 ? 0 : 1);
