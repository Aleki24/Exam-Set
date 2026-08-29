/**
 * Verification harness for reading a typed search as filters.
 *
 *   node scripts/verify-catalog-search.mjs
 *
 * The shop's search box used to do one thing with "form 4 mathematics term 3":
 * `title ILIKE '%form 4 mathematics term 3%'`. No title is written that way, so
 * the most natural thing anybody can type returned nothing while the papers sat
 * one shelf away. It now becomes the filters it describes.
 *
 * Two things about that are worth pinning down, because both fail silently and
 * both are worse than the empty grid they replaced:
 *
 *   - Precedence. A filter somebody ticked deliberately must survive a sentence
 *     that says otherwise. Quietly jumping from the Grade 9 they clicked to the
 *     Form 4 they typed answers a question nobody asked.
 *   - Leftovers. The recognised words become filters and must stop being search
 *     text, or "mathematics" filters to Mathematics and then demands the title
 *     spell it out too — a stricter search than either half.
 *
 * And the relaxation ladder, which is allowed to widen a *guess* and never a
 * click.
 */

import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
    alias: { '@': new URL('../src', import.meta.url).pathname },
    interopDefault: true,
});

const { readSearch, relaxFilters } = await jiti.import('../src/services/paperSearch.ts');

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
    checks++;
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    const ok = a === e;
    if (!ok) failures++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(46)} ${ok ? a : `got ${a}, expected ${e}`}`);
}

function section(title) {
    console.log(`\n${title}`);
}

/** What the shop actually stocks, near enough. */
const SUBJECTS = ['Mathematics', 'English', 'Kiswahili', 'Biology', 'Agriculture'];
const SETS = [{ id: 'set-1', name: 'Kabras Mock End Term 2 2025', institution: 'Kabras High School' }];

const read = (search, rest = {}) => readSearch({ search, ...rest }, SUBJECTS, SETS);

// ---------------------------------------------------------------------------
section('A sentence becomes the filters it describes');

{
    const { filters, understood } = read('form 4 mathematics term 3');
    check('grade', filters.grade, 'Form 4');
    check('subject', filters.subject, 'Mathematics');
    check('term', filters.term, 'term-3');
    check('the words stop being search text', filters.search, undefined);
    check('and the reading is reported', understood.label, 'Form 4 · Mathematics · Term 3');
}

{
    // The filler the parser drops is the reason the old search found nothing.
    const { filters } = read('i want grade 9 biology papers please');
    check('filler is not searched for', filters.search, undefined);
    check('grade survives the filler', filters.grade, 'Grade 9');
    check('subject survives the filler', filters.subject, 'Biology');
}

// ---------------------------------------------------------------------------
section('What is left over is still searched');

{
    const { filters, understood } = read('mathematics algebra');
    check('the subject filters', filters.subject, 'Mathematics');
    check('the topic is searched', filters.search, 'algebra');
    check('and is shown as searched text', understood.text, 'algebra');
}

// ---------------------------------------------------------------------------
section('A deliberate choice beats a typed guess');

{
    // Ticked Grade 9 in the rail, then typed Form 4. The click wins.
    const { filters, understood } = read('form 4 mathematics', { grade: 'Grade 9' });
    check('the ticked grade survives', filters.grade, 'Grade 9');
    check('the typed grade is not adopted', understood.applied.some((a) => a.key === 'grade'), false);
    check('the subject still is', filters.subject, 'Mathematics');
    check('and the label says only what was taken', understood.label, 'Mathematics');
}

{
    // An explicit term must not be silently widened by the ladder either.
    const relaxed = relaxFilters({ grade: 'Form 4', term: 'term-3' }, ['grade']);
    check('a ticked term is never dropped', relaxed, null);
}

// ---------------------------------------------------------------------------
section('Nothing recognised means nothing changes');

{
    const before = { search: 'photosynthesis diagram' };
    const { filters, understood } = readSearch(before, SUBJECTS, SETS);
    check('the search is left alone', filters.search, 'photosynthesis diagram');
    check('and nothing is claimed', understood, null);
}

{
    const { understood } = readSearch({ search: '   ' }, SUBJECTS, SETS);
    check('whitespace is not a query', understood, null);
}

// ---------------------------------------------------------------------------
section('A school named out loud is a school, not four filters');

{
    const { filters, understood } = read('kabras form 4 maths');
    check('the sitting is matched', filters.setIds, ['set-1']);
    check('the grade still parses', filters.grade, 'Form 4');
    check('the subject still parses', filters.subject, 'Mathematics');
    check('the school leads the label', understood.label.startsWith('Kabras'), true);
    // The set name contains "End Term 2 2025". Reading those as filters would
    // build a query nobody asked for out of a label.
    check('the name does not become a term', filters.term, undefined);
    check('the name does not become a year', filters.year, undefined);
}

{
    const relaxed = relaxFilters({ setIds: ['set-1'], year: 2025 }, ['setIds', 'year']);
    check('year goes before the school', relaxed.dropped, 'year');
    check('and the school stays', relaxed.filters.setIds, ['set-1']);
}

// ---------------------------------------------------------------------------
section('The ladder gives up the least useful guess first');

{
    const guessed = ['grade', 'subject', 'examType', 'term', 'year'];
    let filters = { grade: 'Form 4', subject: 'Mathematics', examType: 'end-term', term: 'term-3', year: 2025 };
    const dropped = [];

    for (let step = 0; step < 5; step++) {
        const next = relaxFilters(filters, guessed);
        if (!next) break;
        filters = next.filters;
        dropped.push(next.dropped);
    }

    check('year, then term, then exam type', dropped, ['year', 'term', 'exam type']);
    check('grade is never given up', filters.grade, 'Form 4');
    check('nor is the subject', filters.subject, 'Mathematics');
}

// ---------------------------------------------------------------------------
console.log(
    failures === 0
        ? `\nAll ${checks} catalog-search checks passed.`
        : `\n${failures} of ${checks} catalog-search checks FAILED.`
);
process.exit(failures === 0 ? 0 : 1);
