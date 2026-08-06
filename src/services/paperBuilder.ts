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

import { publicBrowserClient } from '@/utils/supabase/publicClient';
import type { Difficulty, DBQuestion, Question, QuestionType } from '@/types';
import type { PaperBlueprint } from '@/types/shop';
import type {
    AssembledSection,
    Deficit,
    FeasibilityReport,
    PaperPlan,
    PlannedAssembly,
    SectionPlan,
} from '@/types/paperPlan';
import type { DeclaredSection } from '@/services/paperLayout';

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
// FEASIBILITY
// ============================================================================

/**
 * How long a question takes, by type.
 *
 * The flat `marks × 1.2` used by `paperStats` was calibrated for structured
 * work, and it is badly wrong on the papers this catalogue exists to produce: a
 * KJSEA Section A of thirty one-mark multiple-choice questions comes out at
 * fifty-one minutes against an official allowance of about thirty. Objective
 * questions cost what they cost to read and decide — roughly a minute — whatever
 * they are worth. Everything else scales with the marks.
 *
 * Checked against three published papers: KJSEA Mathematics (132 estimated
 * against 120 allowed), KJSEA Integrated Science (86 against 100) and KCSE
 * Mathematics Paper 1 (140 against 150). All inside the ±15% band `timeOk` uses.
 */
const MINUTES_PER_QUESTION: Partial<Record<QuestionType, number>> = {
    'Multiple Choice': 1,
    'True/False': 0.75,
    'Fill-in-the-blank': 1,
    Matching: 1.5,
};

const MINUTES_PER_MARK: Partial<Record<QuestionType, number>> = {
    Structured: 1.4,
    'Short Answer': 1.2,
    Numeric: 1.5,
    Essay: 2,
    Practical: 2,
    Oral: 1,
};

/** Structured is the sensible default for an untyped or unknown question. */
const DEFAULT_MINUTES_PER_MARK = 1.4;

/** How long one question takes a candidate. */
export function questionMinutes(q: Pick<Question, 'marks' | 'subParts' | 'type'>): number {
    const perQuestion = MINUTES_PER_QUESTION[q.type];
    if (perQuestion !== undefined) return perQuestion;
    return marksOf(q) * (MINUTES_PER_MARK[q.type] ?? DEFAULT_MINUTES_PER_MARK);
}

/**
 * How many questions a section prints, where that is knowable.
 *
 * Null means "as many as it takes to reach the marks" — a structured section
 * that does not fix a count.
 */
export function sectionQuestionsNeeded(section: SectionPlan): number | null {
    if (section.questionsSet !== undefined) return section.questionsSet;
    if (section.marksPerQuestion) return Math.round(section.marks / section.marksPerQuestion);
    return null;
}

/** Time for a section, priced from what the candidate answers, not what is printed. */
function sectionMinutes(section: SectionPlan): number {
    const primary = section.types[0];
    const perQuestion = primary ? MINUTES_PER_QUESTION[primary] : undefined;

    if (perQuestion !== undefined) {
        const answered = section.answerAny ?? sectionQuestionsNeeded(section) ?? section.marks;
        return answered * perQuestion;
    }
    // `section.marks` is the scored total, so an "answer any five of eight"
    // section is already priced at five answers rather than eight.
    return section.marks * ((primary && MINUTES_PER_MARK[primary]) ?? DEFAULT_MINUTES_PER_MARK);
}

/** Minutes a plan should take a candidate, independent of what the bank holds. */
export function planMinutes(plan: PaperPlan): number {
    return Math.round(plan.sections.reduce((sum, s) => sum + sectionMinutes(s), 0));
}

/**
 * Questions that may appear in a section.
 *
 * Type is a hard filter, not a preference. A structured question in the
 * objective section is a mistake rather than a compromise, so a thin bank leaves
 * the section visibly short instead of being quietly padded from elsewhere.
 */
function eligibleForSection(pool: DBQuestion[], section: SectionPlan): DBQuestion[] {
    const types = new Set(section.types);
    const difficulties = section.difficulties ? new Set<Difficulty>(section.difficulties) : null;
    const strands = section.strands ? new Set(section.strands.map((s) => s.toLowerCase())) : null;

    return pool.filter((q) => {
        if (!types.has(q.type)) return false;
        if (difficulties && !difficulties.has(q.difficulty)) return false;
        if (strands && !(q.topic && strands.has(q.topic.toLowerCase()))) return false;

        const m = marksOf(q);
        if (m <= 0) return false;
        // A section that sets one mark per question cannot use a five-mark one,
        // and reporting it as available would be a lie the setter finds later.
        if (section.marksPerQuestion !== undefined && m !== section.marksPerQuestion) return false;
        return true;
    });
}

function describeTypes(types: QuestionType[]): string {
    if (types.length === 0) return 'question';
    if (types.length === 1) return types[0];
    return `${types.slice(0, -1).join(', ')} or ${types[types.length - 1]}`;
}

/**
 * Can this format be filled from this bank, and if not, what exactly is missing?
 *
 * This runs BEFORE assembly, and it is the feature that matters most while a
 * bank is thin — which is the normal condition of every school in its first term
 * on the platform, not an error state. A builder that can only answer "here is
 * your paper" has nothing to say to a school that has not stocked its bank yet.
 * This answers "you need 26 one-mark Multiple Choice questions", which is a
 * worklist the entry form, the bulk import, the extractor and the AI author can
 * all be pointed at.
 *
 * Sections are considered in the order they are declared, each drawing from what
 * the ones before it left behind. Section A is normally the most constrained —
 * objective questions only — so declaration order gives the scarce section first
 * claim, which is also how a person would fill the paper.
 */
export function planFeasibility(pool: DBQuestion[], plan: PaperPlan): FeasibilityReport {
    const deficits: Deficit[] = [];
    const placed: DBQuestion[] = [];

    let remaining = pool.filter((q) => marksOf(q) > 0);

    // A CAT covers the term so far. Judging it against the whole syllabus would
    // report a perfectly good paper as unbalanced.
    if (plan.coverage && plan.coverage.strands.length > 0) {
        const taught = new Set(plan.coverage.strands.map((s) => s.toLowerCase()));
        remaining = remaining.filter((q) => q.topic && taught.has(q.topic.toLowerCase()));
    }

    const used = new Set<string>();
    let coverableMarks = 0;

    for (const section of plan.sections) {
        const eligible = eligibleForSection(remaining, section).filter((q) => !used.has(q.id));
        const need = sectionQuestionsNeeded(section);

        let taken: DBQuestion[];
        let sectionMarks: number;

        if (need !== null) {
            taken = eligible.slice(0, need);
            // Part of a section is worth part of its marks. Rounding down keeps
            // the report from claiming a mark the paper will not carry.
            sectionMarks = need > 0 ? Math.floor((section.marks * taken.length) / need) : 0;
        } else {
            // No fixed count: fill by marks, largest that still fits first.
            //
            // Smallest-first reads as the cautious choice and is the worse one:
            // it spends every small question early, then strands the section a
            // mark or two short because nothing left is small enough to close
            // the gap. That made this report claim a section could not be
            // filled while the assembler went on to fill it — and a warning
            // contradicted by the paper it warned about is worse than no
            // warning. Taking the largest that fits keeps the small questions
            // back for exactly the gap they are needed for.
            taken = [];
            let running = 0;
            for (const q of [...eligible].sort((a, b) => marksOf(b) - marksOf(a))) {
                const m = marksOf(q);
                if (running + m > section.marks) continue;
                taken.push(q);
                running += m;
            }
            sectionMarks = running;
        }

        for (const q of taken) used.add(q.id);
        placed.push(...taken);
        coverableMarks += sectionMarks;

        const unit: Deficit['unit'] = need !== null ? 'questions' : 'marks';
        const have = need !== null ? taken.length : sectionMarks;
        const wanted = need !== null ? need : section.marks;

        if (have < wanted) {
            const missing = wanted - have;
            const each = section.marksPerQuestion ? `${section.marksPerQuestion}-mark ` : '';
            const where = section.strands ? ` on ${section.strands.join(', ')}` : '';
            const message =
                unit === 'questions'
                    ? `${section.label} needs ${wanted} ${each}${describeTypes(section.types)} question${
                          wanted === 1 ? '' : 's'
                      }${where}; the bank has ${have}. ${missing} missing.`
                    : `${section.label} needs ${wanted} marks of ${describeTypes(section.types)} question${
                          section.types.length === 1 ? '' : 's'
                      }${where}; the bank covers ${have}. ${missing} marks missing.`;

            deficits.push({
                sectionId: section.id,
                sectionLabel: section.label,
                unit,
                need: wanted,
                have,
                missing,
                types: section.types,
                strands: section.strands,
                marksEach: section.marksPerQuestion,
                message,
            });
        }
    }

    const estimatedMinutes = planMinutes(plan);
    const tolerance = plan.durationMinutes * 0.15;

    return {
        fillable: deficits.length === 0,
        deficits,
        // A school printing forty papers needs forty marking schemes, and
        // finding that out at the printer is too late.
        schemeGaps: placed.filter((q) => !q.markingScheme || q.markingScheme.trim() === '').length,
        estimatedMinutes,
        withinDuration: Math.abs(estimatedMinutes - plan.durationMinutes) <= tolerance,
        scoredMarks: plan.scoredMarks,
        coverableMarks,
    };
}

// ============================================================================
// SECTION-AWARE ASSEMBLY
// ============================================================================

/**
 * Builds a paper to the shape a format declares.
 *
 * The difference from `assemblePaper` is not that this has more constraints. It
 * is that the paper has a structure before any question is chosen: sections come
 * from the plan, questions are assigned into them, and the running order that
 * comes out is the order that prints. `assemblePaper` sorted its result by
 * difficulty at the very end, which scattered the objective questions and left
 * `paperLayout` unable to recognise a Section A even when one was there.
 *
 * Rules, in order of precedence:
 *   1. a section only ever holds the types it allows — no substitution, ever
 *   2. no section exceeds the marks it declares
 *   3. the paper never scores more than the plan's total
 *   4. no question appears twice, or repeats one already in `existing`
 *   5. the difficulty mix is honoured as far as 1–4 leave room
 *   6. least-used questions first when `preferUnused` is set
 *
 * Rule 1 outranks everything below it on purpose. A structured question in the
 * objective section is a mistake rather than a compromise, so a thin bank leaves
 * the section visibly short and `feasibility` says exactly what is missing.
 */
export function assembleFromPlan(
    pool: DBQuestion[],
    plan: PaperPlan,
    existing: DBQuestion[] = []
): PlannedAssembly<DBQuestion> {
    const notes: string[] = [];
    const taken = new Set<string>(plan.avoidDuplicates ? existing.map((q) => q.id) : []);

    let candidates = pool.filter((q) => marksOf(q) > 0 && !taken.has(q.id));

    if (plan.coverage && plan.coverage.strands.length > 0) {
        const taught = new Set(plan.coverage.strands.map((s) => s.toLowerCase()));
        candidates = candidates.filter((q) => q.topic && taught.has(q.topic.toLowerCase()));
    }

    // Shuffle first so equal candidates vary between builds, then let usage
    // order win — a stable sort keeps the shuffle as the tie-break inside a
    // usage tier, exactly as the difficulty-only engine does.
    candidates = shuffle(candidates);
    if (plan.preferUnused) {
        candidates.sort((a, b) => (a.usage_count ?? 0) - (b.usage_count ?? 0));
    }

    // The difficulty mix is a whole-paper target rather than a per-section one:
    // a twenty-question objective section has no room for three difficulty
    // budgets, but the paper around it does.
    const mix = normaliseMix(plan.difficultyMix);
    const difficultyBudget: Record<Difficulty, number> = {
        Easy: Math.round((plan.scoredMarks * mix.Easy) / 100),
        Medium: Math.round((plan.scoredMarks * mix.Medium) / 100),
        Difficult: Math.round((plan.scoredMarks * mix.Difficult) / 100),
    };
    const achieved: Record<Difficulty, { marks: number; count: number }> = {
        Easy: { marks: 0, count: 0 },
        Medium: { marks: 0, count: 0 },
        Difficult: { marks: 0, count: 0 },
    };

    const sections: AssembledSection<DBQuestion>[] = [];
    let scoredMarks = 0;
    let printedMarks = 0;

    for (const section of plan.sections) {
        const eligible = eligibleForSection(candidates, section).filter((q) => !taken.has(q.id));
        const need = sectionQuestionsNeeded(section);

        // What the section may print. An "answer any five of eight" section
        // prints eight questions' worth while scoring five.
        const printCeiling =
            need !== null && section.marksPerQuestion
                ? need * section.marksPerQuestion
                : need !== null
                  ? Infinity
                  : section.marks;

        const chosen: DBQuestion[] = [];
        let sectionPrinted = 0;

        // Two passes. The first takes only questions whose difficulty still has
        // whole-paper budget left, so the mix is served where the section allows
        // it; the second fills whatever the first could not, because an unfilled
        // section is a worse outcome than a skewed one.
        for (const wantedBudget of [true, false]) {
            for (const q of eligible) {
                if (need !== null && chosen.length >= need) break;
                if (taken.has(q.id)) continue;

                const m = marksOf(q);
                if (sectionPrinted + m > printCeiling) continue;
                if (need === null && sectionPrinted + m > section.marks) continue;

                const d: Difficulty = DIFFICULTIES.includes(q.difficulty) ? q.difficulty : 'Medium';
                if (wantedBudget && achieved[d].marks + m > difficultyBudget[d]) continue;

                chosen.push(q);
                taken.add(q.id);
                sectionPrinted += m;
                achieved[d].marks += m;
                achieved[d].count += 1;
            }
            if (need !== null && chosen.length >= need) break;
            if (need === null && sectionPrinted >= section.marks) break;
        }

        // Close the last few marks smallest-first.
        //
        // The passes above take questions in usage order, which is right for
        // spreading the bank but leaves a section stranded a mark or two short
        // whenever the questions still available are all too big for the gap.
        // The difficulty-only engine has always finished this way; a section
        // needs it just as much.
        if (need === null && sectionPrinted < section.marks) {
            const bySize = eligible
                .filter((q) => !taken.has(q.id))
                .sort((a, b) => marksOf(a) - marksOf(b));
            for (const q of bySize) {
                if (sectionPrinted >= section.marks) break;
                const m = marksOf(q);
                if (sectionPrinted + m > section.marks) continue;

                chosen.push(q);
                taken.add(q.id);
                sectionPrinted += m;
                const d: Difficulty = DIFFICULTIES.includes(q.difficulty) ? q.difficulty : 'Medium';
                achieved[d].marks += m;
                achieved[d].count += 1;
            }
        }

        // A section that came back part-full is worth part of its marks. Whole
        // sections are worth exactly what they declare, so a mark is never
        // invented by the arithmetic of the fill.
        const sectionScored =
            need !== null
                ? need > 0
                    ? Math.floor((section.marks * chosen.length) / need)
                    : 0
                : Math.min(sectionPrinted, section.marks);

        // Inside a section, easier first and grouped by strand — the same
        // readability instinct the difficulty-only engine applied to the whole
        // paper, now applied where it cannot break the structure.
        const order: Record<Difficulty, number> = { Easy: 0, Medium: 1, Difficult: 2 };
        chosen.sort((a, b) => {
            const byDifficulty = (order[a.difficulty] ?? 1) - (order[b.difficulty] ?? 1);
            if (byDifficulty !== 0) return byDifficulty;
            return (a.topic || '').localeCompare(b.topic || '');
        });

        sections.push({
            plan: section,
            questions: chosen,
            printedMarks: sectionPrinted,
            scoredMarks: sectionScored,
        });
        scoredMarks += sectionScored;
        printedMarks += sectionPrinted;
    }

    const questions = sections.flatMap((s) => s.questions);
    const feasibility = planFeasibility(pool.filter((q) => !existing.some((e) => e.id === q.id)), plan);

    for (const deficit of feasibility.deficits) notes.push(deficit.message);
    if (scoredMarks < plan.scoredMarks) {
        notes.push(
            `Built ${scoredMarks} of ${plan.scoredMarks} marks. Add the missing questions to the bank, or relax the format.`
        );
    }
    if (feasibility.schemeGaps > 0) {
        notes.push(
            `${feasibility.schemeGaps} of these questions have no marking scheme, so the scheme will be incomplete.`
        );
    }
    if (plan.provisional) {
        notes.push(`${plan.name} is a provisional format. Check it against the current structure before a school sits it.`);
    }

    // Strand targets only mean something against a declared list of strands.
    // Free-text topics are reported as they are, never scored against a weight
    // nobody set.
    const strandBreakdown: Record<string, { targetMarks: number; actualMarks: number }> = {};
    for (const weight of plan.strandWeights ?? []) {
        strandBreakdown[weight.strand] = {
            targetMarks: Math.round((plan.scoredMarks * weight.percent) / 100),
            actualMarks: 0,
        };
    }
    for (const q of questions) {
        const strand = q.topic || 'Untagged';
        if (!strandBreakdown[strand]) strandBreakdown[strand] = { targetMarks: 0, actualMarks: 0 };
        strandBreakdown[strand].actualMarks += marksOf(q);
    }

    return {
        plan,
        sections,
        questions,
        scoredMarks,
        printedMarks,
        shortfallMarks: Math.max(0, plan.scoredMarks - scoredMarks),
        difficultyBreakdown: {
            Easy: { targetMarks: difficultyBudget.Easy, actualMarks: achieved.Easy.marks, count: achieved.Easy.count },
            Medium: {
                targetMarks: difficultyBudget.Medium,
                actualMarks: achieved.Medium.marks,
                count: achieved.Medium.count,
            },
            Difficult: {
                targetMarks: difficultyBudget.Difficult,
                actualMarks: achieved.Difficult.marks,
                count: achieved.Difficult.count,
            },
        },
        strandBreakdown,
        feasibility,
        notes,
    };
}

/**
 * An assembled paper in the shape `layoutSectionedPaper` wants.
 *
 * The renderer is told the sections rather than left to work them out from the
 * running order, which is how a Kiswahili paper gets SEHEMU A at the top instead
 * of SECTION A.
 */
export function declaredSections(assembly: PlannedAssembly<DBQuestion>): DeclaredSection[] {
    return assembly.sections.map((s) => ({
        label: s.plan.label,
        title: s.plan.title,
        instruction: s.plan.instruction,
        questions: s.questions,
    }));
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

/** How long a single page of the bank may take before we give up on it. */
const REQUEST_TIMEOUT_MS = 15000;

/**
 * Settles a request that would otherwise hang for ever.
 *
 * The Supabase client applies no timeout of its own, so a request made on a
 * dropped mobile connection — or while the client is stuck trying to refresh an
 * expired token — simply never settles. The caller's `.then`, `.catch` and
 * `.finally` all wait indefinitely, which is why the setter sat on
 * "Loading bank…" for ever with no error and no way back: there was nothing to
 * catch, because nothing had failed yet.
 *
 * A rejection is a far better outcome than silence. The setter already knows how
 * to show a reason and offer a retry; it just needed the promise to end.
 */
function withTimeout<T>(work: PromiseLike<T>, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error(`${label} took too long to respond. Check your connection and try again.`)),
            REQUEST_TIMEOUT_MS
        );

        Promise.resolve(work).then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                clearTimeout(timer);
                reject(error);
            }
        );
    });
}

/**
 * Pulls every question matching `filters`, paging until exhausted.
 *
 * The setter needs the whole candidate pool in hand: picking 40 questions out
 * of a bank of 900 is impossible if the query stops at 50 rows.
 */
export async function fetchQuestionPool(filters: PoolFilters = {}): Promise<DBQuestion[]> {
    // Session-free on purpose: the bank is public, and reading it through the
    // authenticated client made it wait behind the auth token-refresh lock —
    // which is how this came to hang for ever behind an expired session.
    const supabase = publicBrowserClient();
    const max = filters.max ?? 1000;
    const collected: DBQuestion[] = [];

    // Filtering on a column of an embedded table only narrows the questions
    // themselves when that embed is an inner join. Without the `!inner`, PostgREST
    // happily returns every question and simply nulls out the ones whose grade did
    // not match — so choosing "Junior school" used to appear to do nothing at all.
    // The join is only made inner when it is actually being filtered on, because
    // an inner join would otherwise drop the questions that have no grade set.
    const joinsOnGrade = Boolean(filters.level || filters.band);
    const gradeEmbed = joinsOnGrade ? 'grades!inner(name, level, band)' : 'grades(name, level, band)';

    for (let offset = 0; offset < max; offset += PAGE_SIZE) {
        let query = supabase
            .from('questions')
            .select(`*, curriculums(name), ${gradeEmbed}, subjects(name)`)
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

        const { data, error } = await withTimeout(query, 'The question bank');
        if (error) {
            // Raised, not swallowed. Returning an empty array here is
            // indistinguishable from "the bank is empty", which sent this exact
            // bug — a broken connection — looking for missing questions instead.
            console.error('fetchQuestionPool failed:', error.message);
            throw new Error(error.message);
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
