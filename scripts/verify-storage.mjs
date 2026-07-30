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

console.log(
    failures === 0
        ? '\nStorage backend selection correct in all cases.\n'
        : `\n${failures} case(s) failed.\n`
);
process.exit(failures === 0 ? 0 : 1);
