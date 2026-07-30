/**
 * CATALOG DOMAIN MODEL
 * ----------------------------------------------------------------------------
 * Single source of truth for how papers and questions are organised across the
 * platform: education levels (CBE first, legacy 8-4-4 kept for old stock),
 * every exam type we sell, terms, years and money formatting.
 *
 * Both surfaces of the product read from here:
 *   1. /            the paper shop (browse + buy)
 *   2. /set         the exam setter (build your own paper)
 */

// ============================================================================
// LEVELS
// ============================================================================

export type LevelSlug =
    | 'pp'
    | 'lower-primary'
    | 'upper-primary'
    | 'junior-school'
    | 'senior-school'
    | 'form-1-4';

export interface LevelDef {
    slug: LevelSlug;
    name: string;
    short: string;
    /** Grades/forms that belong to this level, in display order. */
    grades: string[];
    /** Maps onto `grades.level` in the database where one exists. */
    dbLevel?: 'pre_primary' | 'primary' | 'junior' | 'senior';
    /** Maps onto `grades.band` in the database where one exists. */
    dbBand?: 'lower_primary' | 'upper_primary';
    curriculum: 'CBE' | '8-4-4';
    blurb: string;
}

/**
 * CBE (Competency Based Education) is the default. The old 8-4-4 Form 1-4
 * stock stays browsable because schools still sit those papers as mocks.
 */
export const LEVELS: LevelDef[] = [
    {
        slug: 'pp',
        name: 'Pre-Primary',
        short: 'PP1-PP2',
        grades: ['PP1', 'PP2'],
        dbLevel: 'pre_primary',
        curriculum: 'CBE',
        blurb: 'Playgroup, PP1 and PP2 assessment activities',
    },
    {
        slug: 'lower-primary',
        name: 'Lower Primary',
        short: 'Grade 1-3',
        grades: ['Grade 1', 'Grade 2', 'Grade 3'],
        dbLevel: 'primary',
        dbBand: 'lower_primary',
        curriculum: 'CBE',
        blurb: 'Grade 1-3 learning area assessments',
    },
    {
        slug: 'upper-primary',
        name: 'Upper Primary',
        short: 'Grade 4-6',
        grades: ['Grade 4', 'Grade 5', 'Grade 6'],
        dbLevel: 'primary',
        dbBand: 'upper_primary',
        curriculum: 'CBE',
        blurb: 'Grade 4-6 exams and KPSEA-style assessments',
    },
    {
        slug: 'junior-school',
        name: 'Junior School',
        short: 'Grade 7-9',
        grades: ['Grade 7', 'Grade 8', 'Grade 9'],
        dbLevel: 'junior',
        curriculum: 'CBE',
        blurb: 'Grade 7-9 exams, KJSEA revision and rationalised learning areas',
    },
    {
        slug: 'senior-school',
        name: 'Senior School',
        short: 'Grade 10-12',
        grades: ['Grade 10', 'Grade 11', 'Grade 12'],
        dbLevel: 'senior',
        curriculum: 'CBE',
        blurb: 'Grade 10-12 pathway papers: STEM, Social Sciences, Arts & Sports',
    },
    {
        slug: 'form-1-4',
        name: 'Form 1-4 (8-4-4)',
        short: 'Form 1-4',
        grades: ['Form 1', 'Form 2', 'Form 3', 'Form 4'],
        curriculum: '8-4-4',
        blurb: 'Legacy KCSE stock: past papers, county mocks and marking schemes',
    },
];

export const LEVEL_BY_SLUG: Record<string, LevelDef> = Object.fromEntries(
    LEVELS.map((l) => [l.slug, l])
);

/** Every grade/form label the catalog knows about, in order. */
export const ALL_GRADES: string[] = LEVELS.flatMap((l) => l.grades);

export function levelForGrade(grade?: string | null): LevelDef | undefined {
    if (!grade) return undefined;
    return LEVELS.find((l) => l.grades.some((g) => g.toLowerCase() === grade.toLowerCase()));
}

// ============================================================================
// EXAM TYPES
// ============================================================================

export type ExamTypeSlug =
    | 'opener'
    | 'mid-term'
    | 'end-term'
    | 'cat'
    | 'topical'
    | 'formative'
    | 'summative'
    | 'sba'
    | 'project'
    | 'practical'
    | 'oral'
    | 'mock'
    | 'county-mock'
    | 'joint-mock'
    | 'pre-mock'
    | 'trial'
    | 'past-paper'
    | 'kpsea'
    | 'kjsea'
    | 'kcse'
    | 'holiday'
    | 'entrance'
    | 'revision-booklet'
    | 'marking-scheme';

export interface ExamTypeDef {
    slug: ExamTypeSlug;
    name: string;
    /** Grouping used by the shop filter rail. */
    group: 'School terms' | 'Continuous assessment' | 'Mocks & trials' | 'National' | 'Extras';
    /** Levels this type is normally offered for. Empty = all levels. */
    levels?: LevelSlug[];
    description: string;
}

/**
 * Every exam type on the platform. Adding a new one here immediately makes it
 * filterable in the shop, selectable in the setter and valid on upload —
 * nothing else needs to change.
 */
export const EXAM_TYPES: ExamTypeDef[] = [
    // School terms
    { slug: 'opener', name: 'Opener Exam', group: 'School terms', description: 'Start-of-term assessment' },
    { slug: 'mid-term', name: 'Mid Term Exam', group: 'School terms', description: 'Mid-term assessment' },
    { slug: 'end-term', name: 'End of Term Exam', group: 'School terms', description: 'End-of-term summative paper' },
    { slug: 'holiday', name: 'Holiday Assignment', group: 'School terms', description: 'Holiday revision work' },

    // Continuous assessment
    { slug: 'cat', name: 'CAT / Class Test', group: 'Continuous assessment', description: 'Short continuous assessment test' },
    { slug: 'topical', name: 'Topical Test', group: 'Continuous assessment', description: 'Single strand or topic drill' },
    { slug: 'formative', name: 'Formative Assessment', group: 'Continuous assessment', description: 'CBE formative assessment task' },
    { slug: 'summative', name: 'Summative Assessment', group: 'Continuous assessment', description: 'CBE summative assessment' },
    { slug: 'sba', name: 'School Based Assessment (SBA)', group: 'Continuous assessment', description: 'CBE school based assessment' },
    { slug: 'project', name: 'Project / Inquiry Task', group: 'Continuous assessment', description: 'Competency project or inquiry task' },
    { slug: 'practical', name: 'Practical Paper', group: 'Continuous assessment', description: 'Laboratory or workshop practical' },
    { slug: 'oral', name: 'Oral / Aural Paper', group: 'Continuous assessment', description: 'Spoken or listening assessment' },

    // Mocks & trials
    { slug: 'mock', name: 'Mock Exam', group: 'Mocks & trials', description: 'Full mock paper' },
    { slug: 'county-mock', name: 'County Mock', group: 'Mocks & trials', description: 'County-wide joint mock' },
    { slug: 'joint-mock', name: 'Joint / Cluster Mock', group: 'Mocks & trials', description: 'Cluster or consortium joint exam' },
    { slug: 'pre-mock', name: 'Pre-Mock', group: 'Mocks & trials', description: 'Warm-up mock paper' },
    { slug: 'trial', name: 'Trial Exam', group: 'Mocks & trials', description: 'Final trial before the national exam' },

    // National
    { slug: 'past-paper', name: 'Past Paper', group: 'National', description: 'Released national past paper' },
    {
        slug: 'kpsea',
        name: 'KPSEA',
        group: 'National',
        levels: ['upper-primary'],
        description: 'Kenya Primary School Education Assessment',
    },
    {
        slug: 'kjsea',
        name: 'KJSEA',
        group: 'National',
        levels: ['junior-school'],
        description: 'Kenya Junior School Education Assessment',
    },
    {
        slug: 'kcse',
        name: 'KCSE',
        group: 'National',
        levels: ['form-1-4', 'senior-school'],
        description: 'Kenya Certificate of Secondary Education',
    },
    { slug: 'entrance', name: 'Entrance / Placement', group: 'National', description: 'Admission or placement test' },

    // Extras
    { slug: 'revision-booklet', name: 'Revision Booklet', group: 'Extras', description: 'Compiled revision questions' },
    { slug: 'marking-scheme', name: 'Marking Scheme Only', group: 'Extras', description: 'Standalone answers and marking guide' },
];

export const EXAM_TYPE_BY_SLUG: Record<string, ExamTypeDef> = Object.fromEntries(
    EXAM_TYPES.map((t) => [t.slug, t])
);

export const EXAM_TYPE_GROUPS = [
    'School terms',
    'Continuous assessment',
    'Mocks & trials',
    'National',
    'Extras',
] as const;

export function examTypesForLevel(level?: LevelSlug | null): ExamTypeDef[] {
    if (!level) return EXAM_TYPES;
    return EXAM_TYPES.filter((t) => !t.levels || t.levels.includes(level));
}

export function examTypeName(slug?: string | null): string {
    if (!slug) return 'Exam';
    return EXAM_TYPE_BY_SLUG[slug]?.name ?? slug;
}

// ============================================================================
// TERMS & YEARS
// ============================================================================

export const TERMS = [
    { slug: 'term-1', name: 'Term 1' },
    { slug: 'term-2', name: 'Term 2' },
    { slug: 'term-3', name: 'Term 3' },
] as const;

export type TermSlug = (typeof TERMS)[number]['slug'];

/** Newest first, back to 2015 — enough history for past-paper stock. */
export function catalogYears(from = 2015): number[] {
    const current = new Date().getFullYear();
    const years: number[] = [];
    for (let y = current; y >= from; y--) years.push(y);
    return years;
}

// ============================================================================
// MONEY
// ============================================================================

export const CURRENCY = 'KES';

/** Prices are stored in cents so no floating point ever touches money. */
export function formatPrice(cents: number, currency = CURRENCY): string {
    if (!cents) return 'Free';
    const amount = cents / 100;
    const shown = Number.isInteger(amount) ? amount.toString() : amount.toFixed(2);
    return `${currency} ${shown.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

export function sumCents(items: { price_cents: number }[]): number {
    return items.reduce((total, item) => total + (item.price_cents || 0), 0);
}

/** Bundle discount: the more papers in one order, the bigger the cut. */
export const BUNDLE_TIERS = [
    { minItems: 10, percentOff: 20 },
    { minItems: 5, percentOff: 12 },
    { minItems: 3, percentOff: 6 },
];

export function bundleDiscount(itemCount: number, subtotalCents: number): { percentOff: number; amountCents: number } {
    const tier = BUNDLE_TIERS.find((t) => itemCount >= t.minItems);
    if (!tier) return { percentOff: 0, amountCents: 0 };
    return {
        percentOff: tier.percentOff,
        amountCents: Math.round((subtotalCents * tier.percentOff) / 100),
    };
}
