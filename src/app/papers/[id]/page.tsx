'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Check, ClipboardCheck, Download, FileText, Infinity as InfinityIcon, Loader2, Pencil, Plus, School, ShieldCheck, Zap } from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import Footer from '@/components/shell/Footer';
import PaperCard from '@/components/shop/PaperCard';
import PaperCover from '@/components/shop/PaperCover';
import DocumentPreview from '@/components/shop/DocumentPreview';
import { useCart } from '@/lib/cart';
import { examTypeName, formatPrice, LEVEL_BY_SLUG, TERMS } from '@/lib/catalog';
import type { PaperListing } from '@/types/shop';
import { recordView, enqueueDownload } from '@/lib/recentlyViewed';

/** A single paper: what you get, what it costs, and one button to act. */
export default function PaperDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const cart = useCart();

    const [paper, setPaper] = useState<PaperListing | null>(null);
    const [related, setRelated] = useState<PaperListing[]>([]);
    /** True when the strip really is the same subject, which the heading claims. */
    const [relatedBySubject, setRelatedBySubject] = useState(false);
    /** The rest of the sitting this paper came from, if it came from one. */
    const [siblings, setSiblings] = useState<PaperListing[]>([]);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState<'paper' | 'scheme' | null>(null);

    useEffect(() => {
        if (!params?.id) return;
        setLoading(true);
        fetch(`/api/papers/${params.id}`)
            .then((res) => res.json())
            .then((data) => {
                if (data.error) {
                    toast.error(data.error);
                    return;
                }
                setPaper(data.paper);
                // Remembered on the phone, not the account: this is the list
                // somebody most wants when signal comes back, and a list held
                // only on the server is gone exactly when it is needed.
                recordView(data.paper);
            })
            .catch(() => toast.error('Could not load this paper'))
            .finally(() => setLoading(false));
    }, [params?.id]);

    // Cross-sell: other papers for the same level, which is what a teacher who
    // needs one paper almost always needs more of.
    /*
     * More like this — genuinely like this.
     *
     * This used to match on level alone, so a Grade 9 Mathematics paper
     * suggested any Grade 9 paper at all: Kiswahili, Agriculture, whatever was
     * most downloaded. That is not a recommendation, it is the catalogue with a
     * heading on it, and it is worse than nothing because the heading claims
     * otherwise.
     *
     * Now it matches subject and level, and asks for more than it needs so the
     * same kind can be floated to the front. Same kind first but not
     * exclusively: somebody reading a Grade 9 maths paper is often glad to see
     * the scheme of work for it, and filtering to one kind hides exactly that.
     *
     * Falls back to the level-only query when a subject match returns nothing,
     * because an empty strip on a thin catalogue helps nobody — but never falls
     * back to a different subject silently while the heading still says
     * otherwise. The heading changes with it.
     */
    useEffect(() => {
        if (!paper) return;
        let cancelled = false;

        const ask = async (withSubject: boolean): Promise<PaperListing[]> => {
            const params = new URLSearchParams({ limit: '12', sort: 'newest' });
            if (paper.level_slug) params.set('level', paper.level_slug);
            if (withSubject && paper.subject) params.set('subject', paper.subject);

            const res = await fetch(`/api/papers?${params}`);
            const data = await res.json();
            return (data.papers || []).filter((p: PaperListing) => p.id !== paper.id);
        };

        (async () => {
            try {
                let found = paper.subject ? await ask(true) : [];
                let matched = found.length > 0;

                if (found.length === 0) {
                    found = await ask(false);
                    matched = false;
                }

                if (cancelled) return;

                const sameKind = found.filter((p) => p.resource_kind === paper.resource_kind);
                const rest = found.filter((p) => p.resource_kind !== paper.resource_kind);

                setRelatedBySubject(matched);
                setRelated([...sameKind, ...rest].slice(0, 3));
            } catch {
                /* a missing cross-sell strip is not worth an error toast */
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [paper]);

    /*
     * The rest of the sitting.
     *
     * This is the question "More like this" was always standing in for and could
     * never actually answer — it guessed at siblings from subject and level,
     * which is how a Grade 9 maths paper suggested a different school's Grade 9
     * maths paper and called it related. When a paper belongs to a set, the
     * siblings are known rather than inferred, and the strip below says so.
     */
    useEffect(() => {
        if (!paper?.set_slug) {
            setSiblings([]);
            return;
        }
        let cancelled = false;

        fetch(`/api/sets/${paper.set_slug}`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (cancelled || !data) return;
                setSiblings((data.papers ?? []).filter((p: PaperListing) => p.id !== paper.id));
            })
            .catch(() => {
                /* the paper still sells without its siblings listed */
            });

        return () => {
            cancelled = true;
        };
    }, [paper?.set_slug, paper?.id]);

    const outstandingSiblings = siblings.filter((p) => !p.owned && !cart.has(p.id));

    // The cross-sell asks the catalog for papers matching subject and level,
    // which is exactly the query the rest of a sitting also satisfies — so
    // without this the same three papers appear twice on one page, once as
    // "also in this set" and once as "you might like".
    const siblingIds = new Set(siblings.map((p) => p.id));
    const crossSell = related.filter((p) => !siblingIds.has(p.id));

    const addRestOfSet = () => {
        const added = cart.addAll(siblings);
        if (added === 0) {
            toast('The rest of this set is already in your cart or your library');
            return;
        }
        toast.success(`Added ${added} more paper${added === 1 ? '' : 's'} from this set`);
    };

    const download = async (asset: 'paper' | 'scheme', target?: PaperListing) => {
        const subject = target ?? paper;
        if (!subject) return;
        setDownloading(asset);
        try {
            const res = await fetch(`/api/papers/${subject.id}/download?asset=${asset}`);
            const data = await res.json();

            if (res.status === 401) {
                toast.error('Sign in to download');
                router.push(`/auth/login?next=/papers/${subject.slug || subject.id}`);
                return;
            }
            if (res.status === 402) {
                toast.error('Add this paper to your cart to buy it');
                return;
            }
            if (!res.ok) {
                toast.error(data.error || 'Download failed');
                return;
            }
            window.open(data.url, '_blank', 'noopener');
        } catch {
            /*
             * A thrown fetch here means the request never completed — almost
             * always a dropped connection rather than a refusal, since every
             * refusal above came back as a status. So the intention is kept on
             * the phone and offered again from /home when signal returns.
             *
             * Queuing grants nothing. The retry goes through this same route
             * and the same entitlement check; an entry for something unpaid
             * stays an entry.
             */
            enqueueDownload(subject.id, subject.title, asset);
            toast.error('No connection — saved to your download queue');
        } finally {
            setDownloading(null);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-background">
                <TopNav />
                <div className="shell-width py-16">
                    <div className="skeleton h-64" />
                </div>
            </div>
        );
    }

    if (!paper) {
        return (
            <div className="min-h-screen bg-background">
                <TopNav />
                <div className="shell-width py-20 text-center">
                    <h1 className="title-1">Paper not found</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        It may have been unpublished by its author.
                    </p>
                    <Link href="/catalog" className="btn-primary mt-6 inline-flex">
                        Browse all papers
                    </Link>
                </div>
            </div>
        );
    }

    const level = paper.level_slug ? LEVEL_BY_SLUG[paper.level_slug] : undefined;
    const isFree = paper.price_cents === 0;
    const owned = Boolean(paper.owned);
    const inCart = cart.has(paper.id);
    const term = TERMS.find((t) => t.slug === paper.term_slug);

    return (
        <div className="min-h-screen bg-background">
            <TopNav />

            <div className="shell-width py-6">
                <Link
                    href="/catalog"
                    className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="h-4 w-4" />
                    All papers
                </Link>

                <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
                    {/* Main */}
                    <div>
                        {paper.set_slug && paper.set_name ? (
                            <Link
                                href={`/sets/${paper.set_slug}`}
                                className="overline mb-3 inline-block hover:text-primary"
                            >
                                {paper.set_name}
                            </Link>
                        ) : (
                            <p className="overline mb-3">{examTypeName(paper.exam_type)}</p>
                        )}
                        <h1 className="display-2">{paper.title}</h1>
                        <p className="meta mt-3">
                            {[paper.subject, paper.grade_label || level?.name, term?.name, paper.year, paper.paper_number]
                                .filter(Boolean)
                                .join(' · ')}
                        </p>

                        {paper.description && <p className="lead mt-6 max-w-2xl">{paper.description}</p>}

                        {/* Facts. A quiet row, not four boxes. */}
                        <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-5 border-y border-border py-5">
                            <Fact label="Total marks" value={paper.total_marks || '—'} />
                            <Fact label="Questions" value={paper.question_count || '—'} />
                            <Fact label="Duration" value={paper.time_limit || '—'} />
                            <Fact label="Bought" value={paper.purchase_count} />
                        </dl>

                        {/* What's included */}
                        <div className="mt-10">
                            <h2 className="overline mb-4">What you get</h2>
                            <ul className="space-y-3 text-sm">
                                {/* The format is a promise, so it is read off
                                    the stored file rather than asserted. This
                                    line said "print-ready PDF" for every paper
                                    in the shop, which stopped being true the day
                                    Word documents were accepted. */}
                                <li className="flex items-start gap-3">
                                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                                    <span>
                                        The full question paper
                                        {paper.file_format ? ` as a ${paper.file_format} file` : ''}
                                        {paper.institution ? ` (${paper.institution} format)` : ''}
                                    </span>
                                </li>
                                {paper.editable && (
                                    <li className="flex items-start gap-3">
                                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                                        <span>
                                            Editable in Word — change the school name, the date and the
                                            questions before you print it
                                        </span>
                                    </li>
                                )}
                                {paper.has_marking_scheme && (
                                    <li className="flex items-start gap-3">
                                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                                        <span>The marking scheme with answers and mark allocation</span>
                                    </li>
                                )}
                                <li className="flex items-start gap-3">
                                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                                    <span>Unlimited re-downloads — it stays in your library</span>
                                </li>
                            </ul>
                        </div>

                        {paper.institution && (
                            <p className="mt-4 text-xs text-muted-foreground">Source: {paper.institution}</p>
                        )}
                    </div>

                    {/* Buy panel */}
                    <aside>
                        <div className="sticky top-24 space-y-4">
                        {/* The real document where one can be read, the
                            typeset cover where it cannot. A buyer choosing
                            between four Grade 9 Mathematics papers cannot open
                            any of them, and the cover — honest as it is — shows
                            nothing of what is inside. */}
                        <DocumentPreview
                            paper={paper}
                            owned={owned}
                            onBuy={() => cart.add(paper)}
                            fallback={<PaperCover paper={paper} />}
                        />
                        <div className="surface p-5">
                            <div className="flex items-baseline justify-between">
                                <span className={isFree ? 'display-2 text-success' : 'figure text-3xl font-bold text-accent'}>
                                    {isFree ? 'Free' : formatPrice(paper.price_cents, paper.currency)}
                                </span>
                                <span className="flex flex-wrap justify-end gap-1.5">
                                    {paper.file_format && (
                                        <span className="badge-soft">
                                            {paper.editable ? (
                                                <Pencil className="h-3 w-3" />
                                            ) : (
                                                <FileText className="h-3 w-3" />
                                            )}
                                            {paper.file_format}
                                        </span>
                                    )}
                                    {paper.has_marking_scheme && (
                                        <span className="badge-soft">
                                            <ClipboardCheck className="h-3 w-3" />
                                            Scheme included
                                        </span>
                                    )}
                                </span>
                            </div>

                            <div className="mt-5 space-y-2">
                                {owned || isFree ? (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => download('paper')}
                                            disabled={downloading !== null}
                                            className="btn-primary w-full"
                                        >
                                            {downloading === 'paper' ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Download className="h-4 w-4" />
                                            )}
                                            Download the paper
                                        </button>
                                        {paper.has_marking_scheme && (
                                            <button
                                                type="button"
                                                onClick={() => download('scheme')}
                                                disabled={downloading !== null}
                                                className="btn-outline w-full"
                                            >
                                                {downloading === 'scheme' ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <ClipboardCheck className="h-4 w-4" />
                                                )}
                                                Download marking scheme
                                            </button>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const added = cart.toggle(paper);
                                                toast.success(added ? 'Added to your cart' : 'Removed from cart');
                                            }}
                                            className={inCart ? 'btn-outline w-full' : 'btn-buy w-full'}
                                        >
                                            {inCart ? (
                                                <>
                                                    <Check className="h-4 w-4" />
                                                    In your cart
                                                </>
                                            ) : (
                                                <>
                                                    <Plus className="h-4 w-4" />
                                                    Add to cart
                                                </>
                                            )}
                                        </button>
                                        <Link
                                            href="/cart"
                                            onClick={() => {
                                                if (!inCart) cart.add(paper);
                                            }}
                                            className="btn-buy w-full"
                                        >
                                            Buy now
                                        </Link>
                                    </>
                                )}
                            </div>

                            {/* Every line here is a claim the code honours.
                                Nothing about review or verification, because
                                nobody performs either. */}
                            <ul className="mt-5 space-y-2.5 border-t border-border pt-4">
                                <Assurance icon={ShieldCheck}>
                                    Pay with M-Pesa. Your download unlocks the moment payment is
                                    confirmed.
                                </Assurance>
                                <Assurance icon={InfinityIcon}>
                                    Yours to download again, any time, from your library.
                                </Assurance>
                                {paper.editable && (
                                    <Assurance icon={Pencil}>
                                        A Word file, so you can edit it before you use it.
                                    </Assurance>
                                )}
                                {paper.has_marking_scheme && (
                                    <Assurance icon={ClipboardCheck}>
                                        The marking scheme comes with it, with answers and mark
                                        allocation.
                                    </Assurance>
                                )}
                                {paper.institution && (
                                    <Assurance icon={School}>Sat at {paper.institution}.</Assurance>
                                )}
                                {paper.purchase_count > 0 && (
                                    <Assurance icon={Zap}>
                                        Bought {paper.purchase_count} time
                                        {paper.purchase_count === 1 ? '' : 's'}.
                                    </Assurance>
                                )}
                            </ul>

                            {paper.download_count > 0 && (
                                <p className="figure mt-4 border-t border-border pt-3 text-[11px] text-muted-foreground">
                                    {paper.download_count} download{paper.download_count === 1 ? '' : 's'}
                                </p>
                            )}
                        </div>
                        </div>
                    </aside>
                </div>

                {/* The rest of the sitting. Known siblings, so it comes first
                    and the cross-sell strip below it becomes the fallback it
                    always should have been. */}
                {siblings.length > 0 && (
                    <section className="mt-16 border-t border-border pt-8" aria-labelledby="set-heading">
                        <div className="rule-heading mb-5">
                            <h2 id="set-heading" className="overline">
                                Also in {paper.set_name}
                            </h2>
                        </div>

                        <div className="mb-5 flex flex-wrap items-center gap-3">
                            <Link href={`/sets/${paper.set_slug}`} className="btn-outline btn-sm">
                                See the whole set ({siblings.length + 1})
                            </Link>
                            {outstandingSiblings.length > 0 && (
                                <button type="button" onClick={addRestOfSet} className="btn-primary btn-sm">
                                    <Plus className="h-3.5 w-3.5" aria-hidden />
                                    Add the other {outstandingSiblings.length} to cart
                                </button>
                            )}
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {siblings.slice(0, 3).map((other, i) => (
                                <PaperCard
                                    key={other.id}
                                    paper={other}
                                    index={i}
                                    inCart={cart.has(other.id)}
                                    onToggleCart={(p) => {
                                        const added = cart.toggle(p);
                                        toast.success(added ? 'Added to your cart' : 'Removed from cart');
                                    }}
                                    onDownload={(other) => download('paper', other)}
                                    hideSet
                                />
                            ))}
                        </div>
                    </section>
                )}

                {/* More like this. Deliberately below the set, and with the set
                    subtracted from it: a paper that has just been listed as
                    part of this sitting must not appear again three inches
                    lower under a heading that calls it a suggestion. */}
                {crossSell.length > 0 && (
                    <section className="mt-16 border-t border-border pt-8" aria-labelledby="related-heading">
                        <div className="rule-heading mb-5">
                            <h2 id="related-heading" className="overline">
                                {relatedBySubject && paper.subject
                                    ? `More ${paper.subject} for ${level?.short ?? 'this level'}`
                                    : `More for ${level?.name ?? 'this level'}`}
                            </h2>
                        </div>
                        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                            {crossSell.map((other, i) => (
                                <PaperCard
                                    key={other.id}
                                    paper={other}
                                    index={i}
                                    inCart={cart.has(other.id)}
                                    onToggleCart={(p) => {
                                        const added = cart.toggle(p);
                                        toast.success(added ? 'Added to your cart' : 'Removed from cart');
                                    }}
                                    onDownload={(other) => download('paper', other)}
                                />
                            ))}
                        </div>
                    </section>
                )}
            </div>
            <Footer />
        </div>
    );
}

/** One true thing about this purchase. */
function Assurance({
    icon: Icon,
    children,
}: {
    icon: React.ComponentType<{ className?: string }>;
    children: React.ReactNode;
}) {
    return (
        <li className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            <span>{children}</span>
        </li>
    );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div>
            <dt className="overline">{label}</dt>
            <dd className="figure mt-1.5 text-lg font-semibold">{value}</dd>
        </div>
    );
}
