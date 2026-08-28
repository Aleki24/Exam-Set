/**
 * Verification harness for clearing up abandoned uploads.
 *
 *   node scripts/verify-reaper.mjs
 *
 * This is the one function in the app whose output is a list of files to delete
 * permanently, so it is the one most worth being sure about. The failure mode is
 * not an error message — it is a seller's paper vanishing from a live shop, days
 * later, with nothing to explain it.
 *
 * The cases that matter are the ones nobody creates on purpose: the file
 * uploaded thirty seconds ago by somebody still filling in the form, the key
 * belonging to a draft nobody has published yet, the figure that lives under a
 * different prefix entirely. Needs no bucket, no database and no network, which
 * is why those cases can be exercised at all.
 */

import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
    alias: { '@': new URL('../src', import.meta.url).pathname },
    interopDefault: true,
});

const { planReap, humanBytes, MIN_AGE_MS, REAPABLE_PREFIX } =
    await jiti.import('../src/services/uploadReaper.ts');

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
    checks++;
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(
        `  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(56)} ${
            ok ? JSON.stringify(actual) : `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`
        }`
    );
}

const NOW = Date.UTC(2026, 7, 28, 12, 0, 0);
const hoursAgo = (h) => new Date(NOW - h * 60 * 60 * 1000);

const object = (key, hours, size = 1024) => ({ key, size, uploadedAt: hoursAgo(hours) });
const doomedKeys = (plan) => plan.doomed.map((c) => c.key);

console.log('\nAn abandoned upload is collected');
{
    const plan = planReap([object('papers/alice/1700-orphan.pdf', 48)], [], NOW);
    check('old and unreferenced', doomedKeys(plan), ['papers/alice/1700-orphan.pdf']);
    check('its bytes are counted', plan.bytes, 1024);
}

console.log('\nA file a paper points at is never collected');
{
    const stored = [
        object('papers/alice/1700-sold.pdf', 500),
        object('papers/alice/1700-sold-marking-scheme.pdf', 500),
        object('papers/alice/1700-orphan.pdf', 500),
    ];
    const referenced = ['papers/alice/1700-sold.pdf', 'papers/alice/1700-sold-marking-scheme.pdf'];
    const plan = planReap(stored, referenced, NOW);

    check('only the orphan goes', doomedKeys(plan), ['papers/alice/1700-orphan.pdf']);
    check('the paper is kept', plan.referenced, 2);
    // A scheme is referenced by its own column, not by the paper's — a reaper
    // that only read `pdf_storage_key` would delete every marking scheme sold.
    check('the marking scheme is kept too', plan.doomed.some((c) => c.key.includes('marking-scheme')), false);
}

console.log('\nSomebody still filling in the form is not swept out from under');
{
    // The whole reason the file is uploaded early is so the cover can be read
    // and the form filled in. That gap is minutes; the grace period is hours.
    const stored = [object('papers/alice/1700-in-progress.pdf', 0.01)];
    check('uploaded seconds ago', doomedKeys(planReap(stored, [], NOW)), []);
    check('still going after an hour', doomedKeys(planReap([object('papers/a/x.pdf', 1)], [], NOW)), []);
    check('and after five', doomedKeys(planReap([object('papers/a/x.pdf', 5)], [], NOW)), []);
    check('collected after seven', doomedKeys(planReap([object('papers/a/x.pdf', 7)], [], NOW)), ['papers/a/x.pdf']);
    check('the grace period is six hours', MIN_AGE_MS, 6 * 60 * 60 * 1000);
}

console.log('\nOnly uploads are ever swept');
{
    /*
     * `figures/` is referenced by `questions.image_path`, a table the reaper
     * does not read. Sweeping it against a list of paper keys would delete
     * every diagram in the question bank.
     */
    const stored = [
        object('figures/q1-diagram.png', 900),
        object('generated/abc/paper.pdf', 900),
        object('uploads/bob/notes.pdf', 900),
        object('papers/alice/1700-orphan.pdf', 900),
    ];
    const plan = planReap(stored, [], NOW);
    check('only the papers prefix', doomedKeys(plan), ['papers/alice/1700-orphan.pdf']);
    check('the rest are left alone', plan.foreign, 3);
    check('the prefix is papers/', REAPABLE_PREFIX, 'papers/');
}

console.log('\nA draft is not an abandoned upload');
{
    // Somebody saved it on purpose and means to publish it later. Filtering the
    // key query by `is_published` would delete exactly the files a seller was
    // most careful about — which is why the route reads every row.
    const stored = [object('papers/alice/1700-draft.pdf', 900)];
    check('a draft key spares its file', doomedKeys(planReap(stored, ['papers/alice/1700-draft.pdf'], NOW)), []);
}

console.log('\nAn undated object is governed by the reference check, not by its age');
{
    // Both backends report a date. A backend that stopped would otherwise turn
    // the reaper off silently, and nobody would notice but the storage bill.
    const undated = { key: 'papers/alice/undated.pdf', size: 10, uploadedAt: null };
    check('undated and unreferenced goes', doomedKeys(planReap([undated], [], NOW)), ['papers/alice/undated.pdf']);
    check('undated but referenced stays', doomedKeys(planReap([undated], ['papers/alice/undated.pdf'], NOW)), []);
}

console.log('\nNothing to do is a clean answer, not an empty one');
{
    const plan = planReap([], [], NOW);
    check('no objects', doomedKeys(plan), []);
    check('nothing reclaimable', plan.bytes, 0);
    check('no counts', [plan.referenced, plan.tooNew, plan.foreign], [0, 0, 0]);
}

console.log('\nThe size an admin reads before confirming');
{
    check('bytes', humanBytes(512), '512 B');
    check('kilobytes', humanBytes(2048), '2.0 KB');
    check('megabytes', humanBytes(25 * 1024 * 1024), '25 MB');
    check('gigabytes', humanBytes(3 * 1024 * 1024 * 1024), '3.0 GB');
    check('zero', humanBytes(0), '0 B');
}

console.log(
    failures === 0
        ? `\nAll ${checks} reaper checks passed.\n`
        : `\n${failures} of ${checks} reaper checks FAILED.\n`
);
process.exit(failures === 0 ? 0 : 1);
