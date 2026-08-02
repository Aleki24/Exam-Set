'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Loader2, Settings2 } from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import { useRole } from '@/lib/roles';
import { ACCOUNT_TYPE_BY_SLUG, teaches } from '@/lib/accounts';
import { LEVEL_BY_SLUG, type LevelSlug } from '@/lib/catalog';
import {
    RESOURCE_FAMILIES,
    FAMILY_AUDIENCE,
    kindsForLevel,
    subjectsForLevel,
    type ResourceFamily,
} from '@/lib/resources';

/**
 * HOME — the same library, arranged around the person looking at it.
 *
 * Everything here is reachable from `/learn` by anyone. The only thing this
 * page does is put the right shelf at the top: a teacher opens on schemes of
 * work and lesson plans, a learner on past papers and notes. Nothing is hidden
 * and nothing is unlocked — an account type is a preference, not a permission,
 * and the moment it starts gating things it becomes a privilege granted by a
 * dropdown.
 *
 * When somebody has told us nothing, this degrades to a plain welcome with the
 * question attached, rather than guessing and being wrong at them.
 */
export default function HomePage() {
    const { ready, signedIn, account, needsOnboarding, email } = useRole();

    if (!ready) {
        return (
            <div className="min-h-screen bg-background">
                <TopNav />
                <main className="shell-width grid place-items-center py-32">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
                </main>
            </div>
        );
    }

    const type = account.accountType ? ACCOUNT_TYPE_BY_SLUG[account.accountType] : undefined;
    const level = account.level ? LEVEL_BY_SLUG[account.level] : undefined;

    // What to lead with. Falls back to the natural taxonomy order when we have
    // not been told who they are, which is the same order `/learn` uses.
    const leadFamilies: ResourceFamily[] = type?.leadFamilies ?? RESOURCE_FAMILIES;
    const orderedFamilies = [
        ...leadFamilies,
        ...RESOURCE_FAMILIES.filter((f) => !leadFamilies.includes(f)),
    ];

    const kinds = kindsForLevel((account.level as LevelSlug) ?? null);

    // Their chosen subjects, or the whole learning area list when they picked
    // none. "None chosen" means "no preference", not "no subjects".
    const subjectList = account.level ? subjectsForLevel(account.level as LevelSlug) : [];
    const subjects =
        account.subjects.length > 0
            ? subjectList.filter((s) => account.subjects.includes(s.name))
            : subjectList;

    const greetingName = email?.split('@')[0] ?? 'there';

    return (
        <div className="min-h-screen bg-background">
            <TopNav />

            <main className="shell-width py-10 sm:py-14">
                <header className="max-w-2xl">
                    <p className="overline">
                        {level ? `${level.name}${account.grade ? ` · ${account.grade}` : ''}` : 'Your library'}
                    </p>
                    <h1 className="display-2 mt-3">
                        {type ? headline(type.slug, account.grade) : `Welcome, ${greetingName}`}
                    </h1>
                    <p className="lead mt-4">
                        {level
                            ? `Everything stocked for ${level.name}, with what you use most first.`
                            : 'Tell us the class you teach or learn in and this page arranges itself around it.'}
                    </p>
                </header>

                {(needsOnboarding || !account.accountType || !account.level) && (
                    <SetupPrompt hasType={Boolean(account.accountType)} />
                )}

                {/* Their subjects, straight to the shelf. */}
                {level && subjects.length > 0 && (
                    <section aria-labelledby="subjects-heading" className="mt-12">
                        <h2 id="subjects-heading" className="overline">
                            {account.subjects.length > 0 ? 'Your subjects' : `Learning areas in ${level.name}`}
                        </h2>
                        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {subjects.map((s, index) => (
                                <li key={s.slug}>
                                    <Link
                                        href={`/learn/${level.slug}/${s.slug}`}
                                        className="sheet settle-in group flex items-center justify-between gap-3 p-5"
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

                {/* Kinds, in the order this person cares about them. */}
                <section aria-labelledby="kinds-heading" className="mt-16">
                    <h2 id="kinds-heading" className="overline">
                        {teaches(account.accountType) ? 'For your planning' : 'For your revision'}
                    </h2>

                    <div className="mt-4 space-y-8">
                        {orderedFamilies.map((family) => {
                            const inFamily = kinds.filter((k) => k.family === family);
                            if (inFamily.length === 0) return null;

                            return (
                                <div key={family}>
                                    <h3 className="heading-ui">{family}</h3>
                                    <p className="meta mt-1">{FAMILY_AUDIENCE[family]}</p>

                                    <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        {inFamily.map((kind) => (
                                            <li key={kind.slug}>
                                                <Link
                                                    href={
                                                        account.level
                                                            ? `/?level=${account.level}&kind=${kind.slug}`
                                                            : `/?kind=${kind.slug}`
                                                    }
                                                    className="surface group block h-full p-5 transition-colors duration-200 hover:border-primary/40"
                                                >
                                                    <h4 className="heading-ui transition-colors group-hover:text-primary">
                                                        {kind.plural}
                                                    </h4>
                                                    <p className="meta mt-1.5 leading-relaxed">
                                                        {kind.description}
                                                    </p>
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            );
                        })}
                    </div>
                </section>

                {!signedIn && (
                    <p className="meta mt-12">
                        <Link href="/auth/login" className="text-primary hover:underline">
                            Sign in
                        </Link>{' '}
                        to keep your library arranged this way.
                    </p>
                )}
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
                <h2 className="heading-ui">
                    {hasType ? 'Which class?' : 'Set up your library'}
                </h2>
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
