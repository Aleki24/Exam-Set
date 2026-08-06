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

const { assemblePaper, paperStats, totalMarks, shuffle, planFeasibility, planMinutes } = await jiti.import(
    '../src/services/paperBuilder.ts'
);

const { assembleFromPlan, declaredSections } = await jiti.import('../src/services/paperBuilder.ts');

const { PAPER_FORMATS, FORMAT_BY_ID, resolveFormat, toPlan } = await jiti.import(
    '../src/lib/paperFormats/index.ts'
);

const { layoutPaper, layoutSectionedPaper, layoutFor } = await jiti.import('../src/services/paperLayout.ts');

const { quickAddPayload, validateQuickAdd, clearedForNext, resolveContext, deficitToPrefill, applyPrefill } =
    await jiti.import('../src/lib/quickAdd.ts');

const { schemeIsUsable, schemeIsPlainAnswer } = await jiti.import('../src/services/markingService.ts');

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

// ===========================================================================
// PAPER FORMATS — resolving a class to the shape of its paper
// ===========================================================================

/** Questions of one type and mark, for filling a section under test. */
function makeTyped(count, { type, marks = 1, topic = 'Energy', difficulty = 'Medium', scheme = true, prefix }) {
    const out = [];
    for (let i = 0; i < count; i++) {
        out.push({
            id: `${prefix ?? type.replace(/\W/g, '')}-${marks}-${i}`,
            text: `${type} question ${i}`,
            marks,
            difficulty,
            topic,
            type,
            usage_count: 0,
            markingScheme: scheme ? 'Award 1 mark for the correct response.' : undefined,
        });
    }
    return out;
}

const pin = { gradeLabel: 'Grade 9', subject: 'Integrated Science / Health Education', examType: 'end-term' };

section('Resolves a format from the messy subject names the bank actually holds');
{
    const science = resolveFormat({
        subject: 'Integrated Science / Health Education',
        gradeLabel: 'Grade 9',
        examType: 'end-term',
    });
    check('composite science name matches', science?.id === 'kjsea-integrated-science', science?.id);

    const preTech = resolveFormat({
        subject: 'Pre-Technical Studies / Business Studies / Computer Studies',
        gradeLabel: 'Grade 9',
        examType: 'end-term',
    });
    check('three-way composite matches', preTech?.id === 'kjsea-pre-technical', preTech?.id);

    // Level comes from the printed grade label, never from the `grades` table,
    // which holds two Grade 10 rows and a Grade 9 with no level at all.
    const kcse = resolveFormat({ subject: 'Mathematics', gradeLabel: 'Form 4', examType: 'mock' });
    check('Form 4 resolves to the KCSE format', kcse?.id === 'kcse-mathematics-paper-1', kcse?.id);

    const jssMaths = resolveFormat({ subject: 'Mathematics', gradeLabel: 'Grade 9', examType: 'end-term' });
    check('Grade 9 resolves to the KJSEA format', jssMaths?.id === 'kjsea-mathematics', jssMaths?.id);
}

section('Picks the right authority, and refuses to invent one');
{
    // A CAT is not a national paper, so the KJSEA shapes decline it and the
    // school convention takes over.
    const cat = resolveFormat({ subject: 'Mathematics', gradeLabel: 'Grade 9', examType: 'cat' });
    check('a CAT gets the school shape', cat?.id === 'jss-cat', cat?.id);
    check('and it is labelled as a convention', cat?.origin === 'school', cat?.origin);

    // No published senior written structure exists, so nothing here claims one.
    const senior = resolveFormat({ subject: 'Aviation', gradeLabel: 'Grade 10', examType: 'end-term' });
    check('senior CBE falls back to a school shape', senior?.origin === 'school', senior?.origin);
    check('and admits it is provisional', senior?.provisional === true);
    check(
        'no senior format forces an objective section',
        PAPER_FORMATS.filter((f) => f.level === 'senior-school').every((f) =>
            f.sections.every((s) => !s.types.includes('Multiple Choice'))
        )
    );

    check('an uncovered level resolves to nothing', resolveFormat({ gradeLabel: 'PP1' }) === null);
}

section('Every catalogue entry declares where its authority comes from');
{
    const knec = PAPER_FORMATS.filter((f) => f.origin === 'knec');
    check('KNEC formats all carry a checked date', knec.every((f) => Boolean(f.verifiedOn)));
    check(
        'unconfirmed KNEC formats say so',
        knec.every((f) => f.sourceUrl || f.provisional || f.note),
        knec.filter((f) => !f.sourceUrl && !f.provisional && !f.note).map((f) => f.id).join()
    );
    check(
        'section marks add up to the scored total',
        PAPER_FORMATS.every((f) => f.sections.reduce((s, x) => s + x.marks, 0) === f.scoredMarks),
        PAPER_FORMATS.filter((f) => f.sections.reduce((s, x) => s + x.marks, 0) !== f.scoredMarks)
            .map((f) => f.id)
            .join()
    );
    check(
        'no section asks for more answers than it prints',
        PAPER_FORMATS.every((f) =>
            f.sections.every((s) => s.answerAny === undefined || s.answerAny <= (s.questionsSet ?? Infinity))
        )
    );
    check(
        'every junior KNEC theory format opens with objective questions',
        PAPER_FORMATS.filter((f) => f.level === 'junior-school' && f.origin === 'knec').every((f) =>
            f.sections[0].types.includes('Multiple Choice')
        )
    );
}

section('Printed marks and scored marks part company where KCSE says they must');
{
    const kcse = FORMAT_BY_ID['kcse-mathematics-paper-1'];
    const two = kcse.sections.find((s) => s.id === 'II');
    check('Section II prints eight for five answers', two.questionsSet === 8 && two.answerAny === 5);
    check('the candidate is still scored out of 100', kcse.scoredMarks === 100);

    const printed = kcse.sections.reduce(
        (sum, s) => sum + (s.questionsSet && s.marksPerQuestion ? s.questionsSet * s.marksPerQuestion : s.marks),
        0
    );
    check('but the paper prints more than it scores', printed > kcse.scoredMarks, `${printed} printed`);
}

section('Scaling a format keeps its shape');
{
    const half = toPlan(FORMAT_BY_ID['kjsea-mathematics'], { ...pin, subject: 'Mathematics' }, { scoredMarks: 50 });
    check('scored total honoured', half.scoredMarks === 50);
    check('sections still add up', half.sections.reduce((s, x) => s + x.marks, 0) === 50);
    check(
        'the objective section stays one mark per question',
        half.sections[0].questionsSet === 10 && half.sections[0].marksPerQuestion === 1,
        JSON.stringify(half.sections[0])
    );
    check('provenance travels with the plan', half.origin === 'knec' && Boolean(half.verifiedOn));
}

// ===========================================================================
// FEASIBILITY — what the bank cannot supply, said plainly
// ===========================================================================

const sciencePlan = toPlan(FORMAT_BY_ID['kjsea-integrated-science'], pin);

section('Says yes when the bank can actually fill the format');
{
    const bank = [
        ...makeTyped(60, { type: 'Multiple Choice', marks: 1 }),
        ...makeTyped(40, { type: 'Structured', marks: 4 }),
    ];
    const report = planFeasibility(bank, sciencePlan);
    check('fillable', report.fillable, JSON.stringify(report.deficits.map((d) => d.message)));
    check('no deficits', report.deficits.length === 0);
    check('covers the full scored total', report.coverableMarks === 70, `${report.coverableMarks}`);
}

section('Names exactly what is missing when the bank has no objective questions');
{
    // The shape of the live bank today: structured work only, no MCQs at all.
    const bank = makeTyped(200, { type: 'Structured', marks: 4 });
    const report = planFeasibility(bank, sciencePlan);

    check('not fillable', report.fillable === false);
    const a = report.deficits.find((d) => d.sectionId === 'A');
    check('the objective section is the deficit', Boolean(a));
    check('counted in questions', a?.unit === 'questions', a?.unit);
    check('all thirty are missing', a?.need === 30 && a?.have === 0 && a?.missing === 30, JSON.stringify(a));
    check('the message names the type', /Multiple Choice/.test(a?.message ?? ''), a?.message);
    check('the message names the count', /30 missing/.test(a?.message ?? ''), a?.message);
    check('the structured section still fills', !report.deficits.some((d) => d.sectionId === 'B'));
    check('coverable marks stop at what B can carry', report.coverableMarks === 40, `${report.coverableMarks}`);
}

section('Never pads a section from a type it does not allow');
{
    const bank = [
        ...makeTyped(4, { type: 'Multiple Choice', marks: 1 }),
        ...makeTyped(200, { type: 'Structured', marks: 2 }),
    ];
    const report = planFeasibility(bank, sciencePlan);
    const a = report.deficits.find((d) => d.sectionId === 'A');
    check('the four are counted', a?.have === 4, JSON.stringify(a));
    check('the other twenty-six are reported, not substituted', a?.missing === 26);
    check(
        'section A is worth only what it could fill',
        report.coverableMarks === 4 + 40,
        `${report.coverableMarks}`
    );
}

section('A section that fixes marks per question cannot use questions of another size');
{
    const bank = [
        ...makeTyped(50, { type: 'Multiple Choice', marks: 5 }), // right type, wrong weight
        ...makeTyped(200, { type: 'Structured', marks: 2 }),
    ];
    const report = planFeasibility(bank, sciencePlan);
    const a = report.deficits.find((d) => d.sectionId === 'A');
    check('five-mark MCQs do not fill a one-mark section', a?.have === 0, JSON.stringify(a));
    check('the message says what weight is wanted', /1-mark/.test(a?.message ?? ''), a?.message);
}

section('Sections compete for the same questions instead of double-counting them');
{
    const twoStructured = {
        ...sciencePlan,
        scoredMarks: 40,
        sections: [
            { id: 'A', label: 'SECTION A', title: 'One', instruction: '', types: ['Structured'], marks: 20 },
            { id: 'B', label: 'SECTION B', title: 'Two', instruction: '', types: ['Structured'], marks: 20 },
        ],
    };
    const bank = makeTyped(5, { type: 'Structured', marks: 4 }); // 20 marks in total
    const report = planFeasibility(bank, twoStructured);
    check('the first section fills', !report.deficits.some((d) => d.sectionId === 'A'));
    check('the second reports the shortfall', report.deficits.some((d) => d.sectionId === 'B'));
    check('nothing is counted twice', report.coverableMarks === 20, `${report.coverableMarks}`);
}

section('A CAT is judged against what has been taught, not the whole syllabus');
{
    const bank = [
        ...makeTyped(30, { type: 'Multiple Choice', marks: 1, topic: 'Mixtures', prefix: 'taught' }),
        ...makeTyped(30, { type: 'Structured', marks: 4, topic: 'Mixtures', prefix: 'taught-s' }),
        ...makeTyped(90, { type: 'Multiple Choice', marks: 1, topic: 'Astronomy', prefix: 'untaught' }),
    ];

    const whole = planFeasibility(bank, sciencePlan);
    check('with no coverage window the whole bank counts', whole.fillable, JSON.stringify(whole.deficits));

    const taughtOnly = planFeasibility(bank, { ...sciencePlan, coverage: { strands: ['Mixtures'] } });
    check('the untaught strand is excluded', taughtOnly.fillable, JSON.stringify(taughtOnly.deficits));
    const narrower = planFeasibility(bank, { ...sciencePlan, coverage: { strands: ['Astronomy'] } });
    check(
        'a window with no structured work reports it',
        narrower.deficits.some((d) => d.sectionId === 'B'),
        JSON.stringify(narrower.deficits.map((d) => d.message))
    );
}

section('Counts the marking schemes a school will need at the printer');
{
    const bank = [
        ...makeTyped(30, { type: 'Multiple Choice', marks: 1, scheme: false }),
        ...makeTyped(10, { type: 'Structured', marks: 4, scheme: true }),
    ];
    const report = planFeasibility(bank, sciencePlan);
    check('the schemeless questions are counted', report.schemeGaps === 30, `${report.schemeGaps}`);
    check('the ones with schemes are not', report.fillable && report.schemeGaps < 40);
}

section('Times a paper by what the questions are, not by a flat rate per mark');
{
    // The flat marks × 1.2 gives 51 minutes for a 30-question objective section
    // that KNEC allows about 30 for. These are the published allowances.
    const cases = [
        ['kjsea-mathematics', 120],
        ['kjsea-integrated-science', 100],
        ['kcse-mathematics-paper-1', 150],
        ['upper-primary-end-term', 60],
    ];
    for (const [id, allowed] of cases) {
        const format = FORMAT_BY_ID[id];
        const plan = toPlan(format, { gradeLabel: format.grades[0], subject: 'Mathematics', examType: 'end-term' });
        const estimate = planMinutes(plan);
        const drift = Math.abs(estimate - allowed) / allowed;
        check(`${id} estimated within 15% of ${allowed} min`, drift <= 0.15, `${estimate} min (${Math.round(drift * 100)}%)`);
    }

    const plan = toPlan(FORMAT_BY_ID['kjsea-integrated-science'], pin);
    check('and the flag agrees', planFeasibility([], plan).withinDuration);
}

section('An empty bank is a worklist, not a crash');
{
    const report = planFeasibility([], sciencePlan);
    check('does not throw, and says nothing is fillable', report.fillable === false);
    check('one deficit per section', report.deficits.length === sciencePlan.sections.length);
    check('every deficit carries a sentence', report.deficits.every((d) => d.message.length > 20));
    check('nothing is coverable', report.coverableMarks === 0);
}

// ===========================================================================
// SECTION-AWARE ASSEMBLY
// ===========================================================================

/** A bank deep enough to fill a KJSEA-shaped paper, spread over difficulties. */
function makeSectionedBank() {
    const bank = [];
    const difficulties = ['Easy', 'Medium', 'Difficult'];
    const topics = ['Mixtures', 'Energy', 'Living Things'];
    for (let i = 0; i < 60; i++) {
        bank.push({
            id: `mcq-${i}`,
            text: `Objective question ${i}`,
            marks: 1,
            difficulty: difficulties[i % 3],
            topic: topics[i % 3],
            type: 'Multiple Choice',
            options: ['A', 'B', 'C', 'D'],
            usage_count: 0,
            markingScheme: 'B',
        });
    }
    for (let i = 0; i < 60; i++) {
        bank.push({
            id: `str-${i}`,
            text: `Structured question ${i}`,
            // A realistic spread. The live bank is almost entirely one-mark
            // questions, and a fixture with none of them cannot fill a section
            // to an exact total — which says more about the fixture than the
            // engine.
            marks: [1, 2, 3, 4][i % 4],
            difficulty: difficulties[i % 3],
            topic: topics[i % 3],
            type: 'Structured',
            usage_count: 0,
            markingScheme: 'Award marks as shown.',
        });
    }
    return bank;
}

section('Fills every section of the declared format');
{
    const result = assembleFromPlan(makeSectionedBank(), sciencePlan);
    check('two sections', result.sections.length === 2);
    check('Section A carries thirty questions', result.sections[0].questions.length === 30, `${result.sections[0].questions.length}`);
    check('Section A is worth its thirty marks', result.sections[0].scoredMarks === 30);
    check('Section B reaches its forty', result.sections[1].scoredMarks === 40, `${result.sections[1].scoredMarks}`);
    check('the paper scores exactly seventy', result.scoredMarks === 70, `${result.scoredMarks}`);
    check('no shortfall', result.shortfallMarks === 0);
    check('feasibility agrees', result.feasibility.fillable);
}

section('A bank too coarse to hit the total exactly says so');
{
    // Only three-mark questions against a forty-mark section: thirteen reach
    // 39 and the fourteenth would overshoot. Landing a mark short is the right
    // answer here, and it has to be reported rather than rounded away.
    const bank = [
        ...makeTyped(40, { type: 'Multiple Choice', marks: 1 }),
        ...makeTyped(40, { type: 'Structured', marks: 3 }),
    ];
    const report = planFeasibility(bank, sciencePlan);
    const b = report.deficits.find((d) => d.sectionId === 'B');
    check('the shortfall is reported', b?.missing === 1, JSON.stringify(b));
    check('counted in marks', b?.unit === 'marks');

    const result = assembleFromPlan(bank, sciencePlan);
    check('and the paper never overshoots to compensate', result.scoredMarks <= sciencePlan.scoredMarks);
    check(
        'what it built and what it lacks still add up',
        result.scoredMarks + result.shortfallMarks === sciencePlan.scoredMarks,
        `${result.scoredMarks} + ${result.shortfallMarks}`
    );
}

section('A section never holds a type it does not allow');
{
    const result = assembleFromPlan(makeSectionedBank(), sciencePlan);
    for (const s of result.sections) {
        check(
            `${s.plan.label} holds only ${s.plan.types.join('/')}`,
            s.questions.every((q) => s.plan.types.includes(q.type)),
            s.questions.filter((q) => !s.plan.types.includes(q.type)).map((q) => q.type).join()
        );
    }
}

section('Leaves a section short rather than padding it from elsewhere');
{
    // Four MCQs and a deep structured bank — the tempting substitution.
    const bank = [
        ...makeTyped(4, { type: 'Multiple Choice', marks: 1 }),
        ...makeTyped(100, { type: 'Structured', marks: 2 }),
    ];
    const result = assembleFromPlan(bank, sciencePlan);

    check('Section A holds only the four that exist', result.sections[0].questions.length === 4);
    check('and nothing else was let in', result.sections[0].questions.every((q) => q.type === 'Multiple Choice'));
    check('Section B still fills', result.sections[1].scoredMarks === 40);
    check('the paper is short by the objective marks', result.scoredMarks === 44, `${result.scoredMarks}`);
    check('the shortfall is reported', result.shortfallMarks === 26);
    check(
        'and explained in words',
        result.notes.some((n) => /Multiple Choice/.test(n) && /26 missing/.test(n)),
        result.notes.join(' | ')
    );
}

section('Never exceeds a section ceiling or the paper total');
{
    for (const id of ['kjsea-mathematics', 'kjsea-integrated-science', 'upper-primary-end-term']) {
        const format = FORMAT_BY_ID[id];
        const plan = toPlan(format, { gradeLabel: format.grades[0], subject: 'Mathematics', examType: 'end-term' });
        const result = assembleFromPlan(makeSectionedBank(), plan);
        check(
            `${id} never scores more than its total`,
            result.scoredMarks <= plan.scoredMarks,
            `${result.scoredMarks} of ${plan.scoredMarks}`
        );
        check(
            `${id} keeps every section inside its marks`,
            result.sections.every((s) => s.scoredMarks <= s.plan.marks),
            result.sections.map((s) => `${s.plan.label}:${s.scoredMarks}/${s.plan.marks}`).join(' ')
        );
    }
}

section('Prints more than it scores where the format says questions are optional');
{
    const bank = [
        ...makeTyped(40, { type: 'Structured', marks: 10, prefix: 'ten' }),
        ...makeTyped(60, { type: 'Structured', marks: 3, prefix: 'three' }),
    ];
    const kcse = toPlan(FORMAT_BY_ID['kcse-mathematics-paper-1'], {
        gradeLabel: 'Form 4',
        subject: 'Mathematics',
        examType: 'mock',
    });
    const result = assembleFromPlan(bank, kcse);

    const two = result.sections.find((s) => s.plan.id === 'II');
    check('Section II prints eight questions', two.questions.length === 8, `${two.questions.length}`);
    check('worth eighty printed marks', two.printedMarks === 80, `${two.printedMarks}`);
    check('but scored out of fifty', two.scoredMarks === 50, `${two.scoredMarks}`);
    check('the candidate is marked out of a hundred', result.scoredMarks === 100, `${result.scoredMarks}`);
    check('while the paper carries more on the page', result.printedMarks > 100, `${result.printedMarks} printed`);
}

section('Never repeats a question, or one already in the paper');
{
    const bank = makeSectionedBank();
    const result = assembleFromPlan(bank, sciencePlan);
    const ids = result.questions.map((q) => q.id);
    check('all picks unique', new Set(ids).size === ids.length);
    check('sections do not share questions', ids.length === result.sections.reduce((n, s) => n + s.questions.length, 0));

    const alreadyIn = bank.slice(0, 40);
    const second = assembleFromPlan(bank, sciencePlan, alreadyIn);
    const used = new Set(alreadyIn.map((q) => q.id));
    check('nothing already in the paper comes back', second.questions.every((q) => !used.has(q.id)));
}

section('Honours the difficulty mix where the sections leave room');
{
    const plan = { ...sciencePlan, difficultyMix: { Easy: 30, Medium: 50, Difficult: 20 } };
    const result = assembleFromPlan(makeSectionedBank(), plan);
    const { Easy, Medium, Difficult } = result.difficultyBreakdown;
    check('easy within 12 marks', Math.abs(Easy.actualMarks - Easy.targetMarks) <= 12, `${Easy.actualMarks} vs ${Easy.targetMarks}`);
    check('medium within 12 marks', Math.abs(Medium.actualMarks - Medium.targetMarks) <= 12, `${Medium.actualMarks} vs ${Medium.targetMarks}`);
    check(
        'difficult within 12 marks',
        Math.abs(Difficult.actualMarks - Difficult.targetMarks) <= 12,
        `${Difficult.actualMarks} vs ${Difficult.targetMarks}`
    );
}

section('A CAT draws only on what has been taught');
{
    const bank = [
        ...makeTyped(20, { type: 'Multiple Choice', marks: 1, topic: 'Mixtures', prefix: 'taught-m' }),
        ...makeTyped(30, { type: 'Structured', marks: 2, topic: 'Mixtures', prefix: 'taught-s' }),
        ...makeTyped(50, { type: 'Structured', marks: 2, topic: 'Astronomy', prefix: 'untaught' }),
    ];
    const cat = toPlan(FORMAT_BY_ID['jss-cat'], { ...pin, examType: 'cat' }, { coverage: { strands: ['Mixtures'] } });
    const result = assembleFromPlan(bank, cat);
    check('the paper fills', result.shortfallMarks === 0, `${result.scoredMarks} of ${cat.scoredMarks}`);
    check('nothing untaught appears', result.questions.every((q) => q.topic === 'Mixtures'));
    check('the strand breakdown reports it', Boolean(result.strandBreakdown['Mixtures']));
}

// ===========================================================================
// THE PAYOFF — the renderer can finally see the sections
// ===========================================================================

const PAPER = { title: 'End of Term', subject: 'Integrated Science', grade_label: 'Grade 9', total_marks: 70 };

section('An assembled paper renders as SECTION A and SECTION B');
{
    const result = assembleFromPlan(makeSectionedBank(), sciencePlan);
    const layout = layoutPaper(PAPER, result.questions);

    check('the renderer finds two sections', layout.sections.length === 2, `${layout.sections.length}`);
    check('the first is Section A', layout.sections[0]?.label === 'SECTION A', layout.sections[0]?.label);
    check('the second is Section B', layout.sections[1]?.label === 'SECTION B', layout.sections[1]?.label);
    check(
        'Section A is the objective questions',
        layout.sections[0]?.questions.every((q) => q.type === 'Multiple Choice')
    );
    check('the mark table has a row per section', layout.examinerRows.length === 2, `${layout.examinerRows.length}`);
    check(
        'and the instructions say there are two',
        layout.instructions.some((line) => /BOTH sections/i.test(line)),
        layout.instructions.join(' | ')
    );
}

section('Which the difficulty-only engine could not do with the same bank');
{
    // Not a criticism of assemblePaper — it was never told the paper had a
    // shape. Its closing sort by difficulty interleaves objective and
    // structured questions, so `splitIntoSections` cannot recognise a Section A
    // and prints one undifferentiated run. This is the bug the plan describes,
    // pinned so it cannot quietly come back.
    const flat = assemblePaper(makeSectionedBank(), {
        targetMarks: 70,
        difficultyMix: { Easy: 25, Medium: 50, Difficult: 25 },
        topics: [],
        questionTypes: [],
        preferUnused: true,
        avoidDuplicates: true,
    });
    const layout = layoutPaper(PAPER, flat.questions);
    check('the old path renders one run', layout.sections.length === 1, `${layout.sections.length} sections`);
    check('with no section label at all', layout.sections[0]?.label === null, layout.sections[0]?.label);
}

// ===========================================================================
// THE RENDERER CONTRACT — sections declared, not guessed
// ===========================================================================

section('Prints the sections the format declared, not the ones it can infer');
{
    const result = assembleFromPlan(makeSectionedBank(), sciencePlan);
    const layout = layoutSectionedPaper(PAPER, declaredSections(result));

    check('two sections', layout.sections.length === 2);
    check('labelled from the plan', layout.sections.map((s) => s.label).join() === 'SECTION A,SECTION B');
    check(
        'carrying the plan’s own instructions',
        layout.sections[0].instruction === sciencePlan.sections[0].instruction,
        layout.sections[0].instruction
    );
    check('titled from the plan', layout.sections[0].title === 'Objective Questions', layout.sections[0].title);
    check('numbered straight through', layout.questions.map((q) => q.number).join() === layout.questions.map((_, i) => i + 1).join());
    check('a mark-table row per section', layout.examinerRows.length === 2);
    check(
        'and the rows add up to the paper',
        layout.examinerRows.reduce((n, r) => n + r.marks, 0) === layout.totalMarks
    );
}

section('A Kiswahili paper prints SEHEMU, not SECTION');
{
    const kiswahili = toPlan(FORMAT_BY_ID['kjsea-kiswahili-karatasi-1'], {
        gradeLabel: 'Grade 9',
        subject: 'Kiswahili',
        examType: 'end-term',
    });
    check('the plan is in Kiswahili', kiswahili.language === 'sw');
    check('and its sections are labelled SEHEMU', kiswahili.sections.every((s) => s.label.startsWith('SEHEMU')));

    const bank = [
        ...makeTyped(30, { type: 'Multiple Choice', marks: 1, prefix: 'ufahamu' }),
        ...makeTyped(40, { type: 'Fill-in-the-blank', marks: 1, prefix: 'sarufi' }),
    ];
    const result = assembleFromPlan(bank, kiswahili);
    const layout = layoutSectionedPaper(
        { ...PAPER, subject: 'Kiswahili', time_limit: 'Saa 1 dakika 40' },
        declaredSections(result),
        kiswahili.language
    );

    check('the headings are Kiswahili', layout.sections.every((s) => s.label.startsWith('SEHEMU')), layout.sections.map((s) => s.label).join());
    check(
        'the section instructions are Kiswahili',
        layout.sections.every((s) => /Jibu maswali/.test(s.instruction ?? '')),
        layout.sections.map((s) => s.instruction).join(' | ')
    );
    check(
        'and so are the instructions to the candidate',
        layout.instructions.some((l) => /Jibu maswali YOTE katika SEHEMU ZOTE/.test(l)),
        layout.instructions.join(' | ')
    );
    check(
        'with no English rubric left at the top',
        !layout.instructions.some((l) => /Answer ALL|Write your name/.test(l)),
        layout.instructions.join(' | ')
    );
}

section('Does not print a heading over a section the bank could not fill');
{
    // No objective questions at all — the live bank's actual shape. A paper
    // labelled SECTION B with no Section A above it would puzzle a class.
    const bank = makeTyped(60, { type: 'Structured', marks: 2 });
    const result = assembleFromPlan(bank, sciencePlan);
    const layout = layoutSectionedPaper(PAPER, declaredSections(result));

    check('the empty section is dropped', layout.sections.length === 1, `${layout.sections.length}`);
    check('and what is left prints unlabelled', layout.sections[0].label === null, layout.sections[0].label);
    check('the questions are still there', layout.questions.length > 0);
    check(
        'the instructions do not promise two sections',
        !layout.instructions.some((l) => /BOTH sections/i.test(l)),
        layout.instructions.join(' | ')
    );
}

section('One entry point decides, so preview and PDF cannot disagree');
{
    const result = assembleFromPlan(makeSectionedBank(), sciencePlan);
    const declared = { sections: declaredSections(result), language: sciencePlan.language };

    // What ExamPreview, MarkingSchemePreview and the PDF builders all call now.
    const withPlan = layoutFor(PAPER, result.questions, declared);
    check('declared sections are used', withPlan.sections.length === 2);
    check('labelled from the plan', withPlan.sections[0].label === 'SECTION A');

    const withoutPlan = layoutFor(PAPER, result.questions, undefined);
    check('without a declaration it infers', withoutPlan.sections.length === 2);
    check(
        'and both agree on the questions',
        withPlan.questions.length === withoutPlan.questions.length &&
            withPlan.totalMarks === withoutPlan.totalMarks
    );

    // An empty declaration is not a declaration — it must not blank the paper.
    const empty = layoutFor(PAPER, result.questions, { sections: [] });
    check('an empty declaration falls back rather than printing nothing', empty.questions.length > 0);
}

section('Hand-set papers keep the old inference, untouched');
{
    // layoutPaper is what /set calls today and what every stored paper renders
    // through. Its behaviour must not have moved.
    const objectiveFirst = [
        ...makeTyped(5, { type: 'Multiple Choice', marks: 1 }),
        ...makeTyped(5, { type: 'Structured', marks: 4 }),
    ];
    const inferred = layoutPaper(PAPER, objectiveFirst);
    check('still infers a clean split', inferred.sections.length === 2, `${inferred.sections.length}`);
    check('still labels it SECTION A', inferred.sections[0].label === 'SECTION A');
    check('still in English', inferred.instructions.some((l) => /Answer ALL/.test(l)));

    const interleaved = assemblePaper(makeSectionedBank(), {
        targetMarks: 70,
        difficultyMix: { Easy: 25, Medium: 50, Difficult: 25 },
        topics: [],
        questionTypes: [],
        preferUnused: true,
        avoidDuplicates: true,
    });
    check('and still refuses to invent one', layoutPaper(PAPER, interleaved.questions).sections.length === 1);
}

section('An empty bank produces an empty paper, not a broken one');
{
    const result = assembleFromPlan([], sciencePlan);
    check('no questions', result.questions.length === 0);
    check('no marks', result.scoredMarks === 0);
    check('the whole total is the shortfall', result.shortfallMarks === 70);
    check('every section is present but empty', result.sections.length === 2 && result.sections.every((s) => s.questions.length === 0));
    check('and the notes say what to do', result.notes.length > 0, result.notes.join(' | '));
}

// ===========================================================================
// QUICK ADD — clearing the worklist the builder produces
// ===========================================================================

const quick = (over = {}) => ({
    text: 'What is the capital of Kenya?',
    marks: 1,
    type: 'Multiple Choice',
    topic: 'Kenya',
    difficulty: 'Medium',
    options: ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru'],
    answer: 0,
    curriculum_id: 'c1',
    grade_id: 'g1',
    subject_id: 's1',
    ...over,
});

section('An answered objective question carries a scheme that survives marking');
{
    const payload = quickAddPayload(quick());
    check('the answer becomes the marking scheme', payload.marking_scheme === 'A. Nairobi', String(payload.marking_scheme));

    // markingService discards a scheme shorter than two characters, so a bare
    // "A" would be stored and then ignored as though it were never there.
    check('long enough for markingService to keep', schemeIsUsable(payload.marking_scheme));
    check('and plain enough to compare directly', schemeIsPlainAnswer(payload.marking_scheme));
    check('carries the letter the sitting UI submits', /^A\./.test(payload.marking_scheme));

    const tf = quickAddPayload(quick({ type: 'True/False', answer: 'False', options: [] }));
    check('true/false records its answer too', tf.marking_scheme === 'False', String(tf.marking_scheme));
    check('which is also usable', schemeIsUsable(tf.marking_scheme));
}

section('Refuses to save an objective question with no answer');
{
    const errors = validateQuickAdd(quick({ answer: null }));
    check('the answer is required', Boolean(errors.answer), JSON.stringify(errors));
    check(
        'and the reason given is the real one',
        /cannot be marked/.test(errors.answer ?? ''),
        errors.answer
    );

    // Structured questions are marked by a human and need no such answer.
    const structured = validateQuickAdd(quick({ type: 'Structured', answer: null, options: [] }));
    check('structured questions are not held to it', !structured.answer, JSON.stringify(structured));
    check('and save cleanly', Object.keys(structured).length === 0, JSON.stringify(structured));
}

section('Blocks the things that would make a question unfindable');
{
    check('empty text', Boolean(validateQuickAdd(quick({ text: '   ' })).text));
    check('text that is only markup', Boolean(validateQuickAdd(quick({ text: '<p></p>' })).text));
    check('no topic', Boolean(validateQuickAdd(quick({ topic: '' })).topic));
    check('no grade or subject', Boolean(validateQuickAdd(quick({ grade_id: '' })).context));
    check('fewer than two options', Boolean(validateQuickAdd(quick({ options: ['Nairobi', '', '', ''] })).options));
    check('marks below one', Boolean(validateQuickAdd(quick({ marks: 0 })).marks));
    check('a complete question passes', Object.keys(validateQuickAdd(quick())).length === 0);
}

section('Sends only what the quick path actually collected');
{
    const payload = quickAddPayload(quick({ type: 'Structured', options: [], answer: null }));
    check('no empty options array on a structured question', payload.options === undefined);
    check('no marking scheme invented', payload.marking_scheme === undefined);
    check('no blooms level guessed', payload.blooms_level === undefined);
    check('context travels', payload.grade_id === 'g1' && payload.subject_id === 's1');
    check('marks are whole numbers', quickAddPayload(quick({ marks: 2.6 })).marks === 3);
    check(
        'empty options are dropped, not stored',
        quickAddPayload(quick({ options: ['Nairobi', 'Mombasa', '', ''] })).options.length === 2
    );
}

section('Save & add another keeps the context and clears the question');
{
    const next = clearedForNext(quick());
    check('the question is gone', next.text === '');
    check('the answer is gone', next.answer === null);
    check('the options are blank', next.options.every((o) => o === ''));
    check('the type is kept', next.type === 'Multiple Choice');
    check('the topic is kept', next.topic === 'Kenya');
    check('the marks are kept', next.marks === 1);
    check('the context is kept', next.grade_id === 'g1' && next.subject_id === 's1');
}

section('Context: what you are looking at beats what you saved last time');
{
    const remembered = { curriculum_id: 'old-c', grade_id: 'old-g', subject_id: 'old-s', topic: 'Old', type: 'Essay' };
    const resolved = resolveContext({ grade_id: 'new-g', subject_id: 'new-s' }, remembered);
    check('filters win', resolved.grade_id === 'new-g' && resolved.subject_id === 'new-s');
    check('the rest is remembered', resolved.curriculum_id === 'old-c' && resolved.topic === 'Old');
    check('as is the last type used', resolved.type === 'Essay');

    const nothing = resolveContext(undefined, undefined);
    check('with neither, nothing is invented', nothing.grade_id === '' && nothing.subject_id === '');
    check('and the default type is structured', nothing.type === 'Structured');
}

section('A deficit opens a form already set up to clear it');
{
    // Straight from the builder: the real deficit off the live bank shape.
    const report = planFeasibility(makeTyped(200, { type: 'Structured', marks: 4 }), sciencePlan);
    const deficit = report.deficits.find((d) => d.sectionId === 'A');
    const prefill = deficitToPrefill(deficit, { grade_id: 'g9', subject_id: 'sci' });

    check('the type is the one the section needs', prefill.type === 'Multiple Choice', prefill.type);
    check('the marks match the section', prefill.marks === 1, String(prefill.marks));
    check('the count to clear comes across', prefill.remaining === 30, String(prefill.remaining));
    check('the context is pinned', prefill.grade_id === 'g9' && prefill.subject_id === 'sci');
    check('and the teacher is told why', /Multiple Choice/.test(prefill.reason ?? ''), prefill.reason);

    const form = applyPrefill({ ...quick(), type: 'Essay', marks: 9, answer: 2 }, prefill);
    check('the form takes the type', form.type === 'Multiple Choice');
    check('and the marks', form.marks === 1);
    check('and starts with no answer selected', form.answer === null);

    // A marks-driven section counts in marks, so there is no question count.
    const bySection = report.deficits.find((d) => d.unit === 'marks');
    if (bySection) {
        check('a marks deficit offers no misleading count', deficitToPrefill(bySection).remaining === undefined);
    }
}

// ---------------------------------------------------------------------------

console.log(
    failures === 0
        ? '\nAll paper-builder checks passed.\n'
        : `\n${failures} check(s) failed.\n`
);
process.exit(failures === 0 ? 0 : 1);
