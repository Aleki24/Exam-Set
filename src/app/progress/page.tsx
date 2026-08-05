import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, TrendingDown, TrendingUp, Minus, PlayCircle } from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import PractiseTopicButton from '@/components/PractiseTopicButton';
import { createClient } from '@/utils/supabase/server';
import {
    EMPTY_PROGRESS,
    loadLearnerProgress,
    trendOf,
    TREND_LABEL,
    type LearnerProgress,
    type Trend,
} from '@/services/progressService';

export const metadata: Metadata = {
    title: 'Your progress | Skulbase Exams',
    description: 'Papers attempted, topics covered and how your marks are moving.',
};

/*
 * Explicitly dynamic, and not merely as documentation.
 *
 * Next signals "this route read cookies, it cannot be static" by throwing a
 * DynamicServerError during the build probe — and the try/catch below, which
 * exists so a database outage still renders the page, would happily swallow
 * that signal along with the outages. It happened to be classified correctly
 * anyway, but relying on an exception escaping a catch block that is designed
 * to catch everything is not a property worth depending on. Saying it outright
 * removes the question.
 */
export const dynamic = 'force-dynamic';

/**
 * PROGRESS — what the marks say, without flattering anybody.
 *
 * The weakest topics come first. A dashboard that opens on a learner's best
 * subject is pleasant and useless: the whole reason to look at this page is to
 * find out what to revise next, and that is by definition the thing going worst.
 *
 * Rendered on the server. The aggregates are `security_invoker` views, so the
 * request's own row level security decides which rows exist at all — this page
 * never filters by user and could not see somebody else's marks if it tried.
 */
export default async function ProgressPage() {
    let progress: LearnerProgress = EMPTY_PROGRESS;

    try {
        const supabase = await createClient();
        progress = await loadLearnerProgress(supabase);
    } catch (err) {
        console.error('Progress unavailable:', err instanceof Error ? err.message : err);
    }

    const { summary, subjects, topics, recent, unfinished } = progress;
    const trend = trendOf(recent);
    const nothingYet = summary.papersAttempted === 0;

    return (
        <div className="min-h-screen bg-background">
            <TopNav />

            <main className="shell-width py-10 sm:py-14">
                <header className="max-w-2xl">
                    <p className="overline">Your progress</p>
                    <h1 className="display-2 mt-3">
                        {nothingYet ? 'Nothing sat yet' : 'How you are doing'}
                    </h1>
                    <p className="lead mt-4">
                        {nothingYet
                            ? 'Sit a paper and this page fills in — marks, topics, and which strands need the work.'
                            : 'Weakest topics first, because that is what decides what to revise next.'}
                    </p>
                </header>

                {nothingYet ? (
                    <div className="ruled mt-12 rounded-[var(--radius)] border border-border p-10 text-center">
                        <h2 className="title-1">Start with one paper</h2>
                        <p className="lead mx-auto mt-3 max-w-md">
                            Any paper you sit here is marked automatically, and every question
                            counts towards the topic breakdown.
                        </p>
                        <div className="mt-6 flex flex-wrap justify-center gap-3">
                            <Link href="/learn" className="btn-primary">
                                Find a paper
                            </Link>
                            <Link href="/set" className="btn-outline">
                                Set your own
                            </Link>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Unfinished first — it is the only thing here that is an
                            action rather than a report. */}
                        {unfinished.length > 0 && (
                            <section aria-labelledby="resume-heading" className="mt-12">
                                <h2 id="resume-heading" className="overline">
                                    Pick up where you left off
                                </h2>
                                <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {unfinished.slice(0, 6).map((s, i) => (
                                        <li key={s.sessionId}>
                                            <Link
                                                href={`/exam/${s.examId}`}
                                                className="sheet settle-in group flex h-full flex-col p-4"
                                                style={{ '--i': i % 12 } as React.CSSProperties}
                                            >
                                                <p className="overline">Unfinished</p>
                                                <h3 className="heading-ui mt-2 transition-colors group-hover:text-primary">
                                                    {s.title ?? 'Untitled paper'}
                                                </h3>
                                                <p className="meta mt-1">
                                                    {[s.gradeLabel, s.subject].filter(Boolean).join(' · ')}
                                                </p>
                                                <div className="flex-1" />
                                                <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                                                    <PlayCircle className="h-4 w-4" aria-hidden />
                                                    Resume
                                                </p>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        <section aria-labelledby="totals-heading" className="mt-12">
                            <h2 id="totals-heading" className="overline">
                                Overall
                            </h2>
                            <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <Stat label="Papers completed" value={String(summary.papersCompleted)} />
                                <Stat
                                    label="Average"
                                    value={summary.averagePercentage !== null ? `${summary.averagePercentage}%` : '—'}
                                />
                                <Stat
                                    label="Best"
                                    value={summary.bestPercentage !== null ? `${summary.bestPercentage}%` : '—'}
                                />
                                <TrendStat trend={trend} />
                            </dl>
                        </section>

                        {topics.length > 0 && (
                            <section aria-labelledby="topics-heading" className="mt-12">
                                <h2 id="topics-heading" className="overline">
                                    Topics to work on
                                </h2>
                                <p className="meta mt-2">
                                    Weakest first, weighted by marks rather than by question count.
                                </p>
                                <ul className="mt-4 space-y-2">
                                    {topics.slice(0, 12).map((t) => (
                                        <li key={`${t.subject}-${t.topic}`} className="surface p-4">
                                            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                                                <span className="heading-ui">{t.topic}</span>
                                                <span className="figure text-sm font-semibold">
                                                    {t.percentage !== null ? `${t.percentage}%` : '—'}
                                                </span>
                                            </div>
                                            <p className="meta mt-1">
                                                {[t.subject, `${t.questionsCorrect}/${t.questionsAnswered} right`]
                                                    .filter(Boolean)
                                                    .join(' · ')}
                                            </p>
                                            <Bar percentage={t.percentage} />

                                            {/* The whole point of ranking topics
                                                weakest-first: the worst one is
                                                one tap from being practised. */}
                                            <div className="mt-3">
                                                <PractiseTopicButton
                                                    topic={t.topic}
                                                    subject={t.subject}
                                                    className="btn-outline btn-sm"
                                                />
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        {subjects.length > 0 && (
                            <section aria-labelledby="subjects-heading" className="mt-12">
                                <h2 id="subjects-heading" className="overline">
                                    By subject
                                </h2>
                                <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {subjects.map((s) => (
                                        <li key={`${s.levelSlug}-${s.subject}`} className="surface p-5">
                                            <div className="flex items-baseline justify-between gap-3">
                                                <span className="heading-ui">{s.subject}</span>
                                                <span className="figure text-sm font-semibold">
                                                    {s.averagePercentage !== null ? `${s.averagePercentage}%` : '—'}
                                                </span>
                                            </div>
                                            <p className="meta mt-1">
                                                {s.papersCompleted} paper{s.papersCompleted === 1 ? '' : 's'}
                                            </p>
                                            <Bar percentage={s.averagePercentage} />
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        {recent.length > 0 && (
                            <section aria-labelledby="recent-heading" className="mt-12">
                                <h2 id="recent-heading" className="overline">
                                    Recent papers
                                </h2>
                                <ul className="mt-4 divide-y divide-border">
                                    {recent.map((r) => (
                                        <li
                                            key={r.sessionId}
                                            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3"
                                        >
                                            <div className="min-w-0">
                                                <Link
                                                    href={`/exam/${r.examId}/results`}
                                                    className="heading-ui transition-colors hover:text-primary"
                                                >
                                                    {r.title ?? 'Untitled paper'}
                                                </Link>
                                                <p className="meta mt-0.5">
                                                    {[r.gradeLabel, r.subject, formatDate(r.submittedAt)]
                                                        .filter(Boolean)
                                                        .join(' · ')}
                                                </p>
                                            </div>
                                            <span className="figure shrink-0 text-sm font-semibold">
                                                {r.score ?? '—'}/{r.maxScore ?? '—'}
                                                {r.percentage !== null && (
                                                    <span className="ml-2 text-muted-foreground">
                                                        {r.percentage}%
                                                    </span>
                                                )}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        <div className="mt-12 border-t border-border pt-8">
                            <Link
                                href="/learn"
                                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
                            >
                                Find your next paper
                                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                            </Link>
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="surface p-5">
            <dt className="overline">{label}</dt>
            <dd className="figure mt-2 text-2xl font-semibold">{value}</dd>
        </div>
    );
}

/**
 * The trend, and an honest "not enough papers yet" when there are fewer than
 * six. A direction drawn from two results is noise, and a learner told they are
 * improving on that basis revises less.
 */
function TrendStat({ trend }: { trend: Trend }) {
    const Icon = trend === 'improving' ? TrendingUp : trend === 'slipping' ? TrendingDown : Minus;
    const tone =
        trend === 'improving'
            ? 'text-success'
            : trend === 'slipping'
              ? 'text-[color:var(--ink-red)]'
              : 'text-muted-foreground';

    return (
        <div className="surface p-5">
            <dt className="overline">Direction</dt>
            <dd className={`mt-2 inline-flex items-center gap-2 text-sm font-semibold ${tone}`}>
                <Icon className="h-4 w-4" aria-hidden />
                {TREND_LABEL[trend]}
            </dd>
        </div>
    );
}

/** A plain proportion bar. No gradient, no animation — it is a number. */
function Bar({ percentage }: { percentage: number | null }) {
    if (percentage === null) return null;
    const clamped = Math.max(0, Math.min(100, percentage));
    const tone =
        clamped >= 65 ? 'var(--success)' : clamped >= 40 ? 'var(--accent)' : 'var(--ink-red)';

    return (
        <div
            className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary"
            role="img"
            aria-label={`${clamped}%`}
        >
            <div
                className="h-full rounded-full transition-[width] duration-500 ease-out"
                style={{ width: `${clamped}%`, background: tone }}
            />
        </div>
    );
}

function formatDate(iso: string | null): string | null {
    if (!iso) return null;
    try {
        return new Date(iso).toLocaleDateString('en-KE', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
    } catch {
        return null;
    }
}
