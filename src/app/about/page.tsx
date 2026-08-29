import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, PenSquare } from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import Footer from '@/components/shell/Footer';
import { LEVELS } from '@/lib/catalog';
import { catalogStats } from '@/lib/catalogStats';
import { FAMILY_AUDIENCE, RESOURCE_FAMILIES, RESOURCE_KINDS } from '@/lib/resources';

export const metadata: Metadata = {
    title: 'About us — how Skulbase is put together',
    description:
        'Why we built a resource library for Kenyan teachers, how it is organised around the KICD learning areas, and what we will and will not claim about the content.',
};

export const revalidate = 3600;

export default async function AboutPage() {
    const stats = await catalogStats();

    return (
        <div className="min-h-screen bg-background">
            <TopNav />

            <main className="shell-width py-10 sm:py-16">
                <header className="page-header">
                    <p className="overline">About us</p>
                    <h1 className="display-2 mt-3">Built for the Sunday night before the week starts</h1>
                    <p className="lead mt-5">
                        Every Kenyan teacher knows the evening: the scheme of work is due, the
                        lesson plans are not written, and somewhere there is a folder of last
                        year&apos;s papers on a laptop that will not turn on. Skulbase exists so
                        that evening is shorter.
                    </p>
                </header>

                {/* What is here, in numbers that are actually counted. */}
                <section aria-labelledby="scale-heading" className="mt-14">
                    <div className="rule-heading">
                        <h2 id="scale-heading" className="overline">
                            What is in the library
                        </h2>
                    </div>

                    <dl className="mt-6 flex flex-wrap gap-x-12 gap-y-6 border-y border-border py-6">
                        <Stat label="Levels" value={String(LEVELS.length)} hint="Playgroup to Form 4" />
                        <Stat
                            label="Kinds of resource"
                            value={String(RESOURCE_KINDS.length)}
                            hint="Papers, plans, notes, guides"
                        />
                        {/* Only when it was actually counted. A dash here would
                            read as "none", which is a different claim. */}
                        {stats && (
                            <Stat
                                label="Published resources"
                                value={String(stats.total)}
                                hint="Everything a visitor can see"
                            />
                        )}
                    </dl>
                </section>

                {/* How it is organised — the real thinking, not a mission statement. */}
                <section aria-labelledby="organised-heading" className="mt-14">
                    <div className="rule-heading">
                        <h2 id="organised-heading" className="overline">
                            How it is organised
                        </h2>
                    </div>

                    <p className="lead mt-6 max-w-2xl">
                        Three questions, in the order anyone can answer them: which class, which
                        learning area, and what kind of thing you need. A parent knows their child
                        is in Grade 4. They do not know what a summative assessment is — so we
                        never ask.
                    </p>

                    <div className="mt-8 grid gap-3 sm:grid-cols-2">
                        {RESOURCE_FAMILIES.map((family) => {
                            const kinds = RESOURCE_KINDS.filter((k) => k.family === family);
                            return (
                                <article key={family} className="surface p-5">
                                    <h3 className="heading-ui">{family}</h3>
                                    <p className="meta mt-1">{FAMILY_AUDIENCE[family]}</p>
                                    <ul className="mt-4 flex flex-wrap gap-1.5">
                                        {kinds.map((kind) => (
                                            <li key={kind.slug}>
                                                <Link href={`/catalog/${kind.slug}`} className="badge-soft">
                                                    {kind.name}
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                </article>
                            );
                        })}
                    </div>
                </section>

                {/* Buying, described exactly as it behaves. */}
                <section aria-labelledby="buying-heading" className="mt-14">
                    <div className="rule-heading">
                        <h2 id="buying-heading" className="overline">
                            Paying and downloading
                        </h2>
                    </div>

                    <div className="mt-6 max-w-2xl space-y-4 text-sm leading-relaxed sm:text-[15px]">
                        <p>
                            Prices are in Kenya shillings and you pay with M-Pesa. The request
                            arrives on your phone, and your download unlocks the moment payment is
                            confirmed — there is no waiting for anyone to email you a file.
                        </p>
                        <p>
                            What you buy stays yours. It sits in your library and you can download
                            it again as many times as you like, on as many devices as you like,
                            for as long as the account exists. Buying several things at once
                            brings the price down automatically.
                        </p>
                        <p>
                            If a payment goes through and the download does not appear, that is
                            our problem to fix and not yours to absorb.{' '}
                            <Link href="/contact" className="font-semibold text-primary hover:underline">
                                Tell us
                            </Link>{' '}
                            and we will sort it out.
                        </p>
                    </div>
                </section>

                {/* The section that is the actual differentiator. */}
                <section aria-labelledby="honest-heading" className="mt-14">
                    <div className="rule-heading">
                        <h2 id="honest-heading" className="overline">
                            What we will not claim
                        </h2>
                    </div>

                    <p className="lead mt-6 max-w-2xl">
                        Sites like this one tend to be covered in badges. We would rather tell you
                        what is behind ours — and what is not.
                    </p>

                    <div className="mt-8 grid gap-3 sm:grid-cols-2">
                        <article className="sheet p-5">
                            <h3 className="heading-ui">We do say &ldquo;KICD learning areas&rdquo;</h3>
                            <p className="meta mt-2">
                                The library is organised around the KICD curriculum designs and the
                                rationalised learning areas — that is a description of how the
                                shelves are arranged, and it is true.
                            </p>
                        </article>

                        <article className="sheet p-5">
                            <h3 className="heading-ui">We do not say &ldquo;KICD approved&rdquo;</h3>
                            <p className="meta mt-2">
                                Nobody at KICD has approved this site, and a badge saying otherwise
                                would be a lie you could not check.
                            </p>
                        </article>

                        <article className="sheet p-5">
                            <h3 className="heading-ui">No &ldquo;teacher-reviewed&rdquo; badge</h3>
                            <p className="meta mt-2">
                                We have not built a review process, so we do not wear the sticker.
                                When there is a named person checking resources, the badge will say
                                who and when — or it will not exist.
                            </p>
                        </article>

                        <article className="sheet p-5">
                            <h3 className="heading-ui">No invented ratings</h3>
                            <p className="meta mt-2">
                                There are no star ratings and no testimonials, because we have not
                                collected any. The numbers we do show — marks, questions, downloads
                                — are counted, not decided.
                            </p>
                        </article>
                    </div>
                </section>

                <section className="ruled mt-16 rounded-[var(--radius)] border border-border p-8 text-center sm:p-12">
                    <h2 className="title-1">Have a look around</h2>
                    <p className="lead mx-auto mt-3 max-w-lg">
                        Browsing is free and needs no account. You only pay when you want to take
                        something away with you.
                    </p>
                    <div className="mt-7 flex flex-wrap justify-center gap-3">
                        <Link href="/catalog" className="btn-primary">
                            Browse the catalogue
                            <ArrowRight className="h-4 w-4" aria-hidden />
                        </Link>
                        <Link href="/set" className="btn-outline">
                            <PenSquare className="h-4 w-4" aria-hidden />
                            Set your own exam
                        </Link>
                    </div>
                </section>
            </main>

            <Footer />
        </div>
    );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
    return (
        <div>
            <dt className="overline">{label}</dt>
            <dd className="figure mt-2 text-3xl font-bold">{value}</dd>
            <dd className="meta mt-1">{hint}</dd>
        </div>
    );
}
