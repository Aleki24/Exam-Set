import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import Footer from '@/components/shell/Footer';
import KindResults from '@/components/shop/KindResults';
import { LEVELS } from '@/lib/catalog';
import { RESOURCE_KINDS, RESOURCE_KIND_BY_SLUG, kindsForLevel } from '@/lib/resources';

/**
 * ONE KIND OF RESOURCE — "Schemes of work", "Lesson plans", "Revision notes".
 *
 * This is the page a teacher reaches from a search engine. "Schemes of work
 * grade 9" is how the request is actually typed, and until now the only answer
 * this product could offer was a query string on the shop — a URL with no
 * title, no description and nothing for a crawler to index. A real route gets
 * real metadata, and `generateStaticParams` means all sixteen are built ahead
 * of time.
 *
 * The stock itself is fetched by a client child, because filtering by level has
 * to feel instant. The part that matters to a crawler — the heading, the
 * description, the level links — is server-rendered and complete on arrival.
 */

export function generateStaticParams() {
    return RESOURCE_KINDS.map((kind) => ({ kind: kind.slug }));
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ kind: string }>;
}): Promise<Metadata> {
    const { kind: slug } = await params;
    const kind = RESOURCE_KIND_BY_SLUG[slug];
    if (!kind) return { title: 'Not found | Skulbase Exams' };

    return {
        title: `${kind.plural} — Playgroup to Form 4 | Skulbase Exams`,
        description: `${kind.description}. Organised by the KICD learning areas for every level from Playgroup to Form 4. Pay with M-Pesa and download straight away.`,
    };
}

export default async function KindPage({ params }: { params: Promise<{ kind: string }> }) {
    const { kind: slug } = await params;
    const kind = RESOURCE_KIND_BY_SLUG[slug];
    if (!kind) notFound();

    /*
     * Only the levels that can actually stock this. `kindsForLevel` already
     * knows that a Playgroup teacher is never offered a set-book guide, and
     * offering the filter anyway would put a heading on a shelf that can never
     * be filled — the one thing this hierarchy exists to avoid.
     */
    const levels = LEVELS.filter((level) => kindsForLevel(level.slug).some((k) => k.slug === kind.slug));

    return (
        <div className="min-h-screen bg-background">
            <TopNav />

            <div className="shell-width py-6 sm:py-10">
                <Link
                    href="/catalog"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                    Every resource
                </Link>

                <header className="mt-6 max-w-2xl">
                    <p className="overline">{kind.family}</p>
                    <h1 className="display-2 mt-3">{kind.plural}</h1>
                    <p className="lead mt-4">
                        {kind.description}. Organised by the KICD learning areas, for every class
                        that sits them.
                    </p>
                </header>

                <KindResults kind={kind} levels={levels} />

                {/* The sideways move, for someone who came to the wrong shelf. */}
                <section className="mt-16 border-t border-border pt-8" aria-labelledby="siblings-heading">
                    <div className="rule-heading mb-5">
                        <h2 id="siblings-heading" className="overline">
                            Also in {kind.family}
                        </h2>
                    </div>

                    <div className="rail-x">
                        {RESOURCE_KINDS.filter((k) => k.family === kind.family && k.slug !== kind.slug).map(
                            (sibling) => (
                                <Link key={sibling.slug} href={`/catalog/${sibling.slug}`} className="chip shrink-0">
                                    {sibling.plural}
                                    <ArrowRight className="h-3 w-3 opacity-60" aria-hidden />
                                </Link>
                            )
                        )}
                    </div>
                </section>
            </div>

            <Footer />
        </div>
    );
}
