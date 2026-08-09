/**
 * Verification harness for machine-contributed questions.
 *
 *   node scripts/verify-ingest.mjs
 *
 * These are the rules that stand between a model and a shop. A rejected
 * question costs a retry; an accepted bad one costs a refund and a teacher who
 * does not come back. So the checks here are mostly about what must NOT get
 * through, and they run with no key, no network and no database.
 */

import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
    alias: { '@': new URL('../src', import.meta.url).pathname },
    interopDefault: true,
});

const { normaliseIngest } = await jiti.import('../src/lib/ingestQuestions.ts');
const { mintKey, hashKey, looksLikeKey } = await jiti.import('../src/lib/ingestKeys.ts');

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
    checks++;
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(
        `  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(54)} ${
            ok ? JSON.stringify(actual) : `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`
        }`
    );
}

const ctx = {
    subjects: [
        { id: 'sub-math', name: 'Mathematics' },
        { id: 'sub-sci', name: 'Integrated Science / Health Education' },
    ],
    grades: [{ id: 'g9', name: 'Grade 9' }],
    createdBy: 'user-1',
};

const good = {
    text: 'Evaluate 3x + 5 = 20, giving the value of x.',
    marks: 3,
    marking_scheme: '3x = 15, so x = 5.',
    topic: 'Algebra',
    subject: 'Mathematics',
    grade: 'Grade 9',
};

const run = (qs) => normaliseIngest(qs, ctx);

console.log('\nA complete question is accepted and tagged');
{
    const { rows, rejected } = run([good]);
    check('accepted', rows.length, 1);
    check('nothing rejected', rejected.length, 0);
    check('held for review, never live', rows[0].review_status, 'pending');
    check('marked as machine-written', rows[0].is_ai_generated, true);
    check('attributed to the key owner', rows[0].created_by, 'user-1');
    check('subject resolved', rows[0].subject_id, 'sub-math');
    check('grade resolved', rows[0].grade_id, 'g9');
}

console.log('\nA question with no answer never gets in');
{
    const { rows, rejected } = run([{ ...good, marking_scheme: '' }]);
    check('rejected', rows.length, 0);
    check('and says why', rejected[0].reason.includes('marking_scheme is required'), true);
}

console.log('\nMarks must be a mark');
{
    check('zero', run([{ ...good, marks: 0 }]).rows.length, 0);
    check('negative', run([{ ...good, marks: -3 }]).rows.length, 0);
    check('absurd', run([{ ...good, marks: 5000 }]).rows.length, 0);
    check('not a number', run([{ ...good, marks: 'three' }]).rows.length, 0);
    check('missing', run([{ ...good, marks: undefined }]).rows.length, 0);
    check('a decimal is rounded, not refused', run([{ ...good, marks: 3.4 }]).rows[0].marks, 3);
}

console.log('\nA question has to be a question');
{
    check('empty text', run([{ ...good, text: '' }]).rows.length, 0);
    check('a fragment', run([{ ...good, text: 'x=?' }]).rows.length, 0);
    check('not a string', run([{ ...good, text: 42 }]).rows.length, 0);
}

console.log('\nThe same question twice in one batch is caught');
{
    const { rows, rejected } = run([good, { ...good }]);
    check('only one survives', rows.length, 1);
    check('the second is named as a duplicate', rejected[0].reason.includes('duplicate'), true);
}
{
    // Whitespace and case are not a difference a buyer would notice.
    const { rows } = run([good, { ...good, text: '  EVALUATE 3X + 5 = 20, GIVING THE VALUE OF X.  ' }]);
    check('case and spacing do not evade it', rows.length, 1);
}

console.log('\nMultiple choice needs choices');
{
    check('none', run([{ ...good, type: 'Multiple Choice' }]).rows.length, 0);
    check('one', run([{ ...good, type: 'Multiple Choice', options: ['9'] }]).rows.length, 0);
    check('two is enough', run([{ ...good, type: 'Multiple Choice', options: ['9', '17'] }]).rows.length, 1);
}

console.log('\nUnknown enum values fall back rather than break the insert');
{
    const { rows } = run([{ ...good, difficulty: 'impossible', type: 'Interpretive Dance', blooms_level: 'Vibes' }]);
    check('difficulty', rows[0].difficulty, 'Medium');
    check('type', rows[0].type, 'Short Answer');
    check("bloom's", rows[0].blooms_level, 'Understanding');
}

console.log('\nSubject names are matched the way a person would write them');
{
    check('exact', run([{ ...good, subject: 'Mathematics' }]).rows[0].subject_id, 'sub-math');
    check('lowercase', run([{ ...good, subject: 'mathematics' }]).rows[0].subject_id, 'sub-math');
    check('a partial name finds the combined subject',
        run([{ ...good, subject: 'Integrated Science' }]).rows[0].subject_id, 'sub-sci');
    check('an unknown subject is null, not a wrong guess',
        run([{ ...good, subject: 'Astrology' }]).rows[0].subject_id, null);
}

console.log('\nOne bad question does not lose the batch');
{
    const { rows, rejected } = run([good, { ...good, text: 'no', marking_scheme: 'x' }, { ...good, text: 'A different question entirely, worth four marks.' }]);
    check('the good ones land', rows.length, 2);
    check('the bad one is reported by position', rejected[0].index, 1);
}

console.log('\nKeys are unguessable, and never stored in the clear');
{
    const a = mintKey();
    const b = mintKey();
    check('prefixed so it is recognisable', a.key.startsWith('skb_ingest_'), true);
    check('long enough to be a secret', a.key.length > 40, true);
    check('two keys differ', a.key === b.key, false);
    check('the hash is not the key', a.hash === a.key, false);
    check('hashing is stable', hashKey(a.key), a.hash);
    check('the stored prefix cannot reconstruct it', a.key.startsWith(a.prefix) && a.prefix.length < 20, true);
    check('shape check accepts a real key', looksLikeKey(a.key), true);
    check('and rejects junk', looksLikeKey('hunter2'), false);
    check('and rejects the prefix alone', looksLikeKey('skb_ingest_'), false);
    check('and rejects null', looksLikeKey(null), false);
}

console.log(
    failures === 0
        ? `\nAll ${checks} ingest checks passed.\n`
        : `\n${failures} of ${checks} ingest checks FAILED.\n`
);
process.exit(failures === 0 ? 0 : 1);
