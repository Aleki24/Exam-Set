import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, ChevronRight } from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import Footer from '@/components/shell/Footer';
import { LEVELS, LEVEL_BY_SLUG, gradeSlug, type LevelSlug } from '@/lib/catalog';
import { kindFamiliesForLevel } from '@/lib/resources';

interface Params {
    params: Promise<{ level: string }>;
}

/** Every level is known ahead of time, so all seven pages are static HTML. */
export function generateStaticParams() {
    return LEVELS.map((level) => ({ level: level.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
    const { level: slug } = await params;
    const level = LEVEL_BY_SLUG[slug];
    if (!level) return { title: 'Not found' };

    return {
        title: `${level.name} resources — ${level.grades.join(', ')} | Skulbase Exams`,
        description: `${level.blurb}. Exams, marking schemes, notes, schemes of work and lesson plans for ${level.grades.join(', ')}.`,
    };
}

/**
 * ONE LEVEL — the classes in it.
 *
 * This page used to jump straight to learning areas, which skipped the step a
 * teacher actually starts from. Nobody teaches Junior School; they teach Grade
 * 8. Picking the class first means every list after it is the one class's, so
 * "Mathematics" is a shelf a teacher can use rather than three years of it to
 * read past.
 *
 * Three or four choices, each of them large, because this is a fork in the road
 * and not a menu to scan.
 */
export default async function LevelPage({ params }: Params) {
    const { level: slug } = await params;
    const level = LEVEL_BY_SLUG[slug];
    if (!level) notFound();

    const families = kindFamiliesForLevel(level.slug as LevelSlug);

    return (
        <div className="min-h-screen bg-background">
            <TopNav />

            <main className="shell-width py-10 sm:py-14">
                <Breadcrumb level={level.name} />

                <header className="page-header mt-6">
                    <p className="overline">{level.curriculum} · {level.short}</p>
                    <h1 className="display-2 mt-3">{level.name}</h1>
                    <p className="lead mt-4">{level.blurb}.</p>
                    <p className="figure mt-4 text-[11px] text-muted-foreground">
                        {level.grades.join(' · ')}
                    </p>
                </header>

                <section aria-labelledby="grades-heading" className="mt-12">
                    <div className="rule-heading">
                        <h2 id="grades-heading" className="overline">
                            Choose a class
                        </h2>
                    </div>

                    <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {level.grades.map((grade, index) => (
                            <li key={grade}>
                                <Link
                                    href={`/learn/${level.slug}/${gradeSlug(grade)}`}
                                    className="tile settle-in group flex h-full items-center justify-between gap-3 p-5"
                                    style={{ '--i': index % 12 } as React.CSSProperties}
                                >
                                    <span className="min-w-0">
                                        <span className="title-2 block transition-colors group-hover:text-primary">
                                            {grade}
                                        </span>
                                        <span className="meta mt-1 block">
                                            Papers, notes, schemes and plans
                                        </span>
                                    </span>
                                    <ArrowRight
                                        className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary"
                                        aria-hidden
                                    />
                                </Link>
                            </li>
                        ))}
                    </ul>
                </section>

                {/*
                 * The kinds offered at this level, by family. Families with
                 * nothing in them are dropped upstream: a "Study & understand"
                 * heading over an empty row reads as a broken page rather than
                 * an honest absence, and at Playgroup there genuinely are no
                 * set-book guides.
                 */}
                <section aria-labelledby="kinds-heading" className="mt-16">
                    <h2 id="kinds-heading" className="overline">
                        Available for {level.name}
                    </h2>

                    <div className="mt-4 space-y-8">
                        {families.map((group) => (
                            <div key={group.family}>
                                <h3 className="heading-ui">{group.family}</h3>
                                <p className="meta mt-1">{group.audience}</p>

                                <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {group.kinds.map((kind) => (
                                        <li key={kind.slug}>
                                            <Link
                                                href={`/catalog?level=${level.slug}&kind=${kind.slug}`}
                                                className="tile group block h-full p-4"
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
                        ))}
                    </div>
                </section>

                <nav aria-label="Other levels" className="mt-16 border-t border-border pt-8">
                    <h2 className="overline">Other levels</h2>
                    <ul className="rail-x mt-3 -mx-1 px-1">
                        {LEVELS.filter((l) => l.slug !== level.slug).map((other) => (
                            <li key={other.slug} className="shrink-0">
                                <Link href={`/learn/${other.slug}`} className="chip">
                                    {other.name}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </nav>
            </main>
            <Footer />
        </div>
    );
}

function Breadcrumb({ level }: { level: string }) {
    return (
        <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <li>
                    <Link href="/learn" className="transition-colors hover:text-foreground">
                        Library
                    </Link>
                </li>
                <ChevronRight className="h-3 w-3" aria-hidden />
                <li aria-current="page" className="text-foreground">
                    {level}
                </li>
            </ol>
        </nav>
    );
}
