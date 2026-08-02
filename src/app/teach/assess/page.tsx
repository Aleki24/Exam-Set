'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, CloudOff, Download, Loader2, Plus, RefreshCw } from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import {
    PERFORMANCE_LEVELS,
    LEVEL_TONE,
    completeness,
    toExportRows,
    toCsv,
    type PerformanceLevel,
    type LearningOutcome,
} from '@/lib/cbaRubric';
import {
    loadSheet,
    setScore,
    replaceSheet,
    syncQueue,
    queueSize,
    storageUsage,
    type ScoreSheet,
} from '@/lib/cbaOfflineStore';

interface Learner {
    id: string;
    name: string;
    admissionNumber?: string | null;
}

interface ClassGroup {
    id: string;
    name: string;
    gradeLabel?: string | null;
    learningArea?: string | null;
    learners: Learner[];
}

interface Assessment {
    id: string;
    classId: string;
    title: string;
    outcomes: LearningOutcome[];
    dueOn?: string | null;
}

/**
 * SCORING A CLASS
 *
 * Built for a teacher standing in a classroom on a phone with no signal.
 *
 * Every tap writes to the device first and syncs afterwards. That ordering is
 * the whole feature: scoring a class is a period of work that cannot be asked
 * for twice, and anything network-first loses it the moment the connection goes
 * — with the teacher finding out at the end.
 *
 * The completeness check exists for the same reason. Finding a gap here, with
 * the class in front of you, costs a minute. Finding it at the KNEC portal on
 * deadline day costs a guessed score, because the learner has gone home.
 */
export default function AssessPage() {
    const [classes, setClasses] = useState<ClassGroup[]>([]);
    const [assessments, setAssessments] = useState<Assessment[]>([]);
    const [activeClass, setActiveClass] = useState<string | null>(null);
    const [activeAssessment, setActiveAssessment] = useState<string | null>(null);
    const [sheet, setSheet] = useState<ScoreSheet>({});

    const [loading, setLoading] = useState(true);
    const [online, setOnline] = useState(true);
    const [pending, setPending] = useState(0);
    const [syncing, setSyncing] = useState(false);

    // ---------------------------------------------------------------- loading

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const [classRes, assessRes] = await Promise.all([
                    fetch('/api/cba/classes').then((r) => r.json()),
                    fetch('/api/cba/assessments').then((r) => r.json()),
                ]);
                if (cancelled) return;

                setClasses(classRes.classes ?? []);
                setAssessments(assessRes.assessments ?? []);

                const firstClass = classRes.classes?.[0];
                if (firstClass) setActiveClass(firstClass.id);
            } catch {
                if (!cancelled) toast.error('Could not load your classes');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        setOnline(typeof navigator === 'undefined' || navigator.onLine !== false);
        setPending(queueSize());

        const up = () => setOnline(true);
        const down = () => setOnline(false);
        window.addEventListener('online', up);
        window.addEventListener('offline', down);
        return () => {
            cancelled = true;
            window.removeEventListener('online', up);
            window.removeEventListener('offline', down);
        };
    }, []);

    /**
     * Loads a sheet, device first.
     *
     * The local copy is shown immediately and the server is merged underneath
     * it, never over it. Anything captured offline and not yet synced is newer
     * than whatever the server has, and letting a fetch overwrite it would
     * discard exactly the work this feature exists to protect.
     */
    const openAssessment = useCallback(async (assessmentId: string) => {
        setActiveAssessment(assessmentId);
        const local = loadSheet(assessmentId);
        setSheet(local);

        try {
            const res = await fetch(`/api/cba/${assessmentId}/scores`);
            if (!res.ok) return;
            const data = await res.json();

            const merged: ScoreSheet = { ...(data.sheet ?? {}) };
            for (const [learnerId, row] of Object.entries(local)) {
                merged[learnerId] = { ...(merged[learnerId] ?? {}), ...row };
            }
            replaceSheet(assessmentId, merged);
            setSheet(merged);
        } catch {
            // Offline. The local sheet is already on screen and is the one that
            // matters right now.
        }
    }, []);

    // ---------------------------------------------------------------- scoring

    const score = (learnerId: string, outcomeId: string, level: PerformanceLevel) => {
        if (!activeAssessment) return;

        const saved = setScore(activeAssessment, learnerId, outcomeId, level);
        if (!saved) {
            toast.error('That score did not save on this device. Check your storage.');
            return;
        }

        setSheet((current) => ({
            ...current,
            [learnerId]: { ...(current[learnerId] ?? {}), [outcomeId]: level },
        }));
        setPending(queueSize());
    };

    const sync = async () => {
        setSyncing(true);
        try {
            const { sent, failed } = await syncQueue();
            setPending(queueSize());
            if (failed > 0) {
                toast.warning(`${sent} saved, ${failed} still waiting`, {
                    description: 'They are kept on this phone and will go up when you have signal.',
                });
            } else if (sent > 0) {
                toast.success(`${sent} score${sent === 1 ? '' : 's'} saved`);
            }
        } finally {
            setSyncing(false);
        }
    };

    // Sync whenever the connection comes back, without being asked.
    useEffect(() => {
        if (online && pending > 0 && !syncing) void sync();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [online]);

    // ------------------------------------------------------------- derivation

    const currentClass = classes.find((c) => c.id === activeClass) ?? null;
    const classAssessments = assessments.filter((a) => a.classId === activeClass);
    const assessment = assessments.find((a) => a.id === activeAssessment) ?? null;

    const learners = currentClass?.learners ?? [];
    const outcomes = assessment?.outcomes ?? [];

    const done = useMemo(
        () => completeness(learners.map((l) => l.id), outcomes, sheet),
        [learners, outcomes, sheet]
    );

    const usage = typeof window !== 'undefined' ? storageUsage() : { bytes: 0, nearLimit: false };

    const exportCsv = () => {
        if (!assessment || !currentClass) return;
        const csv = toCsv(toExportRows(learners, outcomes, sheet));
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentClass.name}-${assessment.title}`.replace(/[^\w-]+/g, '-').toLowerCase() + '.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-background">
                <TopNav />
                <main className="shell-width grid place-items-center py-32">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <TopNav />

            <main className="shell-width py-10 sm:py-14">
                <header className="max-w-2xl">
                    <p className="overline">School based assessment</p>
                    <h1 className="display-2 mt-3">Score your class</h1>
                    <p className="lead mt-4">
                        Works with no signal. Every tap is saved on this phone and goes up when you
                        are back online — so you can score in the classroom and key it into the KNEC
                        portal once, later.
                    </p>
                </header>

                {/* Connection and queue, stated rather than hidden. A teacher
                    needs to know their work is held, not to assume it. */}
                <div className="mt-8 flex flex-wrap items-center gap-3">
                    <span
                        className={`chip ${online ? '' : 'border-[color:var(--accent)]/50'}`}
                        aria-live="polite"
                    >
                        {online ? (
                            <>
                                <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden />
                                Online
                            </>
                        ) : (
                            <>
                                <CloudOff className="h-3.5 w-3.5 text-[color:var(--accent)]" aria-hidden />
                                No signal — still saving
                            </>
                        )}
                    </span>

                    {pending > 0 && (
                        <button type="button" onClick={sync} disabled={syncing || !online} className="chip">
                            {syncing ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            ) : (
                                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                            )}
                            {pending} waiting to sync
                        </button>
                    )}

                    {usage.nearLimit && (
                        <span className="chip border-[color:var(--ink-red)]/50">
                            <AlertTriangle className="h-3.5 w-3.5 text-[color:var(--ink-red)]" aria-hidden />
                            This phone is nearly full — sync soon
                        </span>
                    )}
                </div>

                {classes.length === 0 ? (
                    <EmptyClasses />
                ) : (
                    <>
                        <section aria-labelledby="class-heading" className="mt-10">
                            <h2 id="class-heading" className="overline">
                                Class
                            </h2>
                            <ul className="mt-3 flex flex-wrap gap-2">
                                {classes.map((c) => (
                                    <li key={c.id}>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setActiveClass(c.id);
                                                setActiveAssessment(null);
                                                setSheet({});
                                            }}
                                            aria-pressed={activeClass === c.id}
                                            className={activeClass === c.id ? 'chip chip-active' : 'chip'}
                                        >
                                            {c.name}
                                            <span className="figure ml-1 text-[10px] opacity-70">
                                                {c.learners.length}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                                <li>
                                    <Link href="/teach/assess/new" className="chip">
                                        <Plus className="h-3.5 w-3.5" aria-hidden />
                                        New class
                                    </Link>
                                </li>
                            </ul>
                        </section>

                        {currentClass && (
                            <section aria-labelledby="assessment-heading" className="mt-8">
                                <h2 id="assessment-heading" className="overline">
                                    Assessment
                                </h2>
                                {classAssessments.length === 0 ? (
                                    <p className="meta mt-3">
                                        Nothing set for {currentClass.name} yet.{' '}
                                        <Link
                                            href={`/teach/assess/new?class=${currentClass.id}`}
                                            className="text-primary hover:underline"
                                        >
                                            Set one up
                                        </Link>
                                        .
                                    </p>
                                ) : (
                                    <ul className="mt-3 flex flex-wrap gap-2">
                                        {classAssessments.map((a) => (
                                            <li key={a.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => openAssessment(a.id)}
                                                    aria-pressed={activeAssessment === a.id}
                                                    className={
                                                        activeAssessment === a.id ? 'chip chip-active' : 'chip'
                                                    }
                                                >
                                                    {a.title}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>
                        )}

                        {assessment && learners.length > 0 && (
                            <>
                                <section aria-labelledby="grid-heading" className="mt-10">
                                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                                        <h2 id="grid-heading" className="title-2">
                                            {assessment.title}
                                        </h2>
                                        <span className="figure text-[11px] text-muted-foreground">
                                            {done.scored} of {done.expected} scored
                                        </span>
                                    </div>

                                    <Legend />

                                    <div className="mt-4 space-y-3">
                                        {learners.map((learner) => (
                                            <LearnerRow
                                                key={learner.id}
                                                learner={learner}
                                                outcomes={outcomes}
                                                row={sheet[learner.id] ?? {}}
                                                onScore={(outcomeId, level) =>
                                                    score(learner.id, outcomeId, level)
                                                }
                                            />
                                        ))}
                                    </div>
                                </section>

                                <Ready done={done} learners={learners} onExport={exportCsv} />
                            </>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}

/**
 * One learner, one row of outcomes.
 *
 * Four tap targets per outcome rather than a dropdown. A dropdown is two taps
 * and a scroll per cell, and a class of fifty against eight outcomes is four
 * hundred cells — the difference between a tool used in the classroom and one
 * used at home from paper notes.
 */
function LearnerRow({
    learner,
    outcomes,
    row,
    onScore,
}: {
    learner: Learner;
    outcomes: LearningOutcome[];
    row: Record<string, PerformanceLevel | undefined>;
    onScore: (outcomeId: string, level: PerformanceLevel) => void;
}) {
    const scored = outcomes.filter((o) => row[o.id]).length;
    const complete = scored === outcomes.length;

    return (
        <article className={`sheet p-4 ${complete ? '' : 'border-dashed'}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h3 className="heading-ui">
                    {learner.admissionNumber && (
                        <span className="figure mr-2 text-[11px] text-muted-foreground">
                            {learner.admissionNumber}
                        </span>
                    )}
                    {learner.name}
                </h3>
                <span className="figure text-[11px] text-muted-foreground">
                    {scored}/{outcomes.length}
                </span>
            </div>

            <div className="mt-3 space-y-3">
                {outcomes.map((outcome) => (
                    <div key={outcome.id}>
                        <p className="meta">{outcome.title}</p>
                        <div className="rail-x mt-1.5 -mx-1 px-1">
                            {PERFORMANCE_LEVELS.map((level) => {
                                const active = row[outcome.id] === level.code;
                                return (
                                    <button
                                        key={level.code}
                                        type="button"
                                        onClick={() => onScore(outcome.id, level.code)}
                                        aria-pressed={active}
                                        aria-label={`${learner.name}: ${outcome.title} — ${level.name}`}
                                        title={level.descriptor}
                                        className="min-h-11 shrink-0 rounded-[var(--radius)] border px-3 text-xs font-semibold transition-colors duration-150"
                                        style={
                                            active
                                                ? {
                                                      background: LEVEL_TONE[level.code],
                                                      borderColor: LEVEL_TONE[level.code],
                                                      color: 'white',
                                                  }
                                                : undefined
                                        }
                                    >
                                        {level.code}
                                        <span className="ml-1.5 font-normal opacity-80">
                                            {level.short}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </article>
    );
}

function Legend() {
    return (
        <dl className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-4">
            {PERFORMANCE_LEVELS.map((level) => (
                <div key={level.code} className="flex items-baseline gap-2">
                    <dt
                        className="figure shrink-0 text-[11px] font-bold"
                        style={{ color: LEVEL_TONE[level.code] }}
                    >
                        {level.code}
                    </dt>
                    <dd className="meta">{level.name}</dd>
                </div>
            ))}
        </dl>
    );
}

/**
 * Whether this can go to the portal yet.
 *
 * Names who is missing rather than saying "incomplete". A teacher with a gap
 * needs to know which child to go back to, and a count alone sends them
 * hunting through fifty rows.
 */
function Ready({
    done,
    learners,
    onExport,
}: {
    done: ReturnType<typeof completeness>;
    learners: Learner[];
    onExport: () => void;
}) {
    const missingNames = done.incompleteLearners
        .map((id) => learners.find((l) => l.id === id)?.name)
        .filter(Boolean)
        .slice(0, 6);

    return (
        <section className="ruled mt-10 rounded-[var(--radius)] border border-border p-6">
            <h2 className="title-2">
                {done.complete ? 'Ready for the portal' : 'Not finished yet'}
            </h2>

            {done.complete ? (
                <p className="lead mt-2">
                    Every learner is scored against every outcome. Export it and key it in — the
                    portal is busiest on the last day, so sooner is safer.
                </p>
            ) : (
                <>
                    <p className="lead mt-2">
                        {done.missing} score{done.missing === 1 ? '' : 's'} still missing.
                    </p>
                    {missingNames.length > 0 && (
                        <p className="meta mt-2">
                            Still to finish: {missingNames.join(', ')}
                            {done.incompleteLearners.length > missingNames.length &&
                                ` and ${done.incompleteLearners.length - missingNames.length} more`}
                        </p>
                    )}
                </>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
                <button
                    type="button"
                    onClick={onExport}
                    className={done.complete ? 'btn-primary' : 'btn-outline'}
                >
                    <Download className="h-4 w-4" aria-hidden />
                    Export CSV
                </button>
            </div>

            {!done.complete && (
                <p className="meta mt-3">
                    You can still export — the missing cells come out blank, so you can see the gaps
                    on paper.
                </p>
            )}
        </section>
    );
}

function EmptyClasses() {
    return (
        <div className="ruled mt-12 rounded-[var(--radius)] border border-border p-10 text-center">
            <h2 className="title-1">Add your class first</h2>
            <p className="lead mx-auto mt-3 max-w-md">
                Paste your register — one name per line, admission numbers first if you have them —
                and you can start scoring straight away.
            </p>
            <div className="mt-6">
                <Link href="/teach/assess/new" className="btn-primary">
                    <Plus className="h-4 w-4" aria-hidden />
                    Add a class
                </Link>
            </div>
        </div>
    );
}
