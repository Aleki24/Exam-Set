import type { Metadata } from 'next';
import Link from 'next/link';
import {
    ArrowRight,
    Download,
    PenSquare,
    Search,
    ShieldCheck,
    Smartphone,
    Sparkles,
} from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import Footer from '@/components/shell/Footer';
import KindCard from '@/components/shop/KindCard';
import { LEVELS } from '@/lib/catalog';
import { catalogStats } from '@/lib/catalogStats';
import {
    FAMILY_AUDIENCE,
    RESOURCE_FAMILIES,
    RESOURCE_KINDS,
    subjectsForLevel,
} from '@/lib/resources';

export const metadata: Metadata = {
    title: 'Skulbase — CBE resources for every Kenyan classroom',
    description:
        'Schemes of work, lesson plans, records of work, revision notes, set-book guides and exam papers with marking schemes — Playgroup to Form 4. Pay with M-Pesa and download straight away.',
};

/** The catalogue moves; the curriculum does not. An hour is plenty. */
export const revalidate = 3600;

/**
 * THE FRONT DOOR.
 *
 * `/` was the shop for as long as the product was a shop, and the argument for
 * that was written down and was a good one. It stopped being true when the shop
 * became a library: someone arriving cold now meets a filter rail and
 * twenty-six exam types with nothing telling them what this is or why the
 * contents can be trusted. The catalogue is one click away at `/catalog` and
 * still owns search — this page owns the introduction.
 *
 * Rendered on the server with a single count query, holding to the standard
 * `/learn` already set: on a Kenyan mobile connection this page is HTML and
 * nothing else, and it is complete the moment it arrives. No hero image — the
 * two files in `public/` weigh 1.7 MB between them, which is the performance
 * argument for this whole redesign, inverted.
 */
export default async function LandingPage() {
    /*
     * The sitemap advertised `/?level=<slug>` for years and those results are
     * indexed. Anyone arriving on one wanted a filtered list, and `redirects()`
     * in `next.config.ts` sends them to the page that can give them one — done
     * there rather than here so that reading `searchParams` never drags this
     * page out of the static cache.
     */
    const stats = await catalogStats();

    return (
        <div className="min-h-screen bg-background">
            <TopNav />

            <Hero />
            <Levels stats={stats} />
            <Categories stats={stats} />
            <HowItWorks />
            <ForTeachers />
            <SetYourOwn />

            <Footer />
        </div>
    );
}

/* ========================================================================== */

function Hero() {
    return (
        <section className="relative overflow-hidden border-b border-border">
            {/* Ruled exercise-book lines — the same blank page the empty
                catalogue uses, so the two read as one product. Kept faint: at
                full strength a rule lands straight through the kicker and
                reads as a strikethrough, which is very obvious on a phone. */}
            <div className="ruled mask-linear-fade pointer-events-none absolute inset-0 opacity-[0.22]" aria-hidden />

            <div className="shell-width relative py-16 sm:py-24">
                <p className="overline">Organised by the KICD learning areas · CBC / CBE and 8-4-4</p>

                <h1 className="display-1 mt-5 max-w-3xl">Everything a Kenyan classroom needs, in one place.</h1>

                <p className="lead mt-6 max-w-xl">
                    Schemes of work, lesson plans, records of work, revision notes, set-book
                    guides and exam papers with their marking schemes — from baby class to
                    Form 4. Pay with M-Pesa and download it straight away.
                </p>

                {/* A real form, so it works before JavaScript does — and on the
                    connection this page was designed for, that matters. */}
                <form action="/catalog" method="get" className="mt-9 flex max-w-xl flex-wrap gap-2">
                    <div className="relative min-w-0 flex-1">
                        <Search
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden
                        />
                        <input
                            type="search"
                            name="search"
                            className="field pl-9"
                            placeholder="Search — subject, class, topic, school…"
                            aria-label="Search the catalogue"
                        />
                    </div>
                    <button type="submit" className="btn-primary shrink-0">
                        Search
                    </button>
                </form>

                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                    <Link
                        href="/learn"
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
                    >
                        Or start with your class
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                    <span className="meta">No account needed to browse.</span>
                </div>
            </div>
        </section>
    );
}

/* ========================================================================== */

function Levels({ stats }: { stats: Awaited<ReturnType<typeof catalogStats>> }) {
    return (
        <section aria-labelledby="levels-heading" className="shell-width py-14 sm:py-20">
            <div className="rule-heading">
                <h2 id="levels-heading" className="overline">
                    Start with a class
                </h2>
            </div>

            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {LEVELS.map((level, index) => {
                    const count = stats?.levels[level.slug];
                    return (
                        <li key={level.slug}>
                            <Link
                                href={`/learn/${level.slug}`}
                                className="sheet settle-in group flex h-full flex-col p-5"
                                style={{ '--i': index % 12 } as React.CSSProperties}
                            >
                                <p className="overline">{level.curriculum}</p>

                                <h3 className="title-2 mt-3 transition-colors group-hover:text-primary">
                                    {level.name}
                                </h3>

                                <p className="meta mt-2">{level.grades.join(' · ')}</p>

                                <div className="flex-1" />

                                <p className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-3">
                                    <span className="figure text-xs text-muted-foreground">
                                        {count === undefined
                                            ? `${subjectsForLevel(level.slug).length} learning areas`
                                            : `${count} resource${count === 1 ? '' : 's'}`}
                                    </span>
                                    <ArrowRight
                                        className="h-3.5 w-3.5 text-primary transition-transform duration-200 group-hover:translate-x-0.5"
                                        aria-hidden
                                    />
                                </p>
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

/* ========================================================================== */

function Categories({ stats }: { stats: Awaited<ReturnType<typeof catalogStats>> }) {
    return (
        <section aria-labelledby="kinds-heading" className="shell-width pb-14 sm:pb-20">
            <div className="rule-heading">
                <h2 id="kinds-heading" className="overline">
                    Or start with what you need
                </h2>
            </div>

            <div className="mt-8 space-y-12">
                {RESOURCE_FAMILIES.map((family) => {
                    const kinds = RESOURCE_KINDS.filter((k) => k.family === family);
                    if (kinds.length === 0) return null;

                    return (
                        <div key={family}>
                            <h3 className="title-2">{family}</h3>
                            <p className="meta mt-1">{FAMILY_AUDIENCE[family]}</p>

                            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                {kinds.map((kind, index) => (
                                    <KindCard
                                        key={kind.slug}
                                        kind={kind}
                                        count={stats?.kinds[kind.slug]}
                                        href={`/catalog/${kind.slug}`}
                                        index={index}
                                        showFamily={false}
                                    />
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

/* ========================================================================== */

/**
 * How buying works, said once and said plainly.
 *
 * Every claim here is one the code actually honours: the order creates an STK
 * push, the Safaricom callback grants the entitlement, and the download route
 * mints a signed URL against it. Nothing on this page promises a review nobody
 * performs.
 */
const STEPS = [
    {
        icon: Search,
        title: 'Find it',
        body: 'Search the catalogue, or browse down from your class to the learning area. Everything is free to look at.',
    },
    {
        icon: Smartphone,
        title: 'Pay with M-Pesa',
        body: 'The payment request goes straight to your phone. Prices are in KES, and buying several at once brings the price down.',
    },
    {
        icon: Download,
        title: 'Download straight away',
        body: 'Your download unlocks the moment payment is confirmed, and stays in your library to fetch again whenever you need it.',
    },
];

function HowItWorks() {
    return (
        <section aria-labelledby="how-heading" className="border-y border-border bg-card">
            <div className="shell-width py-14 sm:py-20">
                <div className="rule-heading">
                    <h2 id="how-heading" className="overline">
                        How it works
                    </h2>
                </div>

                <ol className="mt-8 grid gap-3 sm:grid-cols-3">
                    {STEPS.map((step, index) => (
                        <li
                            key={step.title}
                            className="surface settle-in p-6"
                            style={{ '--i': index } as React.CSSProperties}
                        >
                            <div className="flex items-center gap-3">
                                <span className="figure text-2xl font-bold text-primary">
                                    {String(index + 1).padStart(2, '0')}
                                </span>
                                <step.icon className="h-5 w-5 text-muted-foreground" aria-hidden />
                            </div>
                            <h3 className="heading-ui mt-4">{step.title}</h3>
                            <p className="meta mt-2">{step.body}</p>
                        </li>
                    ))}
                </ol>

                <p className="meta mt-6 flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    Paid for something and the download has not appeared? The paybill details and a
                    receipt box are on the checkout page, and{' '}
                    <Link href="/contact" className="font-semibold text-primary hover:underline">
                        we will sort it out
                    </Link>
                    .
                </p>
            </div>
        </section>
    );
}

/* ========================================================================== */

/** The three doors a teacher actually walks through on a Sunday night. */
const TEACHER_KINDS = ['scheme-of-work', 'lesson-plan', 'record-of-work'] as const;

function ForTeachers() {
    const kinds = TEACHER_KINDS.map((slug) => RESOURCE_KINDS.find((k) => k.slug === slug)).filter(
        (k): k is NonNullable<typeof k> => Boolean(k)
    );

    return (
        <section aria-labelledby="teachers-heading" className="shell-width py-14 sm:py-20">
            <div className="max-w-2xl">
                <p className="overline">For teachers</p>
                <h2 id="teachers-heading" className="display-2 mt-3">
                    The planning, already done
                </h2>
                <p className="lead mt-4">
                    The three documents every term asks for, laid out the way the curriculum
                    designs set them out — so the evening goes on teaching rather than on
                    formatting.
                </p>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {kinds.map((kind, index) => (
                    <KindCard
                        key={kind.slug}
                        kind={kind}
                        href={`/catalog/${kind.slug}`}
                        index={index}
                        showFamily={false}
                    />
                ))}
            </div>
        </section>
    );
}

/* ========================================================================== */

function SetYourOwn() {
    return (
        <section className="shell-width pb-16 sm:pb-24">
            <div className="ruled rounded-[var(--radius)] border border-border p-8 text-center sm:p-12">
                <Sparkles className="mx-auto h-6 w-6 text-primary" aria-hidden />
                <h2 className="title-1 mt-4">Cannot find the exact paper? Build it.</h2>
                <p className="lead mx-auto mt-3 max-w-lg">
                    Pick questions from the bank by topic and difficulty, and get a formatted
                    paper with its marking scheme — in your school&apos;s own layout.
                </p>
                <div className="mt-7 flex flex-wrap justify-center gap-3">
                    <Link href="/set" className="btn-primary">
                        <PenSquare className="h-4 w-4" aria-hidden />
                        Set your own exam
                    </Link>
                    <Link href="/plans" className="btn-outline">
                        See passes &amp; pricing
                    </Link>
                </div>
            </div>
        </section>
    );
}
