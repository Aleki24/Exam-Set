import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, PlayCircle, Settings2 } from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import ResourceShelf from '@/components/shop/ResourceShelf';
import ExamCountdown from '@/components/shop/ExamCountdown';
import OfflinePanel from '@/components/shop/OfflinePanel';
import { createClient } from '@/utils/supabase/server';
import { homeShelves, type Shelf } from '@/services/discoveryService';
import { loadLearnerProgress, EMPTY_PROGRESS, type LearnerProgress } from '@/services/progressService';
import { toAccountProfile, EMPTY_ACCOUNT_PROFILE, ACCOUNT_TYPE_BY_SLUG, teaches, type AccountProfile } from '@/lib/accounts';
import { LEVEL_BY_SLUG, type LevelSlug } from '@/lib/catalog';
import { subjectsForLevel } from '@/lib/resources';

export const metadata: Metadata = {
    title: 'Your home | Skulbase Exams',
    description: 'Your subjects, your unfinished papers, and resources picked for your class.',
};

/*
 * Reads cookies to know who is asking, so it can never be static. Said outright
 * rather than left to Next to infer through the try/catch below, which is
 * written to swallow outages and would swallow the inference too.
 */
export const dynamic = 'force-dynamic';

/**
 * HOME — the same library, arranged around the person looking at it.
 *
 * Everything here is reachable from `/learn` by anybody. All this page does is
 * decide what comes first: a teacher opens on planning material, a learner on
 * papers and notes. Nothing is hidden and nothing is unlocked, because an
 * account type is a preference and the moment it starts gating things it has
 * become a permission granted by a dropdown.
 *
 * Rendered on the server so a phone on mobile data gets a finished page rather
 * than a shell plus four fetches. Every shelf that came back empty is dropped
 * upstream, so a thin catalogue shows fewer headings rather than the same paper
 * three times under three confident ones.
 */
export default async function HomePage() {
    let account: AccountProfile = EMPTY_ACCOUNT_PROFILE;
    let shelves: Shelf[] = [];
    let progress: LearnerProgress = EMPTY_PROGRESS;
    let email: string | null = null;

    try {
        const supabase = await createClient();

        const { data: auth } = await supabase.auth.getUser();
        email = auth?.user?.email ?? null;

        if (auth?.user) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('account_type, level_slug, grade_label, subject_interests, school_name, onboarded_at')
                .eq('id', auth.user.id)
                .maybeSingle();
            account = toAccountProfile(profile);
        }

        // Shelves and progress do not depend on each other, and this page is the
        // first thing somebody sees after signing in.
        [shelves, progress] = await Promise.all([
            homeShelves(supabase, {
                level: account.level,
                grade: account.grade,
                subjects: account.subjects,
            }),
            loadLearnerProgress(supabase),
        ]);
    } catch (err) {
        console.error('Home unavailable:', err instanceof Error ? err.message : err);
    }

    const type = account.accountType ? ACCOUNT_TYPE_BY_SLUG[account.accountType] : undefined;
    const level = account.level ? LEVEL_BY_SLUG[account.level] : undefined;
    const needsSetup = !account.accountType || !account.level;

    const subjectList = account.level ? subjectsForLevel(account.level as LevelSlug) : [];
    const subjects =
        account.subjects.length > 0
            ? subjectList.filter((s) => account.subjects.includes(s.name))
            : subjectList;

    const unfinished = progress.unfinished.slice(0, 4);
    const greeting = email?.split('@')[0] ?? 'there';

    return (
        <div className="min-h-screen bg-background">
            <TopNav />

            <main className="shell-width py-10 sm:py-14">
                <header className="page-header">
                    <p className="overline">
                        {level
                            ? `${level.name}${account.grade ? ` · ${account.grade}` : ''}`
                            : 'Your library'}
                    </p>
                    <h1 className="display-2 mt-3">
                        {type ? headline(type.slug, account.grade) : `Welcome, ${greeting}`}
                    </h1>
                    <p className="lead mt-4">
                        {level
                            ? `Everything stocked for ${level.name}, with what you use most first.`
                            : 'Tell us the class you teach or learn in and this page arranges itself around it.'}
                    </p>
                </header>

                {needsSetup && <SetupPrompt hasType={Boolean(account.accountType)} />}

                {/* Renders nothing when there is no national exam at this level,
                    or no level chosen, or the calendar is past review. */}
                <ExamCountdown level={account.level} />

                {/* Unfinished papers first. It is the only thing on this page
                    that is an unfinished action rather than a suggestion, and
                    burying it under recommendations would be perverse. */}
                {unfinished.length > 0 && (
                    <section aria-labelledby="resume-heading" className="mt-12">
                        <h2 id="resume-heading" className="title-2">
                            Pick up where you left off
                        </h2>
                        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {unfinished.map((s, i) => (
                                <li key={s.sessionId}>
                                    <Link
                                        href={`/exam/${s.examId}`}
                                        className="sheet settle-in group flex h-full flex-col p-4"
                                        style={{ '--i': i % 12 } as React.CSSProperties}
                                    >
                                        <p className="overline">Unfinished</p>
                                        <h3 className="heading-ui mt-2 line-clamp-2 transition-colors group-hover:text-primary">
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

                {/* The discovery shelves. Each renders nothing when empty. */}
                {shelves.length > 0 && (
                    <div className="mt-14 space-y-14">
                        {shelves.map((shelf) => (
                            <ResourceShelf key={shelf.id} shelf={shelf} />
                        ))}
                    </div>
                )}

                {/* Their subjects, straight to the shelf. */}
                {level && subjects.length > 0 && (
                    <section aria-labelledby="subjects-heading" className="mt-16">
                        <h2 id="subjects-heading" className="title-2">
                            {account.subjects.length > 0
                                ? 'Your subjects'
                                : `Learning areas in ${level.name}`}
                        </h2>
                        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {subjects.map((s, index) => (
                                <li key={s.slug}>
                                    <Link
                                        href={`/learn/${level.slug}/${s.slug}`}
                                        className="sheet settle-in group flex items-center justify-between gap-3 p-4"
                                        style={{ '--i': index % 12 } as React.CSSProperties}
                                    >
                                        <span className="heading-ui transition-colors group-hover:text-primary">
                                            {s.name}
                                        </span>
                                        <ArrowRight
                                            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary"
                                            aria-hidden
                                        />
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {/* Progress, but only once there is any. An empty dashboard on a
                    home page is a chore nobody asked for. */}
                {progress.summary.papersCompleted > 0 && (
                    <section aria-labelledby="progress-heading" className="mt-16">
                        <h2 id="progress-heading" className="title-2">
                            {teaches(account.accountType) ? 'Papers you have sat' : 'Your progress'}
                        </h2>
                        <div className="mt-4 flex flex-wrap items-center gap-4 rounded-[var(--radius)] border border-border bg-card p-6">
                            <p className="figure text-sm">
                                <span className="text-2xl font-semibold">
                                    {progress.summary.papersCompleted}
                                </span>{' '}
                                <span className="text-muted-foreground">completed</span>
                            </p>
                            {progress.summary.averagePercentage !== null && (
                                <p className="figure text-sm">
                                    <span className="text-2xl font-semibold">
                                        {progress.summary.averagePercentage}%
                                    </span>{' '}
                                    <span className="text-muted-foreground">average</span>
                                </p>
                            )}
                            <div className="flex-1" />
                            <Link href="/progress" className="btn-outline btn-sm">
                                See the breakdown
                            </Link>
                        </div>
                    </section>
                )}

                {/* Client-only: both lists live in localStorage, and rendering
                    them on the server would ship markup that is wrong on
                    arrival and corrected a frame later. */}
                <OfflinePanel />

                <div className="mt-16 border-t border-border pt-8">
                    <Link
                        href="/learn"
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
                    >
                        Browse the whole library
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                </div>
            </main>
        </div>
    );
}

function headline(type: string, grade: string | null): string {
    switch (type) {
        case 'teacher':
            return grade ? `Your ${grade} staffroom` : 'Your staffroom';
        case 'institution':
            return 'Your school library';
        case 'parent':
            return grade ? `${grade} — what to work on` : 'Support your learner';
        default:
            return grade ? `${grade} revision` : 'Your revision';
    }
}

/**
 * Shown until we know enough to arrange the page.
 *
 * Says what it will do with the answer rather than demanding one. A prompt that
 * cannot explain why it is asking reads as data collection, and on a product
 * schools pay for that is the wrong first impression.
 */
function SetupPrompt({ hasType }: { hasType: boolean }) {
    return (
        <section className="ruled mt-10 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius)] border border-border p-6">
            <div className="min-w-0">
                <h2 className="heading-ui">{hasType ? 'Which class?' : 'Set up your library'}</h2>
                <p className="meta mt-1 leading-relaxed">
                    {hasType
                        ? 'Pick a level and we will open on the right shelf every time.'
                        : 'Two questions — who you are and which class. Everything here rearranges to match.'}
                </p>
            </div>
            <Link href="/account?welcome=1" className="btn-primary btn-sm shrink-0">
                <Settings2 className="h-3.5 w-3.5" aria-hidden />
                {hasType ? 'Choose a level' : 'Set it up'}
            </Link>
        </section>
    );
}
