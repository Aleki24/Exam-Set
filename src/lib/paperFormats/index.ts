/**
 * THE PAPER FORMAT CATALOGUE
 * ----------------------------------------------------------------------------
 * Resolving "Grade 9, Integrated Science, end of term" to the shape of a paper.
 *
 * Everything here is pure and data-driven. Adding a subject means adding a row
 * to jss.ts / senior.ts / primary.ts, never an if-statement here.
 *
 * TWO THINGS THIS DELIBERATELY DOES NOT DO
 *
 * It does not read the `grades` table to work out a level. That table carries
 * drift — `Grade 10` exists twice, once with `band: 'sss'` and once with
 * `band: null`, and a `Grade 9` row has `level: null` — so resolving through it
 * silently returns the wrong format for a real school. `levelForGrade` in
 * catalog.ts resolves from the printed grade label instead, which cannot drift.
 *
 * And it never invents. A subject with no matching format resolves to `null`,
 * and the caller says so, rather than receiving a plausible-looking default that
 * a teacher would reasonably mistake for an official structure.
 */

import type { ExamTypeSlug, LevelSlug } from '@/lib/catalog';
import { levelForGrade } from '@/lib/catalog';
import type { PaperFormat, PaperPlan } from '@/types/paperPlan';
import { JSS_FORMATS } from './jss';
import { SENIOR_FORMATS } from './senior';
import { PRIMARY_FORMATS } from './primary';

export { JSS_FORMATS } from './jss';
export { SENIOR_FORMATS } from './senior';
export { PRIMARY_FORMATS } from './primary';

export const PAPER_FORMATS: PaperFormat[] = [...JSS_FORMATS, ...SENIOR_FORMATS, ...PRIMARY_FORMATS];

export const FORMAT_BY_ID: Record<string, PaperFormat> = Object.fromEntries(
    PAPER_FORMATS.map((f) => [f.id, f])
);

// ============================================================================
// MATCHING
// ============================================================================

/**
 * Subject names in the bank are composites — "Integrated Science / Health
 * Education", "Pre-Technical Studies / Business Studies / Computer Studies" —
 * because the rationalised learning areas merged several old subjects into one
 * row. Matching on equality finds nothing, so aliases are matched as normalised
 * substrings in either direction.
 */
function normalise(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function subjectMatches(format: PaperFormat, subject?: string | null): boolean {
    // A format with no aliases is a generic school shape — an end-of-term paper
    // is an end-of-term paper whatever the subject — so it matches everything.
    if (format.subjectAliases.length === 0) return true;
    if (!subject) return false;

    const target = normalise(subject);
    if (!target) return false;

    return format.subjectAliases.some((alias) => {
        const a = normalise(alias);
        return a.length > 0 && (target.includes(a) || a.includes(target));
    });
}

export interface FormatQuery {
    subject?: string | null;
    /** "Grade 9", "Form 4" — as printed. Resolves the level on its own. */
    gradeLabel?: string | null;
    /** Only needed when there is no grade label to resolve from. */
    level?: LevelSlug | null;
    examType?: ExamTypeSlug | null;
}

/**
 * Every format that fits, best first.
 *
 * "Best" is: a format written for this subject beats a generic school shape, a
 * published KNEC structure beats a convention, and one written for this exam
 * type beats one that suits any. A provisional format loses a point to a
 * confirmed one, so a school is steered toward what is actually verified.
 */
export function resolveFormats(query: FormatQuery): PaperFormat[] {
    const level = query.gradeLabel ? levelForGrade(query.gradeLabel)?.slug : query.level ?? undefined;

    const scored = PAPER_FORMATS.filter((format) => {
        if (level && format.level !== level) return false;
        if (query.gradeLabel && !format.grades.includes(query.gradeLabel)) return false;
        if (query.examType && format.examTypes && !format.examTypes.includes(query.examType)) return false;
        return subjectMatches(format, query.subject);
    }).map((format) => {
        let score = 0;
        if (format.subjectAliases.length > 0) score += 4;
        if (query.examType && format.examTypes?.includes(query.examType)) score += 2;
        if (format.origin === 'knec') score += 2;
        if (format.provisional) score -= 1;
        return { format, score };
    });

    return scored.sort((a, b) => b.score - a.score || a.format.id.localeCompare(b.format.id)).map((s) => s.format);
}

/** The best fit, or null when nothing in the catalogue covers this. */
export function resolveFormat(query: FormatQuery): PaperFormat | null {
    return resolveFormats(query)[0] ?? null;
}

// ============================================================================
// PINNING A FORMAT TO A CLASS
// ============================================================================

export interface PlanOverrides {
    scoredMarks?: number;
    durationMinutes?: number;
    /** The strands actually taught — see PaperPlan.coverage. */
    coverage?: { strands: string[] };
    preferUnused?: boolean;
    avoidDuplicates?: boolean;
}

/**
 * Turns a catalogue entry into the concrete plan for one class's paper.
 *
 * Overriding `scoredMarks` scales the sections proportionally rather than
 * rejecting the request: a school that wants the KJSEA Mathematics shape at 50
 * marks instead of 100 gets a 10-mark Section A and a 40-mark Section B, which
 * is what it meant. Question counts scale with the marks so a scaled objective
 * section stays one mark per question.
 */
export function toPlan(
    format: PaperFormat,
    context: { gradeLabel: string; subject: string; examType: ExamTypeSlug },
    overrides: PlanOverrides = {}
): PaperPlan {
    const scoredMarks = Math.max(1, Math.round(overrides.scoredMarks ?? format.scoredMarks));
    const scale = scoredMarks / format.scoredMarks;

    const sections =
        scale === 1
            ? format.sections
            : format.sections.map((section) => {
                  const marks = Math.max(1, Math.round(section.marks * scale));
                  const questionsSet =
                      section.questionsSet === undefined
                          ? undefined
                          : Math.max(1, Math.round(section.questionsSet * scale));
                  const answerAny =
                      section.answerAny === undefined || questionsSet === undefined
                          ? section.answerAny
                          : Math.min(questionsSet, Math.max(1, Math.round(section.answerAny * scale)));
                  return { ...section, marks, questionsSet, answerAny };
              });

    return {
        id: format.id,
        name: format.name,
        origin: format.origin,
        level: format.level,
        gradeLabel: context.gradeLabel,
        subject: context.subject,
        examType: context.examType,
        scoredMarks,
        durationMinutes: Math.max(
            1,
            Math.round(overrides.durationMinutes ?? format.durationMinutes * (scale === 1 ? 1 : scale))
        ),
        language: format.language,
        sections,
        coverage: overrides.coverage,
        strandWeights: format.strandWeights,
        difficultyMix: format.difficultyMix,
        preferUnused: overrides.preferUnused ?? true,
        avoidDuplicates: overrides.avoidDuplicates ?? true,
        verifiedOn: format.verifiedOn,
        provisional: format.provisional,
        sourceUrl: format.sourceUrl,
        note: format.note,
    };
}

/** Convenience: resolve and pin in one step. Null when nothing matches. */
export function planFor(
    context: { gradeLabel: string; subject: string; examType: ExamTypeSlug },
    overrides: PlanOverrides = {}
): PaperPlan | null {
    const format = resolveFormat(context);
    return format ? toPlan(format, context, overrides) : null;
}
