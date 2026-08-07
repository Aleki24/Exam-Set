import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import Footer from '@/components/shell/Footer';
import { LEVELS } from '@/lib/catalog';
import { RESOURCE_FAMILIES, FAMILY_AUDIENCE, RESOURCE_KINDS } from '@/lib/resources';
import { subjectsForLevel } from '@/lib/resources';

export const metadata: Metadata = {
    title: 'Library — every resource, Playgroup to Form 4 | Skulbase Exams',
    description:
        'Browse exam papers, marking schemes, revision notes, schemes of work, lesson plans, set-book guides and curriculum designs for the whole Kenyan curriculum.',
};

/**
 * THE LIBRARY HUB — the second door into the catalogue.
 *
 * The shop at `/` is search and filters, and it serves anyone who already knows
 * what they want. This serves everyone else. A parent knows their child is in
 * Grade 4; they do not know what a "summative assessment" is, and a filter rail
 * opening with twenty-six exam types is a wall to them. So this page asks the
 * one question every visitor can answer — which class? — and asks nothing else
 * until that is settled.
 *
 * Rendered on the server with no data fetching at all. The curriculum is known
 * in advance, so the shape of the library never has to be waited for: on a
 * Kenyan mobile connection this page is HTML and nothing else, and it is
 * complete the moment it arrives.
 */
export default function LearnHubPage() {
    return (
        <div className="min-h-screen bg-background">
            <TopNav />

            <main className="shell-width py-10 sm:py-14">
                <header className="max-w-2xl">
                    <p className="overline">The library</p>
                    <h1 className="display-2 mt-3">Everything a Kenyan classroom needs</h1>
                    <p className="lead mt-4">
                        Papers and marking schemes, revision notes, schemes of work, lesson plans,
                        set-book guides and curriculum designs — from baby class to Form 4. Start
                        with the class you teach or learn in.
                    </p>
                </header>

                {/* Levels: the only question the page asks. */}
                <section aria-labelledby="levels-heading" className="mt-12">
                    <h2 id="levels-heading" className="overline">
                        Choose a level
                    </h2>

                    <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {LEVELS.map((level, index) => {
                            const subjects = subjectsForLevel(level.slug);
                            return (
                                <li key={level.slug}>
                                    <Link
                                        href={`/learn/${level.slug}`}
                                        className="sheet settle-in group flex h-full flex-col p-4"
                                        style={{ '--i': index % 12 } as React.CSSProperties}
                                    >
                                        <p className="overline">{level.curriculum}</p>

                                        <h3 className="title-2 mt-3 transition-colors group-hover:text-primary">
                                            {level.name}
                                        </h3>

                                        <p className="meta mt-2">{level.blurb}</p>

                                        <div className="flex-1" />

                                        <p className="figure mt-5 text-[11px] text-muted-foreground">
                                            {level.grades.join(' · ')}
                                        </p>

                                        <p className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
                                            <span className="figure text-[11px] text-muted-foreground">
                                                {subjects.length} learning areas
                                            </span>
                                            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                                                Open
                                                <ArrowRight
                                                    className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                                                    aria-hidden
                                                />
                                            </span>
                                        </p>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </section>

                {/* What a level contains, explained once rather than on every page. */}
                <section aria-labelledby="kinds-heading" className="mt-16">
                    <h2 id="kinds-heading" className="overline">
                        What you will find inside
                    </h2>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {RESOURCE_FAMILIES.map((family) => {
                            const kinds = RESOURCE_KINDS.filter((k) => k.family === family);
                            return (
                                <article key={family} className="surface p-5">
                                    <h3 className="heading-ui">{family}</h3>
                                    <p className="meta mt-1">{FAMILY_AUDIENCE[family]}</p>

                                    <ul className="mt-4 flex flex-wrap gap-1.5">
                                        {kinds.map((kind) => (
                                            <li key={kind.slug} className="badge-soft">
                                                {kind.name}
                                            </li>
                                        ))}
                                    </ul>
                                </article>
                            );
                        })}
                    </div>
                </section>

                {/* The other door, named plainly rather than hidden. */}
                <section className="ruled mt-16 rounded-[var(--radius)] border border-border p-8 text-center">
                    <h2 className="title-1">Already know what you need?</h2>
                    <p className="lead mx-auto mt-3 max-w-lg">
                        Search the whole catalogue at once, or build your own paper from the
                        question bank.
                    </p>
                    <div className="mt-6 flex flex-wrap justify-center gap-3">
                        <Link href="/catalog" className="btn-primary">
                            Search every paper
                        </Link>
                        <Link href="/set" className="btn-outline">
                            Set your own exam
                        </Link>
                    </div>
                </section>
            </main>
            <Footer />
        </div>
    );
}
