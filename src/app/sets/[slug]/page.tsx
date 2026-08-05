'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, ShoppingCart } from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import PaperCard, { PaperCardSkeleton } from '@/components/shop/PaperCard';
import { useCart } from '@/lib/cart';
import { formatPrice, sumCents, bundleDiscount } from '@/lib/catalog';
import { describeSet, type ExamSetSummary } from '@/lib/examSets';
import type { PaperListing } from '@/types/shop';

/**
 * ONE SITTING
 *
 * "Kabras Mock End Term 2 2025" — the school's whole exam, every subject, on one
 * page with one button.
 *
 * The page exists because the alternative is a teacher filtering the shop four
 * times and hoping they found all twelve. What it is *not* is a product: there
 * is no set price and no set download. "Add all" fills the cart with the papers,
 * each keeps its own price, and the existing multi-item discount does the rest.
 * The paywall stays exactly where it was.
 */
export default function SetPage() {
    const params = useParams<{ slug: string }>();
    const cart = useCart();

    const [set, setSet] = useState<ExamSetSummary | null>(null);
    const [papers, setPapers] = useState<PaperListing[]>([]);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        if (!params?.slug) return;
        fetch(`/api/sets/${params.slug}`)
            .then(async (res) => {
                if (res.status === 404) {
                    setNotFound(true);
                    return null;
                }
                return res.json();
            })
            .then((data) => {
                if (!data) return;
                setSet(data.set);
                setPapers(data.papers ?? []);
            })
            .catch(() => toast.error('Could not load this set'))
            .finally(() => setLoading(false));
    }, [params?.slug]);

    // What is actually left to buy. Free papers and papers already owned are not
    // "in the cart" and never should be, so the button counts and prices only
    // what a purchase would cover — a button offering twelve papers to somebody
    // who owns nine is an overcharge waiting to be noticed at checkout.
    const outstanding = papers.filter((p) => !p.owned && !cart.has(p.id));
    const subtotal = sumCents(outstanding.map((p) => ({ price_cents: p.price_cents })));
    const { percentOff } = bundleDiscount(outstanding.length, subtotal);

    const addEverything = () => {
        const added = cart.addAll(papers);
        if (added === 0) {
            toast('Everything here is already in your cart or your library');
            return;
        }
        toast.success(`Added ${added} paper${added === 1 ? '' : 's'} to your cart`);
    };

    if (notFound) {
        return (
            <div className="min-h-screen bg-background">
                <TopNav />
                <div className="shell-width py-16">
                    <div className="surface ruled flex flex-col items-center px-6 py-16 text-center">
                        <h1 className="title-1">No such set</h1>
                        <p className="lead mt-2 text-sm">
                            It may have been unpublished, or the link may be wrong.
                        </p>
                        <Link href="/" className="btn-primary mt-6">
                            Browse every paper
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <TopNav />

            <div className="shell-width py-6">
                <Link
                    href="/"
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="h-4 w-4" />
                    All papers
                </Link>

                <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
                    <div className="min-w-0">
                        <p className="overline mb-2.5">Exam set</p>
                        <h1 className="display-2">{loading ? 'Loading…' : set?.name}</h1>
                        {set && <p className="meta mt-2">{describeSet({ ...set, paper_count: papers.length })}</p>}
                        {set?.description && <p className="lead mt-3 max-w-xl text-sm">{set.description}</p>}
                    </div>

                    {outstanding.length > 0 && (
                        <button type="button" onClick={addEverything} className="btn-primary shrink-0">
                            <ShoppingCart className="h-4 w-4" aria-hidden />
                            Add all {outstanding.length} to cart
                        </button>
                    )}
                </header>

                {/* Stated before the cart, not after. The discount is the reason
                    to buy the sitting rather than one paper, and a saving nobody
                    is told about until checkout does not persuade anybody. */}
                {outstanding.length > 0 && percentOff > 0 && (
                    <p className="meta mt-3">
                        {formatPrice(subtotal, papers[0]?.currency ?? 'KES')} for the {outstanding.length} —{' '}
                        <span className="text-success">{percentOff}% off</span> as a multi-paper order.
                    </p>
                )}

                <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                    {loading ? (
                        Array.from({ length: 6 }).map((_, i) => <PaperCardSkeleton key={i} index={i} />)
                    ) : papers.length === 0 ? (
                        <p className="meta col-span-full">Nothing published in this set yet.</p>
                    ) : (
                        papers.map((paper, i) => (
                            <PaperCard
                                key={paper.id}
                                paper={paper}
                                index={i}
                                inCart={cart.has(paper.id)}
                                onToggleCart={(p) => cart.toggle(p)}
                                hideSet
                            />
                        ))
                    )}
                </div>

                {cart.count > 0 && (
                    <div className="mt-10 flex justify-center">
                        <Link href="/cart" className="btn-outline">
                            {cart.count} in cart — go to checkout
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
}
