'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Loader2 } from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import LinkWhatsApp from '@/components/account/LinkWhatsApp';
import { ACCOUNT_TYPES, type AccountType } from '@/lib/accounts';
import { LEVELS, LEVEL_BY_SLUG, type LevelSlug } from '@/lib/catalog';
import { subjectsForLevel } from '@/lib/resources';

/**
 * WHO ARE YOU — asked once, changeable for ever.
 *
 * Four questions, and three of them are optional. Every extra field here is
 * another reason to abandon a form that exists only to make the next page
 * better, so the shape is: pick a type, pick a class, pick some subjects if you
 * can be bothered, done.
 *
 * Nothing chosen here grants anything. It decides which shelf opens first and
 * which resources are suggested — permissions live in the role an owner grants
 * and are enforced by row level security, which no form can reach.
 */
/**
 * `useSearchParams` opts a page out of static rendering unless it sits behind a
 * Suspense boundary, and Next fails the build rather than letting it ship — so
 * the shell renders immediately and only the part that reads `?welcome=1`
 * waits. On a slow connection that difference is the whole page appearing at
 * once versus nothing appearing at all.
 */
export default function AccountPage() {
    return (
        <Suspense fallback={<AccountFallback />}>
            <AccountForm />
        </Suspense>
    );
}

function AccountFallback() {
    return (
        <div className="min-h-screen bg-background">
            <TopNav />
            <main className="shell-width grid place-items-center py-32">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
            </main>
        </div>
    );
}

function AccountForm() {
    const router = useRouter();
    const params = useSearchParams();
    const onboarding = params.get('welcome') === '1';

    const [accountType, setAccountType] = useState<AccountType | null>(null);
    const [level, setLevel] = useState<LevelSlug | null>(null);
    const [grade, setGrade] = useState<string | null>(null);
    const [subjects, setSubjects] = useState<string[]>([]);
    const [school, setSchool] = useState('');

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/account')
            .then((r) => r.json())
            .then((data) => {
                if (cancelled) return;
                if (data.error) {
                    // Signed out is the ordinary case here, not a fault worth
                    // shouting about: the middleware is already sending them to
                    // sign in and a toast would arrive on a page they are
                    // leaving.
                    setLoading(false);
                    return;
                }
                const a = data.account;
                setAccountType(a.accountType);
                setLevel(a.level);
                setGrade(a.grade);
                setSubjects(a.subjects ?? []);
                setSchool(a.school ?? '');
                setLoading(false);
            })
            .catch(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
    }, []);

    const levelDef = level ? LEVEL_BY_SLUG[level] : undefined;
    const availableSubjects = useMemo(() => (level ? subjectsForLevel(level) : []), [level]);

    // Changing level invalidates both the grade and the subjects, because a
    // Grade 9 chosen under Junior School is nonsense under Form 1-4 and silently
    // keeping it is how a profile ends up describing a class that cannot exist.
    const changeLevel = (next: LevelSlug | null) => {
        setLevel(next);
        setGrade(null);
        setSubjects([]);
    };

    const toggleSubject = (name: string) => {
        setSubjects((current) =>
            current.includes(name) ? current.filter((s) => s !== name) : [...current, name]
        );
    };

    const save = async (skip = false) => {
        setSaving(true);
        try {
            const res = await fetch('/api/account', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(
                    skip
                        ? { account_type: accountType }
                        : {
                              account_type: accountType,
                              level_slug: level,
                              grade_label: grade,
                              subject_interests: subjects,
                              school_name: school.trim() || null,
                          }
                ),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not save');

            toast.success(onboarding ? 'All set' : 'Saved');
            router.push(onboarding ? '/home' : '/account');
            router.refresh();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not save');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <AccountFallback />;

    return (
        <div className="min-h-screen bg-background">
            <TopNav />

            <main className="shell-width max-w-3xl py-10 sm:py-14">
                <header>
                    <p className="overline">{onboarding ? 'Welcome' : 'Your account'}</p>
                    <h1 className="display-2 mt-3">
                        {onboarding ? 'Tell us who you are' : 'Who you are'}
                    </h1>
                    <p className="lead mt-4">
                        This decides what we put first — nothing is ever hidden from you, and you
                        can change any of it later.
                    </p>
                </header>

                <section aria-labelledby="type-heading" className="mt-12">
                    <h2 id="type-heading" className="overline">
                        Which are you?
                    </h2>

                    <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                        {ACCOUNT_TYPES.map((type) => {
                            const active = accountType === type.slug;
                            return (
                                <li key={type.slug}>
                                    <button
                                        type="button"
                                        onClick={() => setAccountType(type.slug)}
                                        aria-pressed={active}
                                        className={`sheet w-full p-5 text-left transition-colors duration-200 ${
                                            active ? 'border-primary bg-primary/[0.06]' : ''
                                        }`}
                                    >
                                        <span className="flex items-start justify-between gap-3">
                                            <span className="heading-ui">{type.label}</span>
                                            {active && (
                                                <Check
                                                    className="h-4 w-4 shrink-0 text-primary"
                                                    aria-hidden
                                                />
                                            )}
                                        </span>
                                        <span className="meta mt-1.5 block leading-relaxed">
                                            {type.blurb}
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </section>

                <section aria-labelledby="level-heading" className="mt-12">
                    <h2 id="level-heading" className="overline">
                        {accountType === 'parent'
                            ? "Your child's level"
                            : accountType === 'teacher' || accountType === 'institution'
                              ? 'The level you teach'
                              : 'Your level'}
                    </h2>

                    <ul className="mt-4 flex flex-wrap gap-2">
                        {LEVELS.map((l) => (
                            <li key={l.slug}>
                                <button
                                    type="button"
                                    onClick={() => changeLevel(level === l.slug ? null : l.slug)}
                                    aria-pressed={level === l.slug}
                                    className={level === l.slug ? 'chip chip-active' : 'chip'}
                                >
                                    {l.name}
                                </button>
                            </li>
                        ))}
                    </ul>

                    {levelDef && (
                        <>
                            <h3 className="overline mt-8">Class</h3>
                            <ul className="mt-3 flex flex-wrap gap-2">
                                {levelDef.grades.map((g) => (
                                    <li key={g}>
                                        <button
                                            type="button"
                                            onClick={() => setGrade(grade === g ? null : g)}
                                            aria-pressed={grade === g}
                                            className={grade === g ? 'chip chip-active' : 'chip'}
                                        >
                                            {g}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </section>

                {availableSubjects.length > 0 && (
                    <section aria-labelledby="subjects-heading" className="mt-12">
                        <h2 id="subjects-heading" className="overline">
                            Subjects <span className="normal-case tracking-normal">(optional)</span>
                        </h2>
                        <p className="meta mt-2">Pick any that matter. Leave it blank for all of them.</p>

                        <ul className="mt-4 flex flex-wrap gap-2">
                            {availableSubjects.map((s) => (
                                <li key={s.slug}>
                                    <button
                                        type="button"
                                        onClick={() => toggleSubject(s.name)}
                                        aria-pressed={subjects.includes(s.name)}
                                        className={subjects.includes(s.name) ? 'chip chip-active' : 'chip'}
                                    >
                                        {s.name}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {(accountType === 'teacher' || accountType === 'institution') && (
                    <section aria-labelledby="school-heading" className="mt-12">
                        <h2 id="school-heading" className="overline">
                            School <span className="normal-case tracking-normal">(optional)</span>
                        </h2>
                        <input
                            id="school"
                            type="text"
                            value={school}
                            onChange={(e) => setSchool(e.target.value)}
                            placeholder="e.g. Nairobi Junior Academy"
                            maxLength={160}
                            className="field mt-3"
                        />
                    </section>
                )}

                {/* Not during onboarding. The welcome pass exists to be finished
                    in four taps, and a second, unrelated thing to do is how a
                    form that was nearly done gets abandoned. It is waiting on
                    /account the moment they want it. */}
                {!onboarding && <LinkWhatsApp />}

                <div className="mt-12 flex flex-wrap items-center gap-3 border-t border-border pt-8">
                    <button
                        type="button"
                        onClick={() => save(false)}
                        disabled={saving || !accountType}
                        className="btn-primary"
                    >
                        {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                        {onboarding ? 'Continue' : 'Save changes'}
                    </button>

                    {onboarding && (
                        <button
                            type="button"
                            onClick={() => save(true)}
                            disabled={saving}
                            className="btn-ghost"
                        >
                            Skip for now
                        </button>
                    )}

                    {!accountType && (
                        <p className="meta">Choose which you are to continue.</p>
                    )}
                </div>
            </main>
        </div>
    );
}
