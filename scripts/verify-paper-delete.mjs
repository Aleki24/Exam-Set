/**
 * Verification harness for deleting a paper.
 *
 *   node scripts/verify-paper-delete.mjs
 *
 * Deleting is the one CRUD operation that cannot be undone by doing it again,
 * and the foreign keys onto `exams` are not uniform about what goes with it:
 *
 *   order_items    RESTRICT  — Postgres refuses. A sold paper is safe by itself.
 *   exam_sessions  CASCADE   — Postgres says nothing and takes them along.
 *
 * So the check that matters most here is the one the database will not do for
 * us: that deleting a paper somebody has sat is refused rather than silently
 * erasing their answers and marks. The fake client below counts what was asked
 * and what was deleted, because "refused" and "deleted, but politely" look the
 * same from the outside otherwise.
 */

import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
    alias: { '@': new URL('../src', import.meta.url).pathname },
    interopDefault: true,
});

const { deletePaper } = await jiti.import('../src/services/paperDeletion.ts');

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
    checks++;
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(
        `  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(48)} ${
            ok ? JSON.stringify(actual) : `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`
        }`
    );
}

function assert(label, condition, detail = '') {
    checks++;
    if (!condition) failures++;
    console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${label.padEnd(48)} ${detail}`);
}

const section = (t) => console.log(`\n${t}`);

const OWNER = 'author-1';
const PAPER = {
    id: 'paper-1',
    title: 'End of Term 2 Examination',
    created_by: OWNER,
    pdf_storage_key: 'generated/paper-1/paper.pdf',
    marking_scheme_storage_key: 'generated/paper-1/marking-scheme.pdf',
};

/**
 * A Supabase client that records what was deleted.
 *
 * `sold` and `sat` decide what the guard queries find; `deleted` records
 * whether the row was actually removed, which is the thing a refusal must not
 * do.
 */
function fakeClient({ paper = PAPER, sold = false, sat = false } = {}) {
    const state = { deleted: [], queried: [] };

    const result = (table) => {
        if (table === 'exams') return { data: paper, error: null };
        if (table === 'order_items') return { data: sold ? [{ id: 'oi-1' }] : [], error: null };
        if (table === 'exam_sessions') return { data: sat ? [{ id: 'es-1' }] : [], error: null };
        return { data: [], error: null };
    };

    return {
        state,
        from(table) {
            state.queried.push(table);
            const chain = {
                select: () => chain,
                eq: () => chain,
                neq: () => chain,
                limit: async () => result(table),
                maybeSingle: async () => result(table),
                delete: () => ({
                    eq: async (_col, id) => {
                        state.deleted.push({ table, id });
                        return { error: null };
                    },
                }),
                then: undefined,
            };
            return chain;
        },
    };
}

const owner = { id: OWNER, isAdmin: false };
const admin = { id: 'admin-9', isAdmin: true };
const stranger = { id: 'someone-else', isAdmin: false };

// ---------------------------------------------------------------------------

section('An author can delete their own paper');
{
    const client = fakeClient();
    const result = await deletePaper(client, 'paper-1', owner);
    check('it succeeds', result.ok, true);
    check('and names what went', result.title, 'End of Term 2 Examination');
    check('the row is deleted', client.state.deleted.map((d) => d.table), ['exams']);
}

section('An admin can delete somebody else’s paper');
{
    const client = fakeClient();
    const result = await deletePaper(client, 'paper-1', admin);
    check('it succeeds', result.ok, true);
    check('the row is deleted', client.state.deleted.length, 1);
}

section('A stranger cannot');
{
    const client = fakeClient();
    const result = await deletePaper(client, 'paper-1', stranger);
    check('it is refused', result.ok, false);
    check('with 403', result.status, 403);
    // The check that matters: a refusal must not have deleted anything first.
    check('and nothing was deleted', client.state.deleted, []);
}

section('A sold paper is kept, so buyers keep what they paid for');
{
    const client = fakeClient({ sold: true });
    const result = await deletePaper(client, 'paper-1', admin);
    check('it is refused', result.ok, false);
    check('with 409', result.status, 409);
    check('nothing was deleted', client.state.deleted, []);
    assert('and it says to unpublish instead', /unpublish/i.test(result.error), result.error.slice(0, 60) + '…');
}

section('A paper somebody has sat is kept, so learners keep their results');
{
    // Nothing in the database stops this one: exam_sessions cascades, so the
    // delete would succeed and take the answers and marks with it.
    const client = fakeClient({ sat: true });
    const result = await deletePaper(client, 'paper-1', admin);
    check('it is refused', result.ok, false);
    check('with 409', result.status, 409);
    check('nothing was deleted', client.state.deleted, []);
    assert('and says whose loss it would be', /answers|results/i.test(result.error), result.error.slice(0, 60) + '…');
}

section('A paper that is only part-sat is still deletable');
{
    // `in_progress` is excluded by the query: somebody who opened a paper and
    // wandered off has invested nothing worth keeping a dead paper for.
    const client = fakeClient({ sat: false });
    const result = await deletePaper(client, 'paper-1', owner);
    check('it succeeds', result.ok, true);
}

section('Both guards are consulted before anything is removed');
{
    const client = fakeClient();
    await deletePaper(client, 'paper-1', owner);
    assert('the sale check ran', client.state.queried.includes('order_items'), 'checked');
    assert('the sitting check ran', client.state.queried.includes('exam_sessions'), 'checked');
}

section('A missing paper is a clean 404');
{
    const client = fakeClient({ paper: null });
    const result = await deletePaper(client, 'paper-1', admin);
    check('it is refused', result.ok, false);
    check('with 404', result.status, 404);
    check('nothing was deleted', client.state.deleted, []);
}

section('An empty id is refused rather than matching everything');
{
    const client = fakeClient();
    const result = await deletePaper(client, '', admin);
    check('it is refused', result.ok, false);
    check('nothing was deleted', client.state.deleted, []);
}

section('A paper with no generated files still deletes');
{
    const client = fakeClient({
        paper: { ...PAPER, pdf_storage_key: null, marking_scheme_storage_key: null },
    });
    const result = await deletePaper(client, 'paper-1', owner);
    check('it succeeds', result.ok, true);
    check('with nothing to clean up', result.filesRemoved, 0);
    assert('and no warning', !result.storageWarning, 'clean');
}

// ---------------------------------------------------------------------------

console.log(`\n${failures === 0 ? 'All' : `${checks - failures}/${checks}`} paper-delete checks passed.`);
if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
}
