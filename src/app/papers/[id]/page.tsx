'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
    ArrowLeft,
    Check,
    ClipboardCheck,
    Clock,
    Download,
    FileText,
    Loader2,
    Plus,
    ShieldCheck,
    Users,
} from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import { useCart } from '@/lib/cart';
import { examTypeName, formatPrice, LEVEL_BY_SLUG, TERMS } from '@/lib/catalog';
import type { PaperListing } from '@/types/shop';

/** A single paper: what you get, what it costs, and one button to act. */
export default function PaperDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const cart = useCart();

    const [paper, setPaper] = useState<PaperListing | null>(null);
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
            })
            .catch(() => toast.error('Could not load this paper'))
            .finally(() => setLoading(false));
    }, [params?.id]);

    const download = async (asset: 'paper' | 'scheme') => {
        if (!paper) return;
        setDownloading(asset);
        try {
            const res = await fetch(`/api/papers/${paper.id}/download?asset=${asset}`);
            const data = await res.json();

            if (res.status === 401) {
                toast.error('Sign in to download');
                router.push(`/auth/login?next=/papers/${paper.slug || paper.id}`);
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
            toast.error('Download failed');
        } finally {
            setDownloading(null);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-background">
                <TopNav />
                <div className="shell-width py-16">
                    <div className="surface h-64 animate-pulse bg-secondary/60" />
                </div>
            </div>
        );
    }

    if (!paper) {
        return (
            <div className="min-h-screen bg-background">
                <TopNav />
                <div className="shell-width py-20 text-center">
                    <h1 className="text-xl font-bold">Paper not found</h1>
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
                        <span className="badge-soft">{examTypeName(paper.exam_type)}</span>
                        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{paper.title}</h1>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {[paper.subject, paper.grade_label || level?.name, term?.name, paper.year, paper.paper_number]
                                .filter(Boolean)
                                .join(' · ')}
                        </p>

                        {paper.description && (
                            <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-foreground/90">
                                {paper.description}
                            </p>
                        )}

                        {/* Facts grid */}
                        <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
                            <Fact icon={FileText} label="Total marks" value={paper.total_marks || '—'} />
                            <Fact icon={FileText} label="Questions" value={paper.question_count || '—'} />
                            <Fact icon={Clock} label="Duration" value={paper.time_limit || '—'} />
                            <Fact icon={Users} label="Bought" value={paper.purchase_count} />
                        </dl>

                        {/* What's included */}
                        <div className="surface mt-8 p-5">
                            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                                What you get
                            </h2>
                            <ul className="mt-3 space-y-2.5 text-sm">
                                <li className="flex items-start gap-2.5">
                                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                    <span>
                                        The full question paper as a print-ready PDF
                                        {paper.institution ? ` (${paper.institution} format)` : ''}
                                    </span>
                                </li>
                                {paper.has_marking_scheme && (
                                    <li className="flex items-start gap-2.5">
                                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                        <span>The marking scheme with answers and mark allocation</span>
                                    </li>
                                )}
                                <li className="flex items-start gap-2.5">
                                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
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
                                <span className="text-3xl font-black tracking-tight tabular-nums">
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
                                            className="btn-primary w-full"
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
                                <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground tabular-nums">
                                    {paper.download_count} download{paper.download_count === 1 ? '' : 's'}
                                </p>
                            )}
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
}

function Fact({
    icon: Icon,
    label,
    value,
}: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: React.ReactNode;
}) {
    return (
        <div className="surface p-3.5">
            <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
                {label}
            </dt>
            <dd className="mt-1 text-lg font-bold tabular-nums">{value}</dd>
        </div>
    );
}
