/**
 * Checks that the files the PDF reader needs at runtime are in the build.
 *
 *   node scripts/verify-deployment-tracing.mjs        (after `next build`)
 *
 * WHY THIS EXISTS
 *
 * Three attempts at fixing PDF upload shipped, and the first two were verified
 * exactly the way everything else here is verified: run the real function
 * against a real file and see real text come out. It passed every time, and
 * production kept failing, because the thing that was wrong was not in the
 * code at all. It was that a file the code depends on was never uploaded.
 *
 * `pdfjs` reaches for two things by a route no bundler can follow — the native
 * canvas package, through a `require()` inside a `createRequire` inside a
 * try/catch, and its own worker, through `await import()` on a string it
 * assembles at runtime and marks `webpackIgnore`. Both resolve instantly on a
 * machine with a full `node_modules`. Neither was traced into the deployed
 * function, so both failed there and only there, and no amount of running the
 * code locally was ever going to show it.
 *
 * So this does not run the code. It reads the manifest the build itself writes
 * to say what gets uploaded, and checks the worker is named in it. That is the
 * question that was actually being got wrong, asked directly.
 *
 * It refuses to pass on an absence of evidence: no build output, or no
 * manifest, is reported as "cannot verify" rather than as success.
 *
 * `--soft-missing` downgrades only that case to a warning, and is how the
 * build runs it. A deployment should be stopped by a file that is genuinely
 * missing from it; it should not be stopped because a future version of Next
 * writes its manifest somewhere else. Those are different problems and only
 * the first one is this script's business.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOFT_MISSING = process.argv.includes('--soft-missing');
const ROUTE = 'api/questions/extract';
const MANIFEST = join(process.cwd(), '.next/server/app', ROUTE, 'route.js.nft.json');

/** Files that must travel with the route, and what breaks without each. */
const REQUIRED = [
    {
        match: 'pdfjs-dist/legacy/build/pdf.mjs',
        name: 'pdfjs itself',
        failure: 'no PDF could be opened at all',
    },
    {
        match: 'pdfjs-dist/legacy/build/pdf.worker.mjs',
        name: 'the pdfjs worker',
        failure: '"Setting up fake worker failed: Cannot find module ... pdf.worker.mjs"',
    },
];

console.log('\nWhat the extract route takes with it to production');

/** Ends the run for a reason that is not "a required file is missing". */
function cannotVerify(reason) {
    console.error(`  CANNOT VERIFY  ${reason}`);
    if (SOFT_MISSING) {
        console.error('  Continuing: this does not by itself mean anything is wrong with the build.');
        process.exit(0);
    }
    console.error('  Run `npm run build` first — this reads what the build produced.');
    process.exit(1);
}

if (!existsSync(MANIFEST)) {
    cannotVerify(`no trace manifest at ${MANIFEST}`);
}

let files;
try {
    files = JSON.parse(readFileSync(MANIFEST, 'utf8')).files;
} catch (error) {
    cannotVerify(`the trace manifest could not be read: ${error.message}`);
}

if (!Array.isArray(files)) {
    cannotVerify('the trace manifest has no file list');
}

let failures = 0;
for (const { match, name, failure } of REQUIRED) {
    const present = files.some((file) => file.replaceAll('\\', '/').includes(match));
    if (!present) failures++;
    console.log(`  ${present ? 'ok  ' : 'FAIL'} ${name.padEnd(20)} ${present ? 'ships' : `MISSING — in production: ${failure}`}`);
}

console.log(`\n${files.length} files traced for the route.`);

if (failures > 0) {
    console.error(
        `\n${failures} file(s) the route needs would not be uploaded.\n` +
            'Name them in `outputFileTracingIncludes` in next.config.ts, or import\n' +
            'them by a literal path so tracing can see them.'
    );
    process.exit(1);
}

console.log('All deployment-tracing checks passed.');
