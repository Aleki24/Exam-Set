'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Check, ClipboardCheck, Download, Loader2, Plus, ShieldCheck } from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import PaperCard from '@/components/shop/PaperCard';
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
                    <Link href="/" className="btn-primary mt-6 inline-flex">
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
                    href="/"
                    className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="h-4 w-4" />
                    All papers
                </Link>

                <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
                    {/* Main */}
                    <div>
                        <p className="overline mb-3">{examTypeName(paper.exam_type)}</p>
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
                                <li className="flex items-start gap-3">
                                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                                    <span>
                                        The full question paper as a print-ready PDF
                                        {paper.institution ? ` (${paper.institution} format)` : ''}
                                    </span>
                                </li>
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
                        <div className="surface sticky top-24 p-5">
                            <div className="flex items-baseline justify-between">
                                <span className={isFree ? 'display-2 text-success' : 'figure text-3xl font-bold text-accent'}>
                                    {isFree ? 'Free' : formatPrice(paper.price_cents, paper.currency)}
                                </span>
                                {paper.has_marking_scheme && (
                                    <span className="badge-soft">
                                        <ClipboardCheck className="h-3 w-3" />
                                        Scheme included
                                    </span>
                                )}
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

                            <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
                                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                Pay with M-Pesa. Your download unlocks the moment payment is confirmed.
                            </p>

                            {paper.download_count > 0 && (
                                <p className="figure mt-4 border-t border-border pt-3 text-[11px] text-muted-foreground">
                                    {paper.download_count} download{paper.download_count === 1 ? '' : 's'}
                                </p>
                            )}
                        </div>
                    </aside>
                </div>

                {/* More like this */}
                {related.length > 0 && (
                    <section className="mt-16 border-t border-border pt-8" aria-labelledby="related-heading">
                        <div className="rule-heading mb-5">
                            <h2 id="related-heading" className="overline">
                                {relatedBySubject && paper.subject
                                    ? `More ${paper.subject} for ${level?.short ?? 'this level'}`
                                    : `More for ${level?.name ?? 'this level'}`}
                            </h2>
                        </div>
                        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                            {related.map((other, i) => (
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
        </div>
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
