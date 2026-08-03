/**
 * Verification harness for the lower primary curriculum.
 *
 *   node scripts/verify-curriculum.mjs
 *
 * This file is a transcription, and the failure mode of a transcription is a
 * quiet one: a dropped topic does not throw, it just means a class never meets
 * subtraction. So the counts and the exact topic lists are pinned here, against
 * the design as issued. If someone edits `lib/curriculum` and a count moves,
 * this says so.
 *
 * The other half is the gate. `isKnownTopic` is what stands between a generator
 * and an invented topic, and the case it has to get right is not gibberish —
 * it is a real topic borrowed from the wrong grade, which is what a model
 * reaching for something plausible actually produces.
 */

import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
    alias: { '@': new URL('../src', import.meta.url).pathname },
    interopDefault: true,
});

const c = await jiti.import('../src/lib/curriculum.ts');
const { subjectsForLevel } = await jiti.import('../src/lib/resources.ts');

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
    checks++;
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(
        `  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(52)} ${
            ok ? JSON.stringify(actual) : `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`
        }`
    );
}

function assert(label, condition, detail = '') {
    checks++;
    if (!condition) failures++;
    console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${label.padEnd(52)} ${detail}`);
}

const section = (t) => console.log(`\n${t}`);

// ---------------------------------------------------------------------------

section('The seven learning areas, named as the design names them');
check(
    'all seven, in timetable order',
    c.LEARNING_AREAS.map((a) => a.name),
    [
        'Mathematics Activities',
        'English Language Activities',
        'Shughuli za Kiswahili',
        'Indigenous Language Activities',
        'Environmental Activities',
        'Christian Religious Education (CRE) Activities',
        'Creative Arts Activities',
    ]
);
check('every grade teaches all seven', c.LOWER_PRIMARY_GRADES.map((g) => c.learningAreasForGrade(g).length), [7, 7, 7]);

section('Topic counts per grade, per area');
for (const [grade, expected] of [
    [1, { mathematics: 11, english: 14, kiswahili: 10, 'indigenous-language': 5, environmental: 12, 'religious-education': 12, 'creative-arts': 11 }],
    [2, { mathematics: 14, english: 14, kiswahili: 10, 'indigenous-language': 5, environmental: 11, 'religious-education': 14, 'creative-arts': 11 }],
    [3, { mathematics: 14, english: 15, kiswahili: 10, 'indigenous-language': 5, environmental: 12, 'religious-education': 13, 'creative-arts': 13 }],
]) {
    const actual = Object.fromEntries(
        Object.keys(expected).map((id) => [id, c.topicsFor(grade, id).length])
    );
    check(`grade ${grade}`, actual, expected);
}

section('Strands, where the design has them');
check('Grade 1 Mathematics', c.strandsFor(1, 'mathematics').map((s) => s.name), ['Numbers', 'Measurement', 'Geometry']);
check(
    'Grade 1 Environmental',
    c.strandsFor(1, 'environmental').map((s) => s.name),
    ['Social Environment', 'Natural Environment', 'Resources in the Environment']
);
// Grade 2 folds water, plants and animals into the natural environment and has
// no resources strand at all. Pinned because it looks like an omission.
check(
    'Grade 2 Environmental has no resources strand',
    c.strandsFor(2, 'environmental').map((s) => s.name),
    ['Social Environment', 'Natural Environment']
);
check(
    'Grade 3 Environmental',
    c.strandsFor(3, 'environmental').map((s) => s.name),
    ['Social Environment', 'Natural Environment', 'Resources in Our Environment']
);
// Likewise Grade 2 Creative Arts, which has no appreciation strand.
check(
    'Grade 2 Creative Arts has no appreciation strand',
    c.strandsFor(2, 'creative-arts').map((s) => s.name),
    ['Creating and Executing', 'Performance and Display']
);

section('The language areas are thematic, not stranded');
for (const id of ['english', 'kiswahili', 'indigenous-language']) {
    const area = c.LEARNING_AREA_BY_ID[id];
    assert(`${id} is marked thematic`, area.thematic === true, 'themes in sequence');
    check(`${id} strand names are null`, c.strandsFor(1, id).map((s) => s.name), [null]);
}
assert('indigenous language is localisable', c.LEARNING_AREA_BY_ID['indigenous-language'].localisable === true, 'catchment language');

section('Exact topics, spot-checked against the design');
check('Grade 1 Numbers', c.strandsFor(1, 'mathematics')[0].topics, [
    'Pre-number activities',
    'Whole numbers',
    'Addition',
    'Subtraction',
]);
check('Grade 3 Indigenous Language', c.topicsFor(3, 'indigenous-language'), [
    'Introducing Self and Others',
    'The Community',
    'Wild Animals',
    'Road Safety',
    'Seasons of the Year',
]);
check('Grade 2 Christian Values', c.strandsFor(2, 'religious-education')[3].topics, [
    'Sharing',
    'Obedience',
    'Honesty',
    'Forgiveness',
    'Work',
]);
check('Grade 3 Appreciation', c.strandsFor(3, 'creative-arts')[2].topics, [
    'Kenya National Anthem',
    'Water safety',
]);

section('The gate refuses what is not in the design');
assert('a real Grade 1 topic passes', c.isKnownTopic(1, 'mathematics', 'Pre-number activities'), 'known');
assert('an invented topic is refused', !c.isKnownTopic(1, 'mathematics', 'Number patterns'), 'refused');
// The mistake that actually happens: a real topic from the wrong grade.
assert(
    'multiplication is not a Grade 1 topic',
    !c.isKnownTopic(1, 'mathematics', 'Multiplication'),
    'Grade 2 onwards'
);
assert('but it is a Grade 2 topic', c.isKnownTopic(2, 'mathematics', 'Multiplication'), 'known');
assert(
    'Adam and Eve is Grade 3 only',
    !c.isKnownTopic(1, 'religious-education', 'Adam and Eve') &&
        !c.isKnownTopic(2, 'religious-education', 'Adam and Eve') &&
        c.isKnownTopic(3, 'religious-education', 'Adam and Eve'),
    'Grade 3'
);
assert('case matters', !c.isKnownTopic(1, 'mathematics', 'addition'), 'refused');
assert('an unknown learning area yields nothing', c.topicsFor(1, 'science') .length === 0, 'empty');

section('A topic can be traced back to its strand');
check('a stranded topic', c.strandForTopic(1, 'environmental', 'The sky'), 'Natural Environment');
check('a thematic topic has no strand', c.strandForTopic(1, 'english', 'Hygiene'), null);
check('an unknown topic is undefined', c.strandForTopic(1, 'english', 'Astrophysics'), undefined);

section('Strands can be followed across grades without renaming them');
// The design names three strands differently in different grades. Display must
// use the grade's own wording; only comparison normalises.
check('Grade 1 prints its own wording', c.strandsFor(1, 'creative-arts')[1].name, 'Performing and Displaying');
check('Grade 2 prints its own wording', c.strandsFor(2, 'creative-arts')[1].name, 'Performance and Display');
assert(
    'but they match for a three-year tracker',
    c.strandKey('Performing and Displaying') === c.strandKey('Performance and Display'),
    c.strandKey('Performance and Display')
);
assert(
    'and so do creating/creation',
    c.strandKey('Creating and Executing') === c.strandKey('Creation and Executing'),
    c.strandKey('Creation and Executing')
);
assert(
    'and resources in the/our environment',
    c.strandKey('Resources in the Environment') === c.strandKey('Resources in Our Environment'),
    c.strandKey('Resources in Our Environment')
);
assert('different strands stay different', c.strandKey('Numbers') !== c.strandKey('Geometry'), 'distinct');

section('Religious education defaults to CRE and does not invent the alternatives');
check(
    'the alternatives are offered',
    c.LEARNING_AREA_BY_ID['religious-education'].alternatives.map((a) => a.id),
    ['ire', 'hre']
);
assert('CRE has content', c.alternativeHasContent('cre'), 'yes');
// The important one: a school configured for IRE must be told there is no
// design here, not handed Christian strands under an Islamic heading.
assert('IRE does not', !c.alternativeHasContent('ire'), 'no syllabus encoded');
assert('HRE does not', !c.alternativeHasContent('hre'), 'no syllabus encoded');

section('Term coverage divides the year and loses nothing');
for (const grade of [1, 2, 3]) {
    for (const area of c.learningAreasForGrade(grade)) {
        const plan = c.termPlan(grade, area.id);
        const planned = plan.flatMap((entry) => entry.topics);
        const all = c.topicsFor(grade, area.id);

        if (JSON.stringify(planned) !== JSON.stringify(all)) {
            checks++;
            failures++;
            console.log(`  FAIL grade ${grade} ${area.id}: term plan does not cover the year`);
        }
        const terms = [...new Set(plan.map((e) => e.term))];
        if (terms.some((t) => t < 1 || t > 3)) {
            checks++;
            failures++;
            console.log(`  FAIL grade ${grade} ${area.id}: term outside 1–3`);
        }
    }
}
assert('every area in every grade is fully covered, in order', true, '21 area-grades');

check('a term keeps its strands in blocks', c.termPlan(1, 'mathematics')[0].strand, 'Numbers');
check(
    'and a whole grade-term can be listed',
    c.termSyllabus(1, 1).length,
    7
);

section('The seven core competencies are named, not improvised');
check('all seven', c.CORE_COMPETENCIES.length, 7);
assert('digital literacy is one of them', c.CORE_COMPETENCIES.includes('Digital literacy'), 'present');

section('The shop’s lower primary shelf agrees with the curriculum');
{
    const shelf = subjectsForLevel('lower-primary').map((s) => s.name);
    for (const area of c.LEARNING_AREAS) {
        assert(`“${area.name}” is on the shelf`, shelf.includes(area.name), 'listed');
    }
    // Kenyan Sign Language is a school configuration rather than one of the
    // seven, so it is on the shelf and not in the curriculum. That is correct.
    assert('Kenyan Sign Language is offered too', shelf.includes('Kenyan Sign Language'), 'configurable');
    assert(
        'Hygiene and Nutrition is no longer a learning area',
        !shelf.includes('Hygiene and Nutrition'),
        'folded into Environmental Activities'
    );
    // But papers already filed under the old names must stay findable.
    const env = subjectsForLevel('lower-primary').find((s) => s.name === 'Environmental Activities');
    assert('and survives as an alias', env.aliases.includes('Hygiene and Nutrition'), 'still matches');
    const maths = subjectsForLevel('lower-primary').find((s) => s.name === 'Mathematics Activities');
    assert('old "Mathematics" rows still match', maths.aliases.includes('Mathematics'), 'aliased');
}

// ---------------------------------------------------------------------------

console.log(`\n${failures === 0 ? 'All' : `${checks - failures}/${checks}`} curriculum checks passed.`);
if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
}
