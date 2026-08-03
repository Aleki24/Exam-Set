/**
 * THE LOWER PRIMARY CURRICULUM (GRADES 1–3)
 * ----------------------------------------------------------------------------
 * The KICD competency-based design for lower primary, as data. Everything that
 * generates a scheme of work, a lesson plan, an assessment, a report-card
 * descriptor, a marksheet or a progress tracker for Grades 1, 2 and 3 reads
 * from here and from nowhere else.
 *
 * WHY IT IS A CLOSED LIST
 *
 * A generator with no list to work from invents. It produces "Number Patterns"
 * for a Grade 1 class that has not met a pattern, or files a report comment
 * against a strand that does not exist in that grade, and neither is visible
 * until a parent reads it. So the list is exhaustive, `isKnownTopic` is the
 * gate, and anything not in here is not a topic — it is a mistake.
 *
 * WHAT THIS IS NOT
 *
 * It is not a term-by-term sequence. KICD publishes one; it is not encoded here
 * because it was not given, and a plausible-looking invented order is worse than
 * an obviously mechanical one — a teacher can correct a split they can see is
 * arbitrary, but not one that looks authoritative. `termPlan` divides the work
 * evenly and says so, and a school overrides it.
 *
 * THREE INCONSISTENCIES, PRESERVED ON PURPOSE
 *
 * The source names three strands differently in different grades:
 *
 *   Creative Arts   "Creating and Executing" (Grades 1–2) vs
 *                   "Creation and Executing" (Grade 3)
 *   Creative Arts   "Performing and Displaying" (Grade 1) vs
 *                   "Performance and Display" (Grades 2–3)
 *   Environmental   "Resources in the Environment" (Grade 1) vs
 *                   "Resources in Our Environment" (Grade 3)
 *
 * They are recorded exactly as given rather than quietly normalised, because
 * renaming a strand here silently re-files every score, comment and progress
 * record already attached to it. `strandKey` exists for the one place that
 * genuinely needs to follow a strand across grades — a three-year progress
 * tracker — and normalises for comparison only, never for display.
 */

// ============================================================================
// SHAPE
// ============================================================================

export type GradeNumber = 1 | 2 | 3;

export const LOWER_PRIMARY_GRADES: GradeNumber[] = [1, 2, 3];

export type LearningAreaId =
    | 'mathematics'
    | 'english'
    | 'kiswahili'
    | 'indigenous-language'
    | 'environmental'
    | 'religious-education'
    | 'creative-arts';

export interface Strand {
    /**
     * Null where the design has no strands and the topics are themes taught in
     * sequence — the three language areas. Modelled as an absence rather than
     * given an invented heading like "Themes", because a scheme of work that
     * prints a strand nobody set is the same failure as inventing a topic.
     */
    name: string | null;
    topics: string[];
}

export interface LearningArea {
    id: LearningAreaId;
    /** The official name. Printed as-is on every document. */
    name: string;
    /** Topics are themes in sequence rather than grouped under strands. */
    thematic?: boolean;
    /** The school may teach this in the language of its catchment area. */
    localisable?: boolean;
    /**
     * Names a school may configure in place of the default.
     *
     * Only CRE carries content here. IRE and HRE are offered because the
     * platform supports them, but their strands and topics are not in this file
     * and must not be guessed at — see `alternativeHasContent`.
     */
    alternatives?: { id: string; name: string }[];
    /** Strands and topics, per grade. */
    grades: Record<GradeNumber, Strand[]>;
}

// ============================================================================
// THE CURRICULUM
// ============================================================================

const MATHEMATICS: LearningArea = {
    id: 'mathematics',
    name: 'Mathematics Activities',
    grades: {
        1: [
            { name: 'Numbers', topics: ['Pre-number activities', 'Whole numbers', 'Addition', 'Subtraction'] },
            { name: 'Measurement', topics: ['Length', 'Mass', 'Capacity', 'Time', 'Money'] },
            { name: 'Geometry', topics: ['Lines', 'Shapes'] },
        ],
        2: [
            {
                name: 'Numbers',
                topics: [
                    'Number concept',
                    'Whole numbers',
                    'Addition',
                    'Subtraction',
                    'Multiplication',
                    'Division',
                    'Fractions',
                ],
            },
            { name: 'Measurement', topics: ['Length', 'Mass', 'Capacity', 'Time', 'Money'] },
            { name: 'Geometry', topics: ['Lines', 'Shapes'] },
        ],
        3: [
            {
                name: 'Numbers',
                topics: [
                    'Number concept',
                    'Whole numbers',
                    'Addition',
                    'Subtraction',
                    'Multiplication',
                    'Division',
                    'Fractions',
                ],
            },
            { name: 'Measurement', topics: ['Length', 'Mass', 'Capacity', 'Time', 'Money'] },
            { name: 'Geometry', topics: ['Lines', 'Shapes'] },
        ],
    },
};

const ENGLISH: LearningArea = {
    id: 'english',
    name: 'English Language Activities',
    thematic: true,
    grades: {
        1: [
            {
                name: null,
                topics: [
                    'Welcome and Greetings',
                    'School',
                    'Family',
                    'Home',
                    'Time',
                    'Weather and Our Environment',
                    'Hygiene',
                    'Myself (Parts of the Body)',
                    'My Friends',
                    'Safety',
                    'Community Leaders',
                    'Living Together',
                    'Technology (Mobile Phone)',
                    'Conserving Resources',
                ],
            },
        ],
        2: [
            {
                name: null,
                topics: [
                    'School',
                    'Activities in the Home',
                    'Transport',
                    'Times and Months of the Year',
                    'Shopping',
                    'Garden',
                    'Accidents',
                    'Classroom',
                    'Positions and Directions',
                    'Environment',
                    'Technology',
                    'Cultural Activities',
                    'Child Labour',
                    'Caring for Others',
                ],
            },
        ],
        3: [
            {
                name: null,
                topics: [
                    'Activities at Home and School',
                    'Sharing Duties and Responsibilities',
                    'Etiquette',
                    'Child Rights',
                    'Occupation',
                    'Technology',
                    'Safety',
                    'Domestic Animals',
                    'Wild Animals',
                    'Festival',
                    'Play Time and Sports',
                    'Food We Eat and Diseases',
                    'Saving',
                    'Talents',
                    'Environment',
                ],
            },
        ],
    },
};

const KISWAHILI: LearningArea = {
    id: 'kiswahili',
    name: 'Shughuli za Kiswahili',
    thematic: true,
    grades: {
        1: [
            {
                name: null,
                topics: [
                    'Darasani',
                    'Familia',
                    'Tarakimu',
                    'Siku za Wiki',
                    'Mimi na Wenzangu',
                    'Mwili Wangu',
                    'Usafi wa Mwili',
                    'Vyakula Vyetu',
                    'Jikoni',
                    'Michezo',
                ],
            },
        ],
        2: [
            {
                name: null,
                topics: [
                    'Shuleni',
                    'Haki Zangu',
                    'Lishe Bora',
                    'Usafiri',
                    'Mnyama Nimpendaye',
                    'Ukoo',
                    'Sebuleni',
                    'Usalama Wangu',
                    'Hospitalini',
                    'Hali ya Anga',
                ],
            },
        ],
        3: [
            {
                name: null,
                topics: [
                    'Uzalendo',
                    'Shambani',
                    'Miezi ya Mwaka',
                    'Kazi Mbalimbali',
                    'Usalama',
                    'Usafi wa Mazingira',
                    'Dukani',
                    'Ndege Nimpendaye',
                    'Sokoni',
                    'Teknolojia',
                ],
            },
        ],
    },
};

/**
 * The Kiswahili themes in English, for a report comment a parent reads.
 *
 * Kept beside the curriculum rather than inside it: the topic is the Kiswahili
 * name and always prints as the Kiswahili name. This is a gloss, not a second
 * set of topics.
 */
export const KISWAHILI_GLOSS: Record<string, string> = {
    Darasani: 'In the classroom',
    Familia: 'Family',
    Tarakimu: 'Numbers',
    'Siku za Wiki': 'Days of the week',
    'Mimi na Wenzangu': 'Me and my peers',
    'Mwili Wangu': 'My body',
    'Usafi wa Mwili': 'Body hygiene',
    'Vyakula Vyetu': 'Our foods',
    Jikoni: 'In the kitchen',
    Michezo: 'Games and sports',
    Shuleni: 'At school',
    'Haki Zangu': 'My rights',
    'Lishe Bora': 'Good nutrition',
    Usafiri: 'Transport',
    'Mnyama Nimpendaye': 'My favourite animal',
    Ukoo: 'Extended family',
    Sebuleni: 'In the living room',
    'Usalama Wangu': 'My safety',
    Hospitalini: 'At the hospital',
    'Hali ya Anga': 'Weather conditions',
    Uzalendo: 'Patriotism',
    Shambani: 'On the farm',
    'Miezi ya Mwaka': 'Months of the year',
    'Kazi Mbalimbali': 'Various jobs',
    Usalama: 'Safety',
    'Usafi wa Mazingira': 'Environmental cleanliness',
    Dukani: 'At the shop',
    'Ndege Nimpendaye': 'My favourite bird',
    Sokoni: 'At the market',
    Teknolojia: 'Technology',
};

const INDIGENOUS: LearningArea = {
    id: 'indigenous-language',
    name: 'Indigenous Language Activities',
    thematic: true,
    localisable: true,
    grades: {
        1: [
            {
                name: null,
                topics: ['The Home', 'The School', 'Good Manners', 'Personal Hygiene', 'Time and Seasons'],
            },
        ],
        2: [
            {
                name: null,
                topics: [
                    'Things Found in School',
                    'Activities at School',
                    'Domestic Animals',
                    'Personal Hygiene',
                    'Safety at Home',
                ],
            },
        ],
        3: [
            {
                name: null,
                topics: [
                    'Introducing Self and Others',
                    'The Community',
                    'Wild Animals',
                    'Road Safety',
                    'Seasons of the Year',
                ],
            },
        ],
    },
};

const ENVIRONMENTAL: LearningArea = {
    id: 'environmental',
    name: 'Environmental Activities',
    grades: {
        1: [
            {
                name: 'Social Environment',
                topics: ['Cleaning the body', 'The home', 'Family needs', 'Our school', 'The market'],
            },
            { name: 'Natural Environment', topics: ['Weather', 'The sky', 'Soil', 'Sound'] },
            { name: 'Resources in the Environment', topics: ['Water', 'Plants', 'Animals'] },
        ],
        2: [
            {
                name: 'Social Environment',
                topics: ['Our home', 'Family needs and wants', 'Our school', 'National flag', 'The market'],
            },
            {
                name: 'Natural Environment',
                topics: ['Weather', 'Soil', 'Light', 'Water', 'Plants', 'Animals'],
            },
        ],
        3: [
            {
                name: 'Social Environment',
                topics: ['Living environment', 'Family needs', 'Foods', 'Community', 'Cultural events'],
            },
            { name: 'Natural Environment', topics: ['Weather', 'Soil', 'Heat'] },
            {
                name: 'Resources in Our Environment',
                topics: ['Water', 'Plants', 'Animals', 'Waste material'],
            },
        ],
    },
};

const RELIGIOUS: LearningArea = {
    id: 'religious-education',
    name: 'Christian Religious Education (CRE) Activities',
    alternatives: [
        { id: 'ire', name: 'Islamic Religious Education (IRE) Activities' },
        { id: 'hre', name: 'Hindu Religious Education (HRE) Activities' },
    ],
    grades: {
        1: [
            { name: 'Creation', topics: ['Self-awareness', 'Family', 'Plants', 'Animals'] },
            { name: 'The Holy Bible', topics: ['The Word of God', 'Bible stories'] },
            { name: 'The Early Life of Jesus Christ', topics: ['Early life of Jesus Christ'] },
            { name: 'Christian Values', topics: ['Sharing', 'Obedience', 'Honesty', 'Thankfulness'] },
            { name: 'The Church', topics: ['The Church'] },
        ],
        2: [
            { name: 'Creation', topics: ['Self-awareness', 'Family', 'The sky'] },
            { name: 'The Holy Bible', topics: ['Bible as a guide', 'Divisions of the Bible'] },
            { name: 'The Early Life of Jesus Christ', topics: ['Birth', 'Miracles', 'Easter'] },
            {
                name: 'Christian Values',
                topics: ['Sharing', 'Obedience', 'Honesty', 'Forgiveness', 'Work'],
            },
            { name: 'The Church', topics: ['The Church'] },
        ],
        3: [
            { name: 'Creation', topics: ['Self-awareness', 'Family', 'Adam and Eve'] },
            { name: 'The Holy Bible', topics: ['The Bible as the Word of God', 'Bible stories'] },
            { name: 'The Early Life of Jesus Christ', topics: ['Birth', 'Miracles', 'Easter'] },
            {
                name: 'Christian Values',
                topics: ['Honesty', 'Thankfulness', 'Forgiveness', 'Responsibility'],
            },
            { name: 'The Church', topics: ['The Church'] },
        ],
    },
};

const CREATIVE_ARTS: LearningArea = {
    id: 'creative-arts',
    name: 'Creative Arts Activities',
    grades: {
        1: [
            {
                name: 'Creating and Executing',
                topics: ['Jumping', 'Rhythm', 'Drawing', 'Painting', 'Patterns'],
            },
            {
                name: 'Performing and Displaying',
                topics: ['Singing games', 'Catching/throwing', 'Paper craft', 'Musical instruments'],
            },
            { name: 'Appreciation', topics: ['Musical sounds', 'Water safety'] },
        ],
        2: [
            {
                name: 'Creating and Executing',
                topics: ['Hopping', 'Drawing', 'Painting', 'Rhythm', 'Mosaic'],
            },
            {
                name: 'Performance and Display',
                topics: ['Melody', 'Singing games', 'Kicking', 'Ornament making', 'Flutes', 'Modelling'],
            },
        ],
        3: [
            {
                name: 'Creation and Executing',
                topics: ['Pushing/pulling', 'Drawing', 'Painting', 'Rhythm', 'Skipping'],
            },
            {
                name: 'Performance and Display',
                topics: ['Rounds', 'Weaving', 'Galloping', 'Sculpture', 'Modelling', 'Ornaments'],
            },
            { name: 'Appreciation', topics: ['Kenya National Anthem', 'Water safety'] },
        ],
    },
};

/** The seven learning areas, in the order a timetable lists them. */
export const LEARNING_AREAS: LearningArea[] = [
    MATHEMATICS,
    ENGLISH,
    KISWAHILI,
    INDIGENOUS,
    ENVIRONMENTAL,
    RELIGIOUS,
    CREATIVE_ARTS,
];

export const LEARNING_AREA_BY_ID: Record<string, LearningArea> = Object.fromEntries(
    LEARNING_AREAS.map((area) => [area.id, area])
);

// ============================================================================
// THE SEVEN CORE COMPETENCIES
// ============================================================================

/**
 * What a report comment is ultimately about. Named here so a generator picks
 * from a list rather than reaching for whatever adjective comes to hand.
 */
export const CORE_COMPETENCIES = [
    'Communication and collaboration',
    'Critical thinking and problem solving',
    'Creativity and imagination',
    'Citizenship',
    'Digital literacy',
    'Learning to learn',
    'Self-efficacy',
] as const;

export type CoreCompetency = (typeof CORE_COMPETENCIES)[number];

// ============================================================================
// LOOKUPS
// ============================================================================

export function isGradeNumber(value: unknown): value is GradeNumber {
    return value === 1 || value === 2 || value === 3;
}

/** Every learning area taught in a grade. All seven, in all three grades. */
export function learningAreasForGrade(grade: GradeNumber): LearningArea[] {
    return LEARNING_AREAS.filter((area) => area.grades[grade]?.length > 0);
}

/** The strands of one learning area in one grade. */
export function strandsFor(grade: GradeNumber, areaId: LearningAreaId): Strand[] {
    return LEARNING_AREA_BY_ID[areaId]?.grades[grade] ?? [];
}

/** Every topic of one learning area in one grade, in teaching order. */
export function topicsFor(grade: GradeNumber, areaId: LearningAreaId): string[] {
    return strandsFor(grade, areaId).flatMap((strand) => strand.topics);
}

/** The strand a topic belongs to, or null for a thematic area. Undefined if unknown. */
export function strandForTopic(
    grade: GradeNumber,
    areaId: LearningAreaId,
    topic: string
): string | null | undefined {
    const strand = strandsFor(grade, areaId).find((s) => s.topics.includes(topic));
    return strand ? strand.name : undefined;
}

/**
 * The gate. Anything this refuses is not a topic in that grade, whatever it
 * looks like — including a real topic borrowed from the wrong grade, which is
 * the mistake a generator makes most often.
 */
export function isKnownTopic(grade: GradeNumber, areaId: LearningAreaId, topic: string): boolean {
    return topicsFor(grade, areaId).includes(topic);
}

/** Every (area, strand, topic) in a grade — for a full scheme of work. */
export function syllabusForGrade(grade: GradeNumber): {
    area: LearningArea;
    strand: string | null;
    topic: string;
}[] {
    return learningAreasForGrade(grade).flatMap((area) =>
        area.grades[grade].flatMap((strand) =>
            strand.topics.map((topic) => ({ area, strand: strand.name, topic }))
        )
    );
}

/**
 * A strand name reduced to something comparable across grades.
 *
 * Only for following a strand through Grades 1–3 — a three-year progress
 * tracker asking "how has this learner done in Creative Arts performance?"
 * would otherwise see three separate strands. Never use it for display: the
 * name a document prints is the name the design gives that grade.
 */
export function strandKey(name: string | null): string | null {
    if (!name) return null;
    return name
        .toLowerCase()
        .replace(/\b(creating|creation)\b/g, 'creat')
        .replace(/\b(performing|performance)\b/g, 'perform')
        .replace(/\b(displaying|display)\b/g, 'display')
        .replace(/\b(the|our|and|in)\b/g, '')
        .replace(/[^a-z]+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Whether a configured alternative to CRE has a syllabus in this file.
 *
 * Only CRE does. Asked before generating anything for a school that has
 * configured IRE or HRE, so the answer is "we do not have that design yet"
 * rather than Christian strands under an Islamic heading.
 */
export function alternativeHasContent(alternativeId: string): boolean {
    return alternativeId === 'cre';
}

// ============================================================================
// TERMS
// ============================================================================

export type Term = 1 | 2 | 3;

export interface TermCoverage {
    term: Term;
    strand: string | null;
    topics: string[];
}

/**
 * Splits a learning area's year into three terms.
 *
 * An even division, and deliberately nothing cleverer. KICD publishes a real
 * term-by-term sequence; it is not in this file, and a generated order that
 * looked authoritative would be trusted in place of the one that is. Split
 * evenly, a teacher can see at a glance that the boundary is arbitrary and move
 * it. That is the honest failure mode.
 *
 * Topics are dealt strand by strand in order, so a term's work stays coherent
 * rather than sampling one topic from each corner of the year.
 */
export function termPlan(grade: GradeNumber, areaId: LearningAreaId): TermCoverage[] {
    const strands = strandsFor(grade, areaId);
    const flat = strands.flatMap((strand) =>
        strand.topics.map((topic) => ({ strand: strand.name, topic }))
    );
    if (flat.length === 0) return [];

    const perTerm = Math.ceil(flat.length / 3);
    const coverage: TermCoverage[] = [];

    for (const term of [1, 2, 3] as Term[]) {
        const slice = flat.slice((term - 1) * perTerm, term * perTerm);

        // Consecutive topics from the same strand travel together, so a term
        // reads as blocks of work rather than a flat list.
        for (const entry of slice) {
            const last = coverage[coverage.length - 1];
            if (last && last.term === term && last.strand === entry.strand) {
                last.topics.push(entry.topic);
            } else {
                coverage.push({ term, strand: entry.strand, topics: [entry.topic] });
            }
        }
    }

    return coverage;
}

/** Everything a grade covers in one term, across every learning area. */
export function termSyllabus(
    grade: GradeNumber,
    term: Term
): { area: LearningArea; coverage: TermCoverage[] }[] {
    return learningAreasForGrade(grade)
        .map((area) => ({
            area,
            coverage: termPlan(grade, area.id).filter((entry) => entry.term === term),
        }))
        .filter((entry) => entry.coverage.length > 0);
}
