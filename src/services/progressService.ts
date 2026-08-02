/**
 * LEARNER PROGRESS
 * ----------------------------------------------------------------------------
 * Reads the aggregate views from migration 025 and shapes them for the UI.
 *
 * Every view is `security_invoker`, so a learner's own row level security is
 * what decides which rows come back — this file never filters by user id and
 * must never start. Adding `.eq('user_id', …)` here would look like defence and
 * would actually be the opposite: it would suggest the safety lives in this
 * file, and the day somebody writes a second caller without it, the omission
 * looks harmless. The database is the guard. This is presentation.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ProgressSummary {
    papersAttempted: number;
    papersCompleted: number;
    averagePercentage: number | null;
    bestPercentage: number | null;
    marksScored: number | null;
    marksAvailable: number | null;
    lastCompletedAt: string | null;
}

export interface SubjectProgress {
    subject: string;
    levelSlug: string | null;
    papersCompleted: number;
    averagePercentage: number | null;
    lastCompletedAt: string | null;
}

export interface TopicProgress {
    topic: string;
    subject: string | null;
    questionsAnswered: number;
    questionsCorrect: number;
    percentage: number | null;
}

export interface RecentResult {
    sessionId: string;
    examId: string;
    title: string | null;
    subject: string | null;
    gradeLabel: string | null;
    score: number | null;
    maxScore: number | null;
    percentage: number | null;
    submittedAt: string | null;
}

export interface UnfinishedSession {
    sessionId: string;
    examId: string;
    title: string | null;
    subject: string | null;
    gradeLabel: string | null;
    slug: string | null;
    startedAt: string | null;
    timeRemaining: number | null;
}

export interface LearnerProgress {
    summary: ProgressSummary;
    subjects: SubjectProgress[];
    topics: TopicProgress[];
    recent: RecentResult[];
    unfinished: UnfinishedSession[];
}

export const EMPTY_PROGRESS: LearnerProgress = {
    summary: {
        papersAttempted: 0,
        papersCompleted: 0,
        averagePercentage: null,
        bestPercentage: null,
        marksScored: null,
        marksAvailable: null,
        lastCompletedAt: null,
    },
    subjects: [],
    topics: [],
    recent: [],
    unfinished: [],
};

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export async function loadLearnerProgress(supabase: any): Promise<LearnerProgress> {
    // Fetched together rather than in sequence. Five round trips to a database
    // in Ireland from a phone in Nairobi is most of a second of waiting that
    // buys nothing — none of these depend on each other.
    const [summary, subjects, topics, recent, unfinished] = await Promise.all([
        supabase.from('learner_progress_summary').select('*').maybeSingle(),
        supabase.from('learner_subject_progress').select('*').order('average_percentage', { ascending: true }),
        supabase.from('learner_topic_progress').select('*').order('percentage', { ascending: true, nullsFirst: false }),
        supabase.from('learner_recent_results').select('*').order('submitted_at', { ascending: false }),
        supabase.from('learner_unfinished_sessions').select('*').order('started_at', { ascending: false }),
    ]);

    // A missing progress row is the ordinary state of a new account, not a
    // fault. Only a real error is worth a log line.
    for (const [label, result] of [
        ['summary', summary],
        ['subjects', subjects],
        ['topics', topics],
        ['recent', recent],
        ['unfinished', unfinished],
    ] as const) {
        if (result?.error) console.error(`Progress (${label}) failed:`, result.error.message);
    }

    const s = summary?.data;

    return {
        summary: s
            ? {
                  papersAttempted: Number(s.papers_attempted ?? 0),
                  papersCompleted: Number(s.papers_completed ?? 0),
                  averagePercentage: num(s.average_percentage),
                  bestPercentage: num(s.best_percentage),
                  marksScored: num(s.marks_scored),
                  marksAvailable: num(s.marks_available),
                  lastCompletedAt: s.last_completed_at ?? null,
              }
            : EMPTY_PROGRESS.summary,

        subjects: (subjects?.data ?? []).map((r: any) => ({
            subject: r.subject,
            levelSlug: r.level_slug ?? null,
            papersCompleted: Number(r.papers_completed ?? 0),
            averagePercentage: num(r.average_percentage),
            lastCompletedAt: r.last_completed_at ?? null,
        })),

        topics: (topics?.data ?? []).map((r: any) => ({
            topic: r.topic,
            subject: r.subject ?? null,
            questionsAnswered: Number(r.questions_answered ?? 0),
            questionsCorrect: Number(r.questions_correct ?? 0),
            percentage: num(r.percentage),
        })),

        recent: (recent?.data ?? []).map((r: any) => ({
            sessionId: r.session_id,
            examId: r.exam_id,
            title: r.title ?? null,
            subject: r.subject ?? null,
            gradeLabel: r.grade_label ?? null,
            score: num(r.score),
            maxScore: num(r.max_score),
            percentage: num(r.percentage),
            submittedAt: r.submitted_at ?? null,
        })),

        unfinished: (unfinished?.data ?? []).map((r: any) => ({
            sessionId: r.session_id,
            examId: r.exam_id,
            title: r.title ?? null,
            subject: r.subject ?? null,
            gradeLabel: r.grade_label ?? null,
            slug: r.slug ?? null,
            startedAt: r.started_at ?? null,
            timeRemaining: num(r.time_remaining),
        })),
    };
}

/**
 * Which way the marks are going.
 *
 * Compares the mean of the most recent third of results against the mean of the
 * oldest third, and refuses to answer below six results. A trend drawn from two
 * papers is noise wearing a confident label, and telling a learner they are
 * "improving" on that basis is worse than telling them nothing — they will
 * revise less.
 *
 * The five-point band is the same idea: a two-point move between sittings is
 * indistinguishable from having had a better morning.
 */
export type Trend = 'improving' | 'steady' | 'slipping' | 'unknown';

export function trendOf(recent: RecentResult[]): Trend {
    const scores = recent
        .filter((r) => r.percentage !== null)
        .map((r) => r.percentage as number);

    if (scores.length < 6) return 'unknown';

    // `recent` arrives newest first.
    const window = Math.max(2, Math.floor(scores.length / 3));
    const newest = scores.slice(0, window);
    const oldest = scores.slice(-window);

    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const delta = mean(newest) - mean(oldest);

    if (delta >= 5) return 'improving';
    if (delta <= -5) return 'slipping';
    return 'steady';
}

export const TREND_LABEL: Record<Trend, string> = {
    improving: 'Going up',
    steady: 'Holding steady',
    slipping: 'Slipping',
    unknown: 'Not enough papers yet',
};
