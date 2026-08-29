/**
 * RESOURCE KINDS
 * ----------------------------------------------------------------------------
 * What a thing *is*, as distinct from which sitting it belongs to.
 *
 * `exam_type` in `catalog.ts` answers "which sitting?" — opener, mid-term,
 * county mock, KCSE. This answers "what is it?" — a paper, a scheme of work, a
 * set-book guide, a syllabus.
 *
 * Keeping them apart is the whole point. A Grade 9 end-of-term exam is
 * `kind = 'termly-exam'` and `exam_type = 'end-term'`. A Grade 9 scheme of work
 * is `kind = 'scheme-of-work'` and has no exam type at all, because it is not
 * sat. One field could never carry both without lying about one of them, and
 * the lie surfaces the moment somebody filters for "schemes of work" and gets
 * back exam papers.
 *
 * Adding a kind here makes it browsable, filterable and sellable immediately.
 * Nothing else needs to change: a resource is an `exams` row carrying this
 * value, so it inherits the cart, the entitlement check, the signed download
 * and the row level security that already guard every paper.
 */

import type { LevelSlug } from './catalog';

/**
 * Every level from Lower Primary up — i.e. everywhere a learner revises.
 *
 * Playgroup and Pre-Primary are excluded on purpose. They are assessed through
 * activities, not examined, and a four-year-old does not sit topical drills or
 * work through revision notes. Offering those categories there would put a
 * heading on a shelf that can never be stocked, which is the one thing this
 * hierarchy exists to avoid.
 */
const REVISING_LEVELS: LevelSlug[] = [
    'lower-primary',
    'upper-primary',
    'junior-school',
    'senior-school',
    'form-1-4',
];

// ============================================================================
// KINDS
// ============================================================================

export type ResourceKind =
    // Sit & revise
    | 'past-paper'
    | 'marking-scheme'
    | 'termly-exam'
    | 'mock'
    | 'prediction'
    | 'topical'
    | 'revision-booklet'
    | 'holiday-assignment'
    // Study & understand
    | 'notes'
    | 'setbook-guide'
    // Teach & plan
    | 'scheme-of-work'
    | 'lesson-plan'
    | 'record-of-work'
    | 'curriculum-design'
    | 'assessment-tools'
    // Reference
    | 'syllabus';

/**
 * The four families. This is the grouping every browse surface renders, and it
 * exists so a learner and a teacher can share one library without either
 * wading through the other's material.
 */
export type ResourceFamily = 'Sit & revise' | 'Study & understand' | 'Teach & plan' | 'Reference';

export const RESOURCE_FAMILIES: ResourceFamily[] = [
    'Sit & revise',
    'Study & understand',
    'Teach & plan',
    'Reference',
];

/** Who each family is built for. Rendered as the family's one-line subtitle. */
export const FAMILY_AUDIENCE: Record<ResourceFamily, string> = {
    'Sit & revise': 'For learners sitting papers',
    'Study & understand': 'For learners studying a topic',
    'Teach & plan': 'For teachers preparing to teach',
    Reference: 'For everyone',
};

export interface ResourceKindDef {
    slug: ResourceKind;
    /** Singular, as it appears on a card. */
    name: string;
    /** Plural, as it appears as a section heading. */
    plural: string;
    family: ResourceFamily;
    /**
     * Levels this kind is offered for. Omitted means every level.
     *
     * This is not decoration — it is what stops `/learn/pp` offering a
     * Playgroup teacher a set-book guide, which would be a dead category on a
     * page whose whole job is to only show what exists.
     */
    levels?: LevelSlug[];
    /** One line, written for the person choosing. Never restates the name. */
    description: string;
    /**
     * True when the kind is a document rather than something that can be sat.
     * Decides whether the detail page offers "Start exam" or only a download.
     */
    document: boolean;
}

export const RESOURCE_KINDS: ResourceKindDef[] = [
    // ---------------------------------------------------------------- Sit & revise
    {
        slug: 'past-paper',
        name: 'Past paper',
        plural: 'Past papers',
        family: 'Sit & revise',
        description: 'Real papers sat in previous years, with the marking scheme',
        document: false,
    },
    {
        slug: 'termly-exam',
        name: 'Termly exam',
        plural: 'Termly exams',
        family: 'Sit & revise',
        description: 'Opener, mid-term and end-of-term papers for every term',
        document: false,
    },
    {
        slug: 'mock',
        name: 'Mock',
        plural: 'Mocks',
        family: 'Sit & revise',
        levels: ['upper-primary', 'junior-school', 'senior-school', 'form-1-4'],
        description: 'County, joint and school mocks set to national standard',
        document: false,
    },
    {
        slug: 'prediction',
        name: 'Prediction set',
        plural: 'Prediction sets',
        family: 'Sit & revise',
        levels: ['upper-primary', 'junior-school', 'senior-school', 'form-1-4'],
        description: 'Likely questions for this year, compiled from recent trends',
        document: false,
    },
    {
        slug: 'topical',
        name: 'Topical questions',
        plural: 'Topical questions',
        family: 'Sit & revise',
        levels: REVISING_LEVELS,
        description: 'Every question ever asked on one strand, with answers',
        document: false,
    },
    {
        slug: 'revision-booklet',
        name: 'Revision booklet',
        plural: 'Revision booklets',
        family: 'Sit & revise',
        levels: REVISING_LEVELS,
        description: 'A term of revision compiled into one printable booklet',
        document: false,
    },
    {
        slug: 'holiday-assignment',
        name: 'Holiday assignment',
        plural: 'Holiday assignments',
        family: 'Sit & revise',
        description: 'Work to keep a class busy between terms',
        document: false,
    },
    {
        slug: 'marking-scheme',
        name: 'Marking scheme',
        plural: 'Marking schemes',
        family: 'Sit & revise',
        description: 'Answers and mark allocation on their own',
        document: true,
    },

    // ---------------------------------------------------------- Study & understand
    {
        slug: 'notes',
        name: 'Revision notes',
        plural: 'Revision notes',
        family: 'Study & understand',
        levels: REVISING_LEVELS,
        description: 'The whole syllabus written out, strand by strand',
        document: true,
    },
    {
        slug: 'setbook-guide',
        name: 'Set-book guide',
        plural: 'Set-book guides',
        family: 'Study & understand',
        levels: ['junior-school', 'senior-school', 'form-1-4'],
        description: 'Chapter summaries, themes, characters and essay questions',
        document: true,
    },

    // ----------------------------------------------------------------- Teach & plan
    {
        slug: 'scheme-of-work',
        name: 'Scheme of work',
        plural: 'Schemes of work',
        family: 'Teach & plan',
        description: 'A term planned week by week, ready to fill in',
        document: true,
    },
    {
        slug: 'lesson-plan',
        name: 'Lesson plan',
        plural: 'Lesson plans',
        family: 'Teach & plan',
        description: 'Single lessons with objectives, activities and resources',
        document: true,
    },
    {
        slug: 'record-of-work',
        name: 'Record of work',
        plural: 'Records of work',
        family: 'Teach & plan',
        description: 'Termly record templates covering what was actually taught',
        document: true,
    },
    {
        slug: 'curriculum-design',
        name: 'Curriculum design',
        plural: 'Curriculum designs',
        family: 'Teach & plan',
        levels: ['pg', 'pp', 'lower-primary', 'upper-primary', 'junior-school', 'senior-school'],
        description: 'The official KICD design for the learning area',
        document: true,
    },
    {
        slug: 'assessment-tools',
        name: 'Assessment tools',
        plural: 'Assessment tools',
        family: 'Teach & plan',
        levels: ['pg', 'pp', 'lower-primary', 'upper-primary', 'junior-school', 'senior-school'],
        description: 'Rubrics and score sheets for competency assessment',
        document: true,
    },

    // -------------------------------------------------------------------- Reference
    {
        slug: 'syllabus',
        name: 'Syllabus',
        plural: 'Syllabus documents',
        family: 'Reference',
        description: 'What must be covered, in full, straight from the source',
        document: true,
    },
];

export const RESOURCE_KIND_BY_SLUG: Record<string, ResourceKindDef> = Object.fromEntries(
    RESOURCE_KINDS.map((k) => [k.slug, k])
);

export function resourceKindName(slug?: string | null): string {
    if (!slug) return 'Resource';
    return RESOURCE_KIND_BY_SLUG[slug]?.name ?? slug;
}

/** Every kind offered at a level, in taxonomy order. */
/**
 * Whether this kind is something a candidate sits, rather than a document a
 * teacher works from.
 *
 * The distinction already existed on `ResourceKindDef.document`; this is it
 * asked from a listing, where all anyone has is the slug. It exists because a
 * scheme of work was being described in exam language — "EXAM" over its title,
 * "the full question paper" — which was harmless while the shop sold only
 * papers and is wrong now that Word documents are the point.
 *
 * Unknown kinds are treated as sittable, matching the column default.
 */
export function isSittable(slug?: string | null): boolean {
    const kind = RESOURCE_KIND_BY_SLUG[String(slug ?? '')];
    return kind ? !kind.document : true;
}

export function kindsForLevel(level?: LevelSlug | null): ResourceKindDef[] {
    if (!level) return RESOURCE_KINDS;
    return RESOURCE_KINDS.filter((k) => !k.levels || k.levels.includes(level));
}

/**
 * Kinds for a level, grouped into families, with empty families dropped.
 *
 * The drop matters: at Playgroup there are no set-book guides, and a
 * "Study & understand" heading over nothing reads as a broken page rather than
 * an honest absence.
 */
export function kindFamiliesForLevel(
    level?: LevelSlug | null
): { family: ResourceFamily; audience: string; kinds: ResourceKindDef[] }[] {
    const available = kindsForLevel(level);
    return RESOURCE_FAMILIES.map((family) => ({
        family,
        audience: FAMILY_AUDIENCE[family],
        kinds: available.filter((k) => k.family === family),
    })).filter((group) => group.kinds.length > 0);
}

// ============================================================================
// SUBJECTS
// ============================================================================

/**
 * Learning areas by level, following the CBE rationalisation rather than the
 * subject list a school used ten years ago.
 *
 * Held here as data rather than read from `subjects` in the database on
 * purpose. The browse hierarchy has to render a subject list before it knows
 * whether any stock exists behind it — that is the point of a hierarchy, it
 * shows the shape of the curriculum, not the shape of the current inventory.
 * A subject with nothing behind it says "nothing here yet", which is useful.
 * A subject list assembled from stock would silently hide half the curriculum
 * and give no clue that it had.
 */
export interface SubjectDef {
    /** URL segment. Stable — it is in every link. */
    slug: string;
    /** As printed on a timetable. */
    name: string;
    /** Matches against `exams.subject`, which is free text on older rows. */
    aliases?: string[];
}

const S = (name: string, aliases?: string[]): SubjectDef => ({
    slug: name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''),
    name,
    aliases,
});

export const SUBJECTS_BY_LEVEL: Record<LevelSlug, SubjectDef[]> = {
    pg: [
        S('Language Activities'),
        S('Mathematical Activities'),
        S('Environmental Activities'),
        S('Psychomotor and Creative Activities'),
        S('Religious Education Activities'),
    ],
    pp: [
        S('Language Activities'),
        S('Mathematical Activities'),
        S('Environmental Activities'),
        S('Psychomotor and Creative Activities'),
        S('Religious Education Activities'),
    ],
    /*
     * The seven official lower primary learning areas, named as the KICD design
     * names them — see `lib/curriculum`, which is where their strands and topics
     * live and which every generated document reads from.
     *
     * The old names are kept as aliases rather than dropped. `exams.subject` is
     * free text on rows going back to the start, so a paper filed under
     * "Mathematics" or "Creative Activities" is the same shelf to a browsing
     * teacher and has to keep matching.
     *
     * "Hygiene and Nutrition" is gone as a learning area. It is not one at this
     * level — hygiene is taught inside Environmental Activities and the language
     * areas — so it stays only as an alias, which keeps existing papers findable
     * without offering a subject the curriculum does not have.
     */
    'lower-primary': [
        S('Mathematics Activities', ['Mathematics', 'Mathematical Activities', 'Maths']),
        S('English Language Activities', ['English', 'English Activities']),
        S('Shughuli za Kiswahili', ['Kiswahili', 'Kiswahili Language Activities', 'Shughuli za Kiswahili']),
        S('Indigenous Language Activities', ['Indigenous Language', 'Mother Tongue']),
        S('Environmental Activities', ['Environmental', 'Hygiene and Nutrition']),
        S('Christian Religious Education (CRE) Activities', [
            'Religious Education',
            'CRE',
            'Christian Religious Education',
        ]),
        S('Creative Arts Activities', ['Creative Activities', 'Creative Arts', 'Art and Craft', 'Music']),
        S('Kenyan Sign Language', ['KSL']),
    ],
    'upper-primary': [
        S('English'),
        S('Kiswahili'),
        S('Mathematics'),
        S('Science and Technology'),
        S('Social Studies'),
        S('Agriculture and Nutrition', ['Agriculture', 'Home Science']),
        S('Creative Arts'),
        S('Religious Education', ['CRE', 'IRE', 'HRE']),
        S('Kenyan Sign Language'),
    ],
    'junior-school': [
        S('English'),
        S('Kiswahili'),
        S('Mathematics'),
        S('Integrated Science'),
        S('Social Studies'),
        S('Pre-Technical Studies'),
        S('Agriculture and Nutrition'),
        S('Creative Arts and Sports', ['Creative Arts', 'Sports and Physical Education']),
        S('Religious Education', ['CRE', 'IRE', 'HRE']),
        S('Life Skills Education'),
    ],
    'senior-school': [
        S('English'),
        S('Kiswahili'),
        S('Mathematics'),
        S('Biology'),
        S('Chemistry'),
        S('Physics'),
        S('Geography'),
        S('History and Citizenship', ['History']),
        S('Business Studies'),
        S('Agriculture'),
        S('Computer Studies'),
        S('Religious Education', ['CRE', 'IRE', 'HRE']),
        S('Community Service Learning'),
    ],
    'form-1-4': [
        S('English'),
        S('Kiswahili'),
        S('Mathematics'),
        S('Biology'),
        S('Chemistry'),
        S('Physics'),
        S('Geography'),
        S('History and Government', ['History']),
        S('Business Studies'),
        S('Agriculture'),
        S('Computer Studies'),
        S('Religious Education', ['CRE', 'IRE', 'HRE']),
        S('Home Science'),
    ],
};

export function subjectsForLevel(level?: LevelSlug | null): SubjectDef[] {
    if (!level) return [];
    return SUBJECTS_BY_LEVEL[level] ?? [];
}

export function subjectBySlug(level: LevelSlug, slug: string): SubjectDef | undefined {
    return subjectsForLevel(level).find((s) => s.slug === slug);
}

/**
 * Every name a subject might be stored under, for matching `exams.subject`.
 *
 * Older rows were typed by hand, so "History" and "History and Government" are
 * the same shelf as far as a browsing teacher is concerned.
 */
export function subjectQueryNames(subject: SubjectDef): string[] {
    return [subject.name, ...(subject.aliases ?? [])];
}
