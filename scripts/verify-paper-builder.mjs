/**
 * Verification harness for the exam-setting logic.
 *
 *   node scripts/verify-paper-builder.mjs
 *
 * Exercises the pure selection rules in services/paperBuilder against a
 * synthetic question bank. No database, no network — this is about whether the
 * assembler hits mark targets, respects the difficulty mix and never repeats a
 * question.
 */

import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
    alias: { '@': new URL('../src', import.meta.url).pathname },
    interopDefault: true,
});

const { assemblePaper, paperStats, totalMarks, shuffle } = await jiti.import(
    '../src/services/paperBuilder.ts'
);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TOPICS = ['Living Things', 'Energy', 'Matter', 'Earth and Space'];
const TYPES = ['Multiple Choice', 'Structured', 'Short Answer', 'Essay'];

/** A bank with a realistic spread of marks, difficulties and topics. */
function makeBank(count) {
    const bank = [];
    for (let i = 0; i < count; i++) {
        const difficulty = ['Easy', 'Medium', 'Difficult'][i % 3];
        bank.push({
            id: `q-${i}`,
            text: `Question ${i}`,
            marks: [1, 2, 3, 4, 5][i % 5],
            difficulty,
            topic: TOPICS[i % TOPICS.length],
            type: TYPES[i % TYPES.length],
            usage_count: i % 7,
        });
    }
    return bank;
}

const blueprint = (over = {}) => ({
    targetMarks: 60,
    difficultyMix: { Easy: 40, Medium: 40, Difficult: 20 },
    topics: [],
    questionTypes: [],
    preferUnused: true,
    avoidDuplicates: true,
    ...over,
});

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let failures = 0;
function check(name, condition, detail = '') {
    if (condition) {
        console.log(`  ok   ${name}`);
    } else {
        failures++;
        console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    }
}

function section(title) {
    console.log(`\n${title}`);
}

// ---------------------------------------------------------------------------

section('Hits the mark target exactly when the bank is deep enough');
{
    for (const target of [30, 60, 100, 150]) {
        const result = assemblePaper(makeBank(400), blueprint({ targetMarks: target }));
        check(
            `${target}-mark paper totals ${target}`,
            result.totalMarks === target && result.shortfallMarks === 0,
            `got ${result.totalMarks}, shortfall ${result.shortfallMarks}`
        );
        check(
            `${target}-mark paper sums its own questions`,
            totalMarks(result.questions) === result.totalMarks,
            `${totalMarks(result.questions)} vs ${result.totalMarks}`
        );
    }
}

section('Never repeats a question');
{
    const result = assemblePaper(makeBank(300), blueprint({ targetMarks: 120 }));
    const ids = result.questions.map((q) => q.id);
    check('all picks unique', new Set(ids).size === ids.length, `${ids.length} picks, ${new Set(ids).size} unique`);
    check('paperStats reports no duplicates', paperStats(result.questions).duplicateIds.length === 0);
}

section('Respects the difficulty mix');
{
    const result = assemblePaper(makeBank(600), blueprint({ targetMarks: 100 }));
    const { Easy, Medium, Difficult } = result.difficultyBreakdown;
    check(
        'easy share within 10 marks of target',
        Math.abs(Easy.actualMarks - Easy.targetMarks) <= 10,
        `${Easy.actualMarks} vs ${Easy.targetMarks}`
    );
    check(
        'medium share within 10 marks of target',
        Math.abs(Medium.actualMarks - Medium.targetMarks) <= 10,
        `${Medium.actualMarks} vs ${Medium.targetMarks}`
    );
    check(
        'difficult share within 10 marks of target',
        Math.abs(Difficult.actualMarks - Difficult.targetMarks) <= 10,
        `${Difficult.actualMarks} vs ${Difficult.targetMarks}`
    );
}

section('Honours topic and type restrictions');
{
    const result = assemblePaper(
        makeBank(500),
        blueprint({ targetMarks: 40, topics: ['Energy'], questionTypes: ['Structured'] })
    );
    check('every pick is in the chosen topic', result.questions.every((q) => q.topic === 'Energy'));
    check('every pick is the chosen type', result.questions.every((q) => q.type === 'Structured'));
    check('still produced a paper', result.questions.length > 0, `${result.questions.length} questions`);
}

section('Excludes questions already in the paper');
{
    const bank = makeBank(200);
    const existing = bank.slice(0, 20);
    const result = assemblePaper(bank, blueprint({ targetMarks: 50 }), existing);
    const existingIds = new Set(existing.map((q) => q.id));
    check('no overlap with existing questions', result.questions.every((q) => !existingIds.has(q.id)));
}

section('Degrades honestly when the bank is too small');
{
    const result = assemblePaper(makeBank(6), blueprint({ targetMarks: 200 }));
    check('reports a shortfall', result.shortfallMarks > 0, `shortfall ${result.shortfallMarks}`);
    check('explains why', result.notes.length > 0, JSON.stringify(result.notes));
    check(
        'shortfall matches the arithmetic',
        result.shortfallMarks === 200 - result.totalMarks,
        `${result.shortfallMarks} vs ${200 - result.totalMarks}`
    );
    check('never overshoots the target', result.totalMarks <= 200);
}

section('Handles an empty or unmatched bank without throwing');
{
    const empty = assemblePaper([], blueprint());
    check('no questions returned', empty.questions.length === 0);
    check('full target reported as shortfall', empty.shortfallMarks === 60);
    check('gives actionable advice', /add questions|widen/i.test(empty.notes.join(' ')), empty.notes.join(' '));

    const unmatched = assemblePaper(makeBank(50), blueprint({ topics: ['Nonexistent Strand'] }));
    check('unmatched filters return nothing', unmatched.questions.length === 0);
}

section('Counts sub-part marks instead of the top-level mark');
{
    const withParts = [
        {
            id: 'sp-1',
            text: 'Structured question',
            marks: 1, // stale top-level value
            difficulty: 'Medium',
            topic: 'Energy',
            type: 'Structured',
            usage_count: 0,
            subParts: [
                { id: 'a', label: 'a', text: 'part a', marks: 4 },
                { id: 'b', label: 'b', text: 'part b', marks: 6 },
            ],
        },
    ];
    check('sub-parts drive the total', totalMarks(withParts) === 10, `${totalMarks(withParts)}`);
    check('paperStats agrees', paperStats(withParts).marks === 10);
}

section('Prefers least-used questions');
{
    // Two questions per difficulty: one fresh, one heavily used.
    const bank = [];
    for (let i = 0; i < 40; i++) {
        bank.push({
            id: `fresh-${i}`,
            text: 'fresh',
            marks: 2,
            difficulty: 'Easy',
            topic: 'Energy',
            type: 'Structured',
            usage_count: 0,
        });
        bank.push({
            id: `worn-${i}`,
            text: 'worn',
            marks: 2,
            difficulty: 'Easy',
            topic: 'Energy',
            type: 'Structured',
            usage_count: 50,
        });
    }
    const result = assemblePaper(
        bank,
        blueprint({ targetMarks: 40, difficultyMix: { Easy: 100, Medium: 0, Difficult: 0 } })
    );
    const worn = result.questions.filter((q) => q.id.startsWith('worn-')).length;
    check('picks the fresh questions first', worn === 0, `${worn} worn questions used`);
}

section('shuffle does not mutate or lose items');
{
    const input = Object.freeze([1, 2, 3, 4, 5]);
    const out = shuffle(input);
    check('same length', out.length === 5);
    check('same members', [...out].sort((a, b) => a - b).join() === '1,2,3,4,5');
    check('input untouched', input.join() === '1,2,3,4,5');
}

// ---------------------------------------------------------------------------

console.log(
    failures === 0
        ? '\nAll paper-builder checks passed.\n'
        : `\n${failures} check(s) failed.\n`
);
process.exit(failures === 0 ? 0 : 1);
