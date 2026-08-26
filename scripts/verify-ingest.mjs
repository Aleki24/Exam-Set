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
const { summariseCoverage } = await jiti.import('../src/lib/ingestCoverage.ts');
const { stripHtml } = await jiti.import('../src/lib/ingestQuestions.ts');

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

const CBC = 'cur-cbc';

const ctx = {
    subjects: [
        { id: 'sub-math', name: 'Mathematics' },
        { id: 'sub-sci', name: 'Integrated Science / Health Education' },
    ],
    // Two rows named "Grade 9", exactly as the live database holds them: one
    // CBC and configured, one IGCSE with no level. Picking the wrong one writes
    // a question that exists and can never be found.
    grades: [
        { id: 'g9-igcse', name: 'Grade 9', curriculumId: 'cur-igcse', level: null },
        { id: 'g9-cbc', name: 'Grade 9', curriculumId: CBC, level: 'junior' },
    ],
    curriculumId: CBC,
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
    check('grade resolved to the CBC row, not IGCSE', rows[0].grade_id, 'g9-cbc');
    check('curriculum written, or the setter cannot see it', rows[0].curriculum_id, CBC);
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

console.log('\nA duplicated grade name resolves on evidence, not on order');
{
    // The curriculum breaks the tie.
    const igcse = normaliseIngest([good], { ...ctx, curriculumId: 'cur-igcse' });
    check('asking for IGCSE gets the IGCSE row', igcse.rows[0].grade_id, 'g9-igcse');

    // With no curriculum to go on, prefer a row the level filter can reach
    // over one with no level at all.
    const blind = normaliseIngest([good], { ...ctx, curriculumId: null });
    check('no curriculum given falls back to the configured row', blind.rows[0].grade_id, 'g9-cbc');

    // Order in the array must not decide it.
    const reversed = normaliseIngest([good], { ...ctx, grades: [...ctx.grades].reverse() });
    check('array order does not decide', reversed.rows[0].grade_id, 'g9-cbc');

    const unknown = normaliseIngest([{ ...good, grade: 'Grade 42' }], ctx);
    check('an unknown grade is null, not a wrong guess', unknown.rows[0].grade_id, null);
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


// ---------------------------------------------------------------------------
// WHERE THE GAPS ARE
//
// 201 of the first 253 questions landed on one subject at one level, because
// nothing ever told the model what was already covered. Reporting coverage only
// per subject-and-grade did not fix that: "Grade 9 Mathematics: 30 pending"
// names no part of the syllabus to write toward. These cover the strand-level
// answer that replaced it.

console.log('\nCoverage is reported at strand level, thinnest first');
{
    const subjects = new Map([['s1', 'Mathematics'], ['s2', 'Social Studies']]);
    const grades = new Map([['g9', 'Grade 9'], ['g4', 'Grade 4']]);

    const rows = [
        { subject_id: 's1', grade_id: 'g9', review_status: 'approved', topic: 'Algebra' },
        { subject_id: 's1', grade_id: 'g9', review_status: 'approved', topic: 'Algebra' },
        { subject_id: 's1', grade_id: 'g9', review_status: 'pending',  topic: 'Geometry' },
        { subject_id: 's1', grade_id: 'g9', review_status: 'approved', topic: 'Measurement' },
        { subject_id: 's2', grade_id: 'g4', review_status: 'approved', topic: 'Natural Resources' },
    ];

    const { coverage, topicsInUse } = summariseCoverage(rows, subjects, grades);

    check('pairings are ranked by what is stocked', coverage.map((c) => `${c.subject} ${c.grade}`),
        ['Mathematics Grade 9', 'Social Studies Grade 4']);
    check('the pairing total is unchanged', [coverage[0].approved, coverage[0].pending], [3, 1]);

    // The whole point: the emptiest strand is the first thing read.
    check('thinnest strand first', coverage[0].topics.map((t) => t.topic),
        ['Geometry', 'Measurement', 'Algebra']);
    check('with its own counts', coverage[0].topics[0], { topic: 'Geometry', approved: 0, pending: 1 });

    // Spelling: the shop filters on the literal string, so the vocabulary in use
    // has to be published or every run coins a synonym.
    check('every spelling in use is published', topicsInUse,
        ['Algebra', 'Geometry', 'Measurement', 'Natural Resources']);
}

console.log('\nCoverage counting handles the awkward rows');
{
    const subjects = new Map([['s1', 'English']]);
    const grades = new Map([['g9', 'Grade 9']]);

    const rows = [
        // Whitespace must not split a strand in two.
        { subject_id: 's1', grade_id: 'g9', review_status: 'approved', topic: '  Reading  ' },
        { subject_id: 's1', grade_id: 'g9', review_status: 'approved', topic: 'Reading' },
        // A blank topic is not a strand called "".
        { subject_id: 's1', grade_id: 'g9', review_status: 'approved', topic: '   ' },
        { subject_id: 's1', grade_id: 'g9', review_status: 'approved', topic: null },
        // Rejected stock is not stock, but it IS evidence of the spelling.
        { subject_id: 's1', grade_id: 'g9', review_status: 'rejected', topic: 'Grammar' },
    ];

    const { coverage, topicsInUse } = summariseCoverage(rows, subjects, grades);
    const topics = coverage[0].topics;

    check('whitespace does not fork a strand', topics.find((t) => t.topic === 'Reading')?.approved, 2);
    check('a blank topic is not a strand', topics.some((t) => !t.topic.trim()), false);
    check('rejected counts as neither approved nor pending',
        topics.find((t) => t.topic === 'Grammar'), { topic: 'Grammar', approved: 0, pending: 0 });
    check('but its spelling is still published', topicsInUse.includes('Grammar'), true);
    check('unknown ids degrade to null, not a crash',
        summariseCoverage([{ subject_id: 'nope', grade_id: 'nope', review_status: 'approved', topic: 'X' }],
            subjects, grades).coverage[0].subject, null);
}


// ---------------------------------------------------------------------------
// MARKUP MUST NOT REACH THE BANK
//
// 101 questions arrived carrying a rich-text editor's own output, e.g.
// <ol><li><p>Convert the following masses.</p></li></ol><p>a)0.245 kg</p>.
// The reviewer was shown the tags verbatim; the paper renderer, which injects
// question text with dangerouslySetInnerHTML, rendered them instead. Stripping
// on the way in closes both, and keeps contributor text away from an HTML sink.

console.log('\nHTML is stripped out of submitted text');
{
    check('the real case from the bank',
        stripHtml('<ol><li><p>Convert the following masses in to weight.</p></li></ol><p>a)0.245 kg</p><p></p>'),
        'Convert the following masses in to weight.\na)0.245 kg');

    // Sub-parts were separate list items; they must not run together.
    check('block closers become line breaks',
        stripHtml('<p>Part a</p><p>Part b</p>'), 'Part a\nPart b');
    check('a br is a line break too', stripHtml('one<br>two'), 'one\ntwo');

    // Empty <p></p> spacers left behind by the editor.
    check('runs of blank lines collapse',
        stripHtml('<p>Q</p><p></p><p></p><p></p><p>a)</p>'), 'Q\na)');

    check('entities are decoded', stripHtml('Salt &amp; sand &lt;test&gt;'), 'Salt & sand <test>');
    check('plain text is untouched', stripHtml('What is 5 + 3?'), 'What is 5 + 3?');

    // Maths must survive: "3x < 5" is not a tag, and neither is "a <= b".
    check('a less-than in maths is not a tag', stripHtml('Solve 3x < 5'), 'Solve 3x < 5');
    check('and neither is an inequality', stripHtml('Show that a <= b'), 'Show that a <= b');

    // The sink this is protecting.
    check('a script tag does not survive',
        stripHtml('<script>alert(1)</script>Answer'), 'alert(1)Answer');
    check('nor an event handler on a tag',
        stripHtml('<img src=x onerror="alert(1)">Diagram'), 'Diagram');
}

// A stripped question is still measured on what is left of it.
console.log('\nStripping happens before the question is judged');
{
    const ctx = { subjects: [{ id: 's1', name: 'Mathematics' }], grades: [{ id: 'g1', name: 'Grade 9' }] };
    const { rows, rejected } = normaliseIngest(
        [
            // 14 characters of markup, no question at all.
            { text: '<p></p><p></p>', marks: 2, marking_scheme: 'x', topic: 'Algebra', subject: 'Mathematics', grade: 'Grade 9' },
            { text: '<p>What is the value of 4 + 5?</p>', marks: 1, marking_scheme: '<p>9 &nbsp;(accept nine)</p>', topic: 'Numbers', subject: 'Mathematics', grade: 'Grade 9' },
        ],
        ctx
    );
    check('markup alone is rejected, not padded to length', rejected.length, 1);
    check('and the reason names the text', /text is missing or too short/.test(rejected[0]?.reason ?? ''), true);
    check('the real question survives', rows.length, 1);
    check('with its tags gone', rows[0]?.text, 'What is the value of 4 + 5?');
    check('and the scheme cleaned too', rows[0]?.marking_scheme, '9  (accept nine)');
}

console.log(
    failures === 0
        ? `\nAll ${checks} ingest checks passed.\n`
        : `\n${failures} of ${checks} ingest checks FAILED.\n`
);
process.exit(failures === 0 ? 0 : 1);
