'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, PackageOpen, WifiOff } from 'lucide-react';
import PaperCard, { PaperCardSkeleton } from '@/components/shop/PaperCard';
import { useCart } from '@/lib/cart';
import type { LevelDef } from '@/lib/catalog';
import type { ResourceKindDef } from '@/lib/resources';
import type { PaperListing, PaperListResponse } from '@/types/shop';

const PAGE_SIZE = 24;

/**
 * The stock on a category page, with the level pill row above it.
 *
 * Split out from the page so the heading and the description stay server
 * rendered — a crawler gets the whole of what this page claims to be without
 * waiting for an API — while the part that has to feel instant when you tap a
 * level is client side.
 */
export default function KindResults({ kind, levels }: { kind: ResourceKindDef; levels: LevelDef[] }) {
    const router = useRouter();
    const cart = useCart();

    const [level, setLevel] = useState<string | undefined>(undefined);
    const [papers, setPapers] = useState<PaperListing[]>([]);
    const [response, setResponse] = useState<PaperListResponse | null>(null);
    const [loading, setLoading] = useState(true);
    /**
     * A failed load is not an empty shelf.
     *
     * Without this the page reads `response?.total ?? 0` after a network error
     * and announces "0 schemes of work" — telling a visitor the stock does not
     * exist when the truth is that we could not go and look.
     */
    const [failed, setFailed] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [offset, setOffset] = useState(0);
    /* Bumped to re-run the fetch. Setting a filter back to its current value
       would not, so "Try again" needs something that actually changes. */
    const [reloadKey, setReloadKey] = useState(0);

    const queryString = useMemo(
        () => (from: number) => {
            const params = new URLSearchParams({ kind: kind.slug, sort: 'newest' });
            if (level) params.set('level', level);
            params.set('limit', String(PAGE_SIZE));
            params.set('offset', String(from));
            return params.toString();
        },
        [kind.slug, level]
    );

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setFailed(false);
        setOffset(0);

        fetch(`/api/papers?${queryString(0)}`)
            .then((res) => res.json())
            .then((data: PaperListResponse & { error?: string }) => {
                if (cancelled) return;
                if (data.error) {
                    console.error('GET /api/papers:', data.error);
                    toast.error('Could not load these right now. Please try again.');
                    setFailed(true);
                    return;
                }
                setPapers(data.papers || []);
                setResponse(data);
            })
            .catch(() => {
                if (cancelled) return;
                toast.error('Could not load these. Check your connection.');
                setFailed(true);
            })
            .finally(() => !cancelled && setLoading(false));

        return () => {
            cancelled = true;
        };
    }, [queryString, reloadKey]);

    const loadMore = async () => {
        const next = offset + PAGE_SIZE;
        setLoadingMore(true);
        try {
            const res = await fetch(`/api/papers?${queryString(next)}`);
            const data: PaperListResponse = await res.json();
            setPapers((current) => [...current, ...(data.papers || [])]);
            setResponse(data);
            setOffset(next);
        } catch {
            toast.error('Could not load more.');
        } finally {
            setLoadingMore(false);
        }
    };

    const handleToggleCart = (paper: PaperListing) => {
        const added = cart.toggle(paper);
        toast.success(added ? `Added “${paper.title}” to your cart` : 'Removed from cart');
    };

    /** Free resources and ones already owned download straight away. */
    const handleDownload = async (paper: PaperListing) => {
        try {
            const res = await fetch(`/api/papers/${paper.id}/download`);
            const data = await res.json();

            if (res.status === 401) {
                toast.error('Sign in to download this');
                router.push(`/auth/login?next=/papers/${paper.slug || paper.id}`);
                return;
            }
            if (!res.ok) {
                toast.error(data.error || 'Could not start the download');
                return;
            }
            window.open(data.url, '_blank', 'noopener');
        } catch {
            toast.error('Could not start the download');
        }
    };

    return (
        <>
            {/* The level row. `chip` is already a pill — rounded-full, 36px tall
                — so this is the mockup's control with no new CSS. `rail-x`
                scrolls it sideways on a phone rather than stacking three rows. */}
            <div className="rail-x mt-8" role="group" aria-label="Filter by level">
                <button
                    type="button"
                    onClick={() => setLevel(undefined)}
                    className={level === undefined ? 'chip chip-active shrink-0' : 'chip shrink-0'}
                    aria-pressed={level === undefined}
                >
                    All levels
                </button>
                {levels.map((option) => (
                    <button
                        key={option.slug}
                        type="button"
                        onClick={() => setLevel(option.slug)}
                        className={level === option.slug ? 'chip chip-active shrink-0' : 'chip shrink-0'}
                        aria-pressed={level === option.slug}
                    >
                        {option.name}
                    </button>
                ))}
            </div>

            <p className="overline mt-8">
                {loading
                    ? 'Loading'
                    : failed
                      ? kind.plural
                      : `${response?.total ?? 0} ${(response?.total ?? 0) === 1 ? kind.name.toLowerCase() : kind.plural.toLowerCase()}`}
            </p>

            {loading ? (
                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <PaperCardSkeleton key={i} index={i} />
                    ))}
                </div>
            ) : failed ? (
                <Unreachable onRetry={() => setReloadKey((n) => n + 1)} />
            ) : papers.length === 0 ? (
                <Empty kind={kind} levelled={Boolean(level)} onClear={() => setLevel(undefined)} />
            ) : (
                <>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                        {papers.map((paper, i) => (
                            <PaperCard
                                key={paper.id}
                                paper={paper}
                                index={i}
                                layout="stacked"
                                inCart={cart.has(paper.id)}
                                onToggleCart={handleToggleCart}
                                onDownload={handleDownload}
                            />
                        ))}
                    </div>

                    {response?.hasMore && (
                        <div className="mt-10 flex flex-col items-center gap-3">
                            <button type="button" onClick={loadMore} disabled={loadingMore} className="btn-outline">
                                {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                                Load more
                            </button>
                            <p className="figure text-xs text-muted-foreground">
                                {papers.length} of {response.total}
                            </p>
                        </div>
                    )}
                </>
            )}
        </>
    );
}

/**
 * We could not go and look.
 *
 * Distinct from `Empty` on purpose: one says the shelf is bare, the other says
 * the lights are off. Telling somebody a resource does not exist when it might
 * sends them to a competitor for something we have.
 */
function Unreachable({ onRetry }: { onRetry: () => void }) {
    return (
        <div className="surface mt-5 px-6 py-16 text-center">
            <WifiOff className="mx-auto mb-5 h-9 w-9 text-muted-foreground" aria-hidden />
            <h2 className="title-1">Could not load these just now</h2>
            <p className="lead mx-auto mt-3 max-w-md text-sm sm:text-base">
                That is a problem at our end or on the connection — not a sign that there is
                nothing here.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={onRetry} className="btn-primary">
                    Try again
                </button>
                <Link href="/contact" className="btn-outline">
                    Get help
                </Link>
            </div>
        </div>
    );
}

/**
 * Nothing here.
 *
 * Which of the two reasons it is matters: a level with none of this kind is a
 * gap in the stock and the fix is to widen the filter, whereas an empty kind
 * means it is not carried at all and no amount of filtering will help.
 */
function Empty({
    kind,
    levelled,
    onClear,
}: {
    kind: ResourceKindDef;
    levelled: boolean;
    onClear: () => void;
}) {
    return (
        <div className="surface relative mt-5 overflow-hidden px-6 py-16 text-center">
            <div className="ruled pointer-events-none absolute inset-0 opacity-40" aria-hidden />
            <div className="relative">
                <PackageOpen className="mx-auto mb-5 h-9 w-9 text-muted-foreground" aria-hidden />
                <h2 className="title-1">
                    {levelled ? `No ${kind.plural.toLowerCase()} for that class yet` : `No ${kind.plural.toLowerCase()} yet`}
                </h2>
                <p className="lead mx-auto mt-3 max-w-md text-sm sm:text-base">
                    {levelled
                        ? 'Try another class — the other levels may already be stocked.'
                        : 'Nothing is stocked here yet. The rest of the library is open in the meantime.'}
                </p>
                <div className="mt-7 flex flex-wrap justify-center gap-2">
                    {levelled && (
                        <button type="button" onClick={onClear} className="btn-outline">
                            Show every class
                        </button>
                    )}
                    <Link href="/catalog" className="btn-primary">
                        Browse everything
                    </Link>
                </div>
            </div>
        </div>
    );
}
