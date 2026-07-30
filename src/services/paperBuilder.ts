/**
 * PAPER BUILDER
 * ----------------------------------------------------------------------------
 * The exam-setting engine behind /set.
 *
 * Everything here is deliberately split into a pure part and an I/O part:
 *   - `assemblePaper` is pure, so the selection rules can be reasoned about and
 *     tested without a database.
 *   - `fetchQuestionPool` is the only thing that talks to Supabase, and it
 *     pages through results instead of stopping at the first 50 rows (the old
 *     limit that made large papers impossible to fill).
 */

import { createClient } from '@/utils/supabase/client';
import type { Difficulty, DBQuestion, Question, QuestionType } from '@/types';
import type { PaperBlueprint } from '@/types/shop';

// ============================================================================
// SHUFFLING
// ============================================================================

/** Fisher-Yates. Returns a new array; never mutates the input. */
export function shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

// ============================================================================
// PURE ASSEMBLY
// ============================================================================

export interface AssemblyResult {
    questions: DBQuestion[];
    totalMarks: number;
    /** Marks still missing when the pool ran dry. 0 when the target was met. */
    shortfallMarks: number;
    /** Per-difficulty marks actually achieved vs asked for. */
    difficultyBreakdown: Record<Difficulty, { targetMarks: number; actualMarks: number; count: number }>;
    /** Human-readable notes about anything the caller should know. */
    notes: string[];
}

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Difficult'];

function marksOf(q: Pick<Question, 'marks' | 'subParts'>): number {
    // A question with sub-parts is worth the sum of its parts when those carry
    // their own marks — otherwise the top-level mark stands.
    if (q.subParts && q.subParts.length > 0) {
        const partTotal = q.subParts.reduce((sum, p) => sum + (Number(p.marks) || 0), 0);
        if (partTotal > 0) return partTotal;
    }
    return Number(q.marks) || 0;
}

/** Total marks of a set of questions, sub-parts included. */
export function totalMarks(questions: Pick<Question, 'marks' | 'subParts'>[]): number {
    return questions.reduce((sum, q) => sum + marksOf(q), 0);
}

/**
 * Picks questions out of `pool` until the blueprint's mark target is met,
 * honouring the requested difficulty mix as closely as the pool allows.
 *
 * Rules, in order of precedence:
 *   1. never exceed the target by more than the smallest available question
 *   2. spend each difficulty's mark budget before borrowing from another
 *   3. never repeat a question (or one already in `existing`)
 *   4. prefer least-used questions when `preferUnused` is set
 */
export function assemblePaper(
    pool: DBQuestion[],
    blueprint: PaperBlueprint,
    existing: DBQuestion[] = []
): AssemblyResult {
    const notes: string[] = [];
    const target = Math.max(0, Math.round(blueprint.targetMarks));

    // --- 1. Filter the pool down to what is eligible -------------------------
    const takenIds = new Set(existing.map((q) => q.id));
    let eligible = pool.filter((q) => marksOf(q) > 0);

    if (blueprint.avoidDuplicates) {
        eligible = eligible.filter((q) => !takenIds.has(q.id));
    }
    if (blueprint.topics.length > 0) {
        const wanted = new Set(blueprint.topics.map((t) => t.toLowerCase()));
        eligible = eligible.filter((q) => q.topic && wanted.has(q.topic.toLowerCase()));
    }
    if (blueprint.questionTypes.length > 0) {
        const wanted = new Set(blueprint.questionTypes);
        eligible = eligible.filter((q) => wanted.has(q.type));
    }

    if (eligible.length === 0) {
        return {
            questions: [],
            totalMarks: 0,
            shortfallMarks: target,
            difficultyBreakdown: emptyBreakdown(blueprint, target),
            notes: ['No questions in the bank match these filters. Widen the filters or add questions.'],
        };
    }

    // --- 2. Split the mark budget across difficulties ------------------------
    const mix = normaliseMix(blueprint.difficultyMix);
    const budget: Record<Difficulty, number> = {
        Easy: Math.round((target * mix.Easy) / 100),
        Medium: Math.round((target * mix.Medium) / 100),
        Difficult: Math.round((target * mix.Difficult) / 100),
    };
    // Rounding can drift a mark or two; push the remainder onto the largest share.
    const drift = target - (budget.Easy + budget.Medium + budget.Difficult);
    if (drift !== 0) {
        const biggest = DIFFICULTIES.reduce((a, b) => (mix[a] >= mix[b] ? a : b));
        budget[biggest] += drift;
    }

    // --- 3. Order each difficulty bucket ------------------------------------
    const buckets: Record<Difficulty, DBQuestion[]> = { Easy: [], Medium: [], Difficult: [] };
    for (const q of eligible) {
        const d: Difficulty = DIFFICULTIES.includes(q.difficulty) ? q.difficulty : 'Medium';
        buckets[d].push(q);
    }
    for (const d of DIFFICULTIES) {
        buckets[d] = shuffle(buckets[d]);
        if (blueprint.preferUnused) {
            // Stable sort keeps the shuffle as the tie-breaker within a usage tier.
            buckets[d].sort((a, b) => (a.usage_count ?? 0) - (b.usage_count ?? 0));
        }
    }

    // --- 4. Fill each bucket up to its budget -------------------------------
    const picked: DBQuestion[] = [];
    const pickedIds = new Set<string>(takenIds);
    const achieved: Record<Difficulty, { marks: number; count: number }> = {
        Easy: { marks: 0, count: 0 },
        Medium: { marks: 0, count: 0 },
        Difficult: { marks: 0, count: 0 },
    };

    // A paper must never come back worth more than was asked for — a teacher
    // who says 60 marks gets 60 or fewer, never 64. Both the per-difficulty
    // budget and the overall target are hard ceilings here; the top-up pass
    // below closes whatever gap that leaves.
    let running = 0;

    for (const d of DIFFICULTIES) {
        for (const q of buckets[d]) {
            if (achieved[d].marks >= budget[d]) break;
            if (pickedIds.has(q.id)) continue;
            const m = marksOf(q);
            // Skip rather than stop: a 5-mark question may not fit where a
            // 2-mark one still does.
            if (achieved[d].marks + m > budget[d]) continue;
            if (running + m > target) continue;

            picked.push(q);
            pickedIds.add(q.id);
            achieved[d].marks += m;
            achieved[d].count += 1;
            running += m;
        }
    }

    // --- 5. Top up from any difficulty to close the remaining gap -----------
    if (running < target) {
        const leftovers = shuffle(eligible.filter((q) => !pickedIds.has(q.id)))
            // Smallest first, so the last few marks can be filled precisely.
            .sort((a, b) => marksOf(a) - marksOf(b));

        for (const q of leftovers) {
            if (running >= target) break;
            const m = marksOf(q);
            if (running + m > target) continue;
            picked.push(q);
            pickedIds.add(q.id);
            const d: Difficulty = DIFFICULTIES.includes(q.difficulty) ? q.difficulty : 'Medium';
            achieved[d].marks += m;
            achieved[d].count += 1;
            running += m;
        }
    }

    // Only explain the shortfall when there actually is one. Rounding the mix
    // to whole questions always leaves small gaps, and reporting those as
    // problems would be noise.
    if (running < target) {
        notes.push(`Reached ${running} of ${target} marks. Add more questions to the bank, or lower the target.`);
        const thin = DIFFICULTIES.filter((d) => achieved[d].marks < budget[d]);
        if (thin.length > 0) {
            notes.push(
                `The bank is thin on ${thin.map((d) => d.toLowerCase()).join(' and ')} questions for these filters.`
            );
        }
    }

    // --- 6. Present the paper in a sensible order ---------------------------
    // Easy first, then Medium, then Difficult; grouped by topic inside each so
    // a learner is not bounced between strands.
    const order: Record<Difficulty, number> = { Easy: 0, Medium: 1, Difficult: 2 };
    picked.sort((a, b) => {
        const byDifficulty = (order[a.difficulty] ?? 1) - (order[b.difficulty] ?? 1);
        if (byDifficulty !== 0) return byDifficulty;
        return (a.topic || '').localeCompare(b.topic || '');
    });

    return {
        questions: picked,
        totalMarks: running,
        shortfallMarks: Math.max(0, target - running),
        difficultyBreakdown: {
            Easy: { targetMarks: budget.Easy, actualMarks: achieved.Easy.marks, count: achieved.Easy.count },
            Medium: { targetMarks: budget.Medium, actualMarks: achieved.Medium.marks, count: achieved.Medium.count },
            Difficult: { targetMarks: budget.Difficult, actualMarks: achieved.Difficult.marks, count: achieved.Difficult.count },
        },
        notes,
    };
}

function emptyBreakdown(blueprint: PaperBlueprint, target: number) {
    const mix = normaliseMix(blueprint.difficultyMix);
    return {
        Easy: { targetMarks: Math.round((target * mix.Easy) / 100), actualMarks: 0, count: 0 },
        Medium: { targetMarks: Math.round((target * mix.Medium) / 100), actualMarks: 0, count: 0 },
        Difficult: { targetMarks: Math.round((target * mix.Difficult) / 100), actualMarks: 0, count: 0 },
    };
}

/** Percentages that do not sum to 100 are scaled rather than rejected. */
function normaliseMix(mix: PaperBlueprint['difficultyMix']): Record<Difficulty, number> {
    const sum = (mix.Easy || 0) + (mix.Medium || 0) + (mix.Difficult || 0);
    if (sum <= 0) return { Easy: 34, Medium: 33, Difficult: 33 };
    return {
        Easy: (mix.Easy / sum) * 100,
        Medium: (mix.Medium / sum) * 100,
        Difficult: (mix.Difficult / sum) * 100,
    };
}

// ============================================================================
// PAPER STATISTICS (drives the live readout in the setter)
// ============================================================================

export interface PaperStats {
    count: number;
    marks: number;
    byDifficulty: Record<Difficulty, number>;
    byType: Partial<Record<QuestionType, number>>;
    byTopic: Record<string, number>;
    /** Estimated working time in minutes, ~1.2 min per mark plus reading time. */
    estimatedMinutes: number;
    /** Questions appearing more than once — should always be empty. */
    duplicateIds: string[];
}

export function paperStats(questions: Question[]): PaperStats {
    const byDifficulty: Record<Difficulty, number> = { Easy: 0, Medium: 0, Difficult: 0 };
    const byType: Partial<Record<QuestionType, number>> = {};
    const byTopic: Record<string, number> = {};
    const seen = new Map<string, number>();

    for (const q of questions) {
        const d: Difficulty = DIFFICULTIES.includes(q.difficulty) ? q.difficulty : 'Medium';
        byDifficulty[d] += 1;
        byType[q.type] = (byType[q.type] ?? 0) + 1;
        const topic = q.topic || 'Untagged';
        byTopic[topic] = (byTopic[topic] ?? 0) + 1;
        seen.set(q.id, (seen.get(q.id) ?? 0) + 1);
    }

    const marks = totalMarks(questions);

    return {
        count: questions.length,
        marks,
        byDifficulty,
        byType,
        byTopic,
        estimatedMinutes: Math.round(marks * 1.2 + questions.length * 0.5),
        duplicateIds: [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id),
    };
}

// ============================================================================
// POOL FETCHING
// ============================================================================

export interface PoolFilters {
    curriculum_id?: string;
    grade_id?: string;
    subject_id?: string;
    level?: string;
    band?: string;
    topic?: string;
    topics?: string[];
    difficulty?: Difficulty;
    type?: QuestionType;
    blooms_level?: string;
    term?: string;
    search?: string;
    /** Hard ceiling on rows pulled. Defaults to 1000 — plenty for one paper. */
    max?: number;
}

const PAGE_SIZE = 200;

/**
 * Pulls every question matching `filters`, paging until exhausted.
 *
 * The setter needs the whole candidate pool in hand: picking 40 questions out
 * of a bank of 900 is impossible if the query stops at 50 rows.
 */
export async function fetchQuestionPool(filters: PoolFilters = {}): Promise<DBQuestion[]> {
    const supabase = createClient();
    const max = filters.max ?? 1000;
    const collected: DBQuestion[] = [];

    for (let offset = 0; offset < max; offset += PAGE_SIZE) {
        let query = supabase
            .from('questions')
            .select('*, curriculums(name), grades(name, level, band), subjects(name)')
            .order('usage_count', { ascending: true })
            .order('created_at', { ascending: false })
            .range(offset, Math.min(offset + PAGE_SIZE, max) - 1);

        if (filters.curriculum_id) query = query.eq('curriculum_id', filters.curriculum_id);
        if (filters.grade_id) query = query.eq('grade_id', filters.grade_id);
        if (filters.subject_id) query = query.eq('subject_id', filters.subject_id);
        if (filters.level) query = query.eq('grades.level', filters.level);
        if (filters.band) query = query.eq('grades.band', filters.band);
        if (filters.difficulty) query = query.eq('difficulty', filters.difficulty);
        if (filters.type) query = query.eq('type', filters.type);
        if (filters.blooms_level) query = query.eq('blooms_level', filters.blooms_level);
        if (filters.term) query = query.eq('term', filters.term);
        if (filters.topic) query = query.ilike('topic', `%${filters.topic}%`);
        if (filters.topics && filters.topics.length > 0) query = query.in('topic', filters.topics);
        if (filters.search) query = query.ilike('text', `%${filters.search}%`);

        const { data, error } = await query;
        if (error) {
            console.error('fetchQuestionPool failed:', error.message);
            break;
        }
        if (!data || data.length === 0) break;

        collected.push(...data.map(mapRow));
        if (data.length < PAGE_SIZE) break;
    }

    return collected;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapRow(row: any): DBQuestion {
    return {
        id: row.id,
        text: row.text,
        marks: row.marks,
        difficulty: row.difficulty,
        topic: row.topic,
        subtopic: row.subtopic ?? undefined,
        type: row.type,
        options: row.options ?? undefined,
        matchingPairs: row.matching_pairs ?? undefined,
        unit: row.unit ?? undefined,
        expectedLength: row.expected_length ?? undefined,
        markingScheme: row.marking_scheme ?? undefined,
        bloomsLevel: row.blooms_level ?? undefined,
        answerSchema: row.answer_schema ?? undefined,
        imagePath: row.image_path ?? undefined,
        imageCaption: row.image_caption ?? undefined,
        hasLatex: row.has_latex ?? false,
        graphSvg: row.graph_svg ?? undefined,
        subParts: row.sub_parts ?? undefined,
        answerLines: row.answer_lines ?? undefined,
        curriculum_id: row.curriculum_id ?? undefined,
        grade_id: row.grade_id ?? undefined,
        subject_id: row.subject_id ?? undefined,
        usage_count: row.usage_count ?? 0,
        created_at: row.created_at,
        curriculum: row.curriculums?.name,
        grade: row.grades?.name,
        subject: row.subjects?.name,
        term: row.term ?? undefined,
    };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Distinct topics present in the bank for a subject, with question counts. */
export async function fetchTopicCounts(filters: PoolFilters = {}): Promise<{ topic: string; count: number }[]> {
    const pool = await fetchQuestionPool({ ...filters, max: 2000 });
    const counts = new Map<string, number>();
    for (const q of pool) {
        const topic = q.topic || 'Untagged';
        counts.set(topic, (counts.get(topic) ?? 0) + 1);
    }
    return [...counts.entries()]
        .map(([topic, count]) => ({ topic, count }))
        .sort((a, b) => a.topic.localeCompare(b.topic));
}
