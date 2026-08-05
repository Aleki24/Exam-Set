'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ClipboardCheck, Download, FileText, Loader2, PenSquare, Receipt, Trash2 } from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import { examTypeName, formatPrice } from '@/lib/catalog';
import type { SubscriptionStatus } from '@/lib/plans';
import type { Order, PaperListing } from '@/types/shop';

type Tab = 'purchased' | 'sets' | 'orders';

interface LibraryData {
    purchased: (PaperListing & { entitlement_kind?: string })[];
    sets: PaperListing[];
    orders: Order[];
}

const STATUS_LABELS: Record<string, string> = {
    pending: 'Not paid',
    awaiting_confirmation: 'Confirming payment',
    paid: 'Paid',
    failed: 'Failed',
    cancelled: 'Cancelled',
};

/** Everything the user owns: bought papers, their own sets, and receipts. */
export default function LibraryPage() {
    const router = useRouter();
    const [tab, setTab] = useState<Tab>('purchased');
    const [data, setData] = useState<LibraryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);

    useEffect(() => {
        // A pass changes what "my papers" means — the list stops being the limit
        // of what can be opened — so the library has to say whether one is live.
        fetch('/api/plans')
            .then((res) => res.json())
            .then((payload) => setSubscription(payload.subscription ?? { active: false }))
            .catch(() => setSubscription({ active: false }));
    }, []);

    useEffect(() => {
        fetch('/api/library')
            .then(async (res) => {
                if (res.status === 401) {
                    router.push('/auth/login?next=/library');
                    return null;
                }
                return res.json();
            })
            .then((payload) => payload && setData(payload))
            .catch(() => toast.error('Could not load your library'))
            .finally(() => setLoading(false));
    }, [router]);

    /**
     * Deletes a paper this account set.
     *
     * The refusals — sold, or already sat by somebody — are decided on the
     * server and come back as sentences worth reading, so they are shown as
     * they arrive rather than replaced with a generic failure.
     */
    const remove = async (paper: PaperListing) => {
        const confirmed = window.confirm(
            `Delete “${paper.title}”?\n\nThis removes the paper and its generated files. The questions stay in the bank.`
        );
        if (!confirmed) return;

        try {
            const res = await fetch(`/api/papers/${paper.id}`, { method: 'DELETE' });
            const payload = await res.json();

            if (!res.ok) {
                toast.error(payload.error || 'Could not delete this paper');
                return;
            }

            // Taken out of the list here rather than by refetching: the row is
            // gone, and asking the server to confirm what it just told us is a
            // round trip for nothing.
            setData((current) =>
                current ? { ...current, sets: current.sets.filter((p) => p.id !== paper.id) } : current
            );

            toast.success(payload.message || 'Paper deleted');
            if (payload.warning) toast.warning(payload.warning);
        } catch {
            toast.error('Could not delete this paper');
        }
    };

    const download = async (paper: PaperListing, asset: 'paper' | 'scheme') => {
        try {
            const res = await fetch(`/api/papers/${paper.id}/download?asset=${asset}`);
            const payload = await res.json();
            if (!res.ok) {
                toast.error(payload.error || 'Download failed');
                return;
            }
            window.open(payload.url, '_blank', 'noopener');
        } catch {
            toast.error('Download failed');
        }
    };

    const tabs: { id: Tab; label: string; count: number }[] = [
        { id: 'purchased', label: 'My papers', count: data?.purchased.length ?? 0 },
        { id: 'sets', label: 'Papers I set', count: data?.sets.length ?? 0 },
        { id: 'orders', label: 'Orders', count: data?.orders.length ?? 0 },
    ];

    return (
        <div className="min-h-screen bg-background">
            <TopNav />

            <div className="shell-width py-6">
                <p className="overline mb-2">Your account</p>
                <h1 className="display-2">My library</h1>

                {subscription?.active ? (
                    <div className="settle-in mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-success/30 bg-success/5 p-3.5">
                        <p className="text-sm">
                            <strong>{subscription.plan_name}</strong> · every paper on the site is yours to
                            download for another {subscription.days_left} day
                            {subscription.days_left === 1 ? '' : 's'}.
                        </p>
                        <Link href="/plans" className="text-sm font-semibold text-primary hover:underline">
                            Extend
                        </Link>
                    </div>
                ) : subscription ? (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3.5">
                        <p className="text-sm text-muted-foreground">
                            Buying several papers a term? One pass covers the whole catalogue.
                        </p>
                        <Link href="/plans" className="text-sm font-semibold text-primary hover:underline">
                            See the plans
                        </Link>
                    </div>
                ) : null}

                <div className="mt-5 flex gap-1 border-b border-border">
                    {tabs.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setTab(t.id)}
                            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                                tab === t.id
                                    ? 'border-primary text-foreground'
                                    : 'border-transparent text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {t.label}
                            <span className="figure ml-1.5 text-[11px] text-muted-foreground">{t.count}</span>
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="skeleton h-36" />
                        ))}
                    </div>
                ) : (
                    <div className="mt-6">
                        {tab === 'purchased' &&
                            (data?.purchased.length ? (
                                <PurchasedPapers papers={data.purchased} onDownload={download} />
                            ) : (
                                <Empty
                                    title="No papers yet"
                                    body="Papers you buy or claim for free land here, ready to download any time."
                                    action={{ href: '/', label: 'Browse papers' }}
                                />
                            ))}

                        {tab === 'sets' &&
                            (data?.sets.length ? (
                                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                                    {data.sets.map((paper) => (
                                        <OwnedCard
                                            key={paper.id}
                                            paper={paper}
                                            onDownload={download}
                                            onDelete={remove}
                                            isOwnSet
                                        />
                                    ))}
                                </div>
                            ) : (
                                <Empty
                                    title="You have not set a paper yet"
                                    body="Pick questions from the bank, hit a mark target, and save the paper here."
                                    action={{ href: '/set', label: 'Set an exam' }}
                                />
                            ))}

                        {tab === 'orders' &&
                            (data?.orders.length ? (
                                <div className="surface divide-y divide-border">
                                    {data.orders.map((order) => (
                                        <div key={order.id} className="flex items-center gap-4 p-4">
                                            <Receipt className="h-4 w-4 shrink-0 text-muted-foreground" />
                                            <div className="min-w-0 flex-1">
                                                <p className="figure text-sm font-semibold">{order.reference}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {new Date(order.created_at).toLocaleDateString('en-KE', {
                                                        day: 'numeric',
                                                        month: 'short',
                                                        year: 'numeric',
                                                    })}
                                                </p>
                                            </div>
                                            <span className="figure text-sm font-bold">
                                                {formatPrice(order.total_cents, order.currency)}
                                            </span>
                                            <span
                                                className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ${
                                                    order.status === 'paid'
                                                        ? 'bg-success/15 text-success'
                                                        : order.status === 'failed' || order.status === 'cancelled'
                                                          ? 'bg-destructive/10 text-destructive'
                                                          : 'bg-accent/15 text-accent'
                                                }`}
                                            >
                                                {STATUS_LABELS[order.status] ?? order.status}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <Empty
                                    title="No orders yet"
                                    body="Your receipts appear here after your first purchase."
                                    action={{ href: '/', label: 'Browse papers' }}
                                />
                            ))}
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * Bought papers, grouped back into the sittings they were bought as.
 *
 * A teacher who buys a school's twelve-subject mock got one thing, and a flat
 * grid of twelve cards is the product forgetting that between the checkout and
 * the library. Sets come first with their own heading and a single download;
 * anything ungrouped follows underneath, which is most of the library for most
 * people and stays exactly as it was.
 *
 * "Download all" is the existing /api/packs route — the same one /teach uses. It
 * checks `can_download_paper` for every id it is given, so grouping the buttons
 * grants nothing that clicking each card in turn would not.
 */
function PurchasedPapers({
    papers,
    onDownload,
}: {
    papers: (PaperListing & { entitlement_kind?: string })[];
    onDownload: (paper: PaperListing, asset: 'paper' | 'scheme') => void;
}) {
    const [packing, setPacking] = useState<string | null>(null);

    const grouped = new Map<string, { name: string; slug?: string; papers: PaperListing[] }>();
    const loose: PaperListing[] = [];

    for (const paper of papers) {
        if (!paper.set_id || !paper.set_name) {
            loose.push(paper);
            continue;
        }
        const bucket = grouped.get(paper.set_id) ?? {
            name: paper.set_name,
            slug: paper.set_slug,
            papers: [],
        };
        bucket.papers.push(paper);
        grouped.set(paper.set_id, bucket);
    }

    const downloadAll = async (setId: string, group: { name: string; papers: PaperListing[] }) => {
        setPacking(setId);
        try {
            const res = await fetch('/api/packs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ exam_ids: group.papers.map((p) => p.id), asset: 'both' }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || 'Could not build the download');
                return;
            }
            // Spaced out rather than fired at once: a browser silently drops a
            // burst of simultaneous downloads, and the pack route's own comment
            // says it hands back independent links precisely so the client can
            // pace them.
            for (const [i, item] of (data.items ?? []).entries()) {
                setTimeout(() => window.open(item.url, '_blank'), i * 400);
            }
            if (data.refused?.length) {
                toast.warning(`${data.refused.length} file(s) are not yours to download`);
            }
        } catch {
            toast.error('Could not build the download');
        } finally {
            setPacking(null);
        }
    };

    return (
        <div className="space-y-8">
            {[...grouped.entries()].map(([setId, group]) => (
                <section key={setId} aria-labelledby={`set-${setId}`}>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <h2 id={`set-${setId}`} className="overline">
                            {group.slug ? (
                                <Link href={`/sets/${group.slug}`} className="hover:text-primary">
                                    {group.name}
                                </Link>
                            ) : (
                                group.name
                            )}{' '}
                            · {group.papers.length}
                        </h2>
                        <button
                            type="button"
                            onClick={() => downloadAll(setId, group)}
                            disabled={packing === setId}
                            className="btn-outline btn-sm"
                        >
                            {packing === setId ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <Download className="h-3.5 w-3.5" />
                            )}
                            Download all
                        </button>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                        {group.papers.map((paper) => (
                            <OwnedCard key={paper.id} paper={paper} onDownload={onDownload} />
                        ))}
                    </div>
                </section>
            ))}

            {loose.length > 0 && (
                <section aria-labelledby="loose-papers">
                    {grouped.size > 0 && (
                        <h2 id="loose-papers" className="overline mb-3">
                            Other papers · {loose.length}
                        </h2>
                    )}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                        {loose.map((paper) => (
                            <OwnedCard key={paper.id} paper={paper} onDownload={onDownload} />
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}

function OwnedCard({
    paper,
    onDownload,
    onDelete,
    isOwnSet,
}: {
    paper: PaperListing;
    onDownload: (paper: PaperListing, asset: 'paper' | 'scheme') => void;
    onDelete?: (paper: PaperListing) => void;
    isOwnSet?: boolean;
}) {
    const [busy, setBusy] = useState(false);

    const go = async (asset: 'paper' | 'scheme') => {
        setBusy(true);
        await onDownload(paper, asset);
        setBusy(false);
    };

    return (
        <article className="sheet flex flex-col p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
                <span className="badge-soft">{examTypeName(paper.exam_type)}</span>
                {isOwnSet && !paper.is_published && (
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Draft
                    </span>
                )}
            </div>
            <h3 className="title-2">{paper.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
                {[paper.subject, paper.grade_label, paper.year].filter(Boolean).join(' · ')}
                {paper.total_marks ? ` · ${paper.total_marks} marks` : ''}
            </p>

            <div className="flex-1" />

            <div className="mt-4 flex gap-2 border-t border-border pt-3">
                <button type="button" onClick={() => go('paper')} disabled={busy} className="btn-outline flex-1">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Paper
                </button>
                {paper.has_marking_scheme && (
                    <button type="button" onClick={() => go('scheme')} disabled={busy} className="btn-outline flex-1">
                        <ClipboardCheck className="h-4 w-4" />
                        Scheme
                    </button>
                )}
                {isOwnSet && (
                    <Link href={`/set?load=${paper.id}`} className="btn-outline px-3" aria-label="Edit this paper">
                        <PenSquare className="h-4 w-4" />
                    </Link>
                )}
                {isOwnSet && onDelete && (
                    <button
                        type="button"
                        onClick={() => onDelete(paper)}
                        className="btn-outline px-3 text-destructive hover:bg-destructive/10"
                        aria-label={`Delete ${paper.title}`}
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                )}
            </div>
        </article>
    );
}

function Empty({
    title,
    body,
    action,
}: {
    title: string;
    body: string;
    action: { href: string; label: string };
}) {
    return (
        <div className="surface flex flex-col items-center px-6 py-16 text-center">
            <FileText className="mb-4 h-10 w-10 text-muted-foreground" />
            <h2 className="title-1">{title}</h2>
            <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{body}</p>
            <Link href={action.href} className="btn-primary mt-6">
                {action.label}
            </Link>
        </div>
    );
}
