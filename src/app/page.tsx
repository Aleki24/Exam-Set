'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Search, SlidersHorizontal, X, PenSquare, Loader2, FileQuestion } from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import PaperCard from '@/components/shop/PaperCard';
import FilterRail from '@/components/shop/FilterRail';
import { useCart } from '@/lib/cart';
import { LEVELS, examTypeName } from '@/lib/catalog';
import type { PaperFilters, PaperListing, PaperListResponse } from '@/types/shop';

const PAGE_SIZE = 24;

const SORTS = [
    { value: 'newest', label: 'Newest' },
    { value: 'popular', label: 'Most bought' },
    { value: 'price-asc', label: 'Price: low to high' },
    { value: 'price-desc', label: 'Price: high to low' },
    { value: 'title', label: 'A-Z' },
] as const;

/**
 * THE SHOP — the front door of the platform.
 *
 * No marketing landing page: the first thing anyone sees is the papers they can
 * buy, filtered the way a teacher actually shops (level, then exam type).
 */
export default function ShopPage() {
    const router = useRouter();
    const cart = useCart();

    const [filters, setFilters] = useState<PaperFilters>({ sort: 'newest' });
    const [searchDraft, setSearchDraft] = useState('');
    const [papers, setPapers] = useState<PaperListing[]>([]);
    const [response, setResponse] = useState<PaperListResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [offset, setOffset] = useState(0);
    const [showFiltersMobile, setShowFiltersMobile] = useState(false);

    // Debounce the search box so typing does not hammer the API.
    useEffect(() => {
        const timer = setTimeout(() => {
            setFilters((f) =>
                f.search === (searchDraft || undefined) ? f : { ...f, search: searchDraft || undefined }
            );
        }, 300);
        return () => clearTimeout(timer);
    }, [searchDraft]);

    const queryString = useCallback(
        (from: number) => {
            const params = new URLSearchParams();
            if (filters.level) params.set('level', filters.level);
            if (filters.grade) params.set('grade', filters.grade);
            if (filters.subject) params.set('subject', filters.subject);
            if (filters.exam_type) params.set('exam_type', filters.exam_type);
            if (filters.term) params.set('term', filters.term);
            if (filters.year) params.set('year', String(filters.year));
            if (filters.price) params.set('price', filters.price);
            if (filters.search) params.set('search', filters.search);
            if (filters.sort) params.set('sort', filters.sort);
            params.set('limit', String(PAGE_SIZE));
            params.set('offset', String(from));
            return params.toString();
        },
        [filters]
    );

    // Reload from the top whenever the filters change.
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setOffset(0);

        fetch(`/api/papers?${queryString(0)}`)
            .then((res) => res.json())
            .then((data: PaperListResponse & { error?: string }) => {
                if (cancelled) return;
                if (data.error) {
                    // The raw database message is useful in the console, not in
                    // a toast the buyer has to read.
                    console.error('GET /api/papers:', data.error);
                    toast.error('Could not load papers right now. Please try again.');
                    return;
                }
                setPapers(data.papers || []);
                setResponse(data);
            })
            .catch(() => !cancelled && toast.error('Could not load papers. Check your connection and try again.'))
            .finally(() => !cancelled && setLoading(false));

        return () => {
            cancelled = true;
        };
    }, [queryString]);

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
            toast.error('Could not load more papers.');
        } finally {
            setLoadingMore(false);
        }
    };

    const subjects = useMemo(
        () => Object.keys(response?.facets?.subjects || {}).sort((a, b) => a.localeCompare(b)),
        [response]
    );

    const patchFilters = (patch: Partial<PaperFilters>) => setFilters((f) => ({ ...f, ...patch }));
    const resetFilters = () => {
        setFilters({ sort: filters.sort });
        setSearchDraft('');
    };

    const handleToggleCart = (paper: PaperListing) => {
        const added = cart.toggle(paper);
        toast.success(added ? `Added "${paper.title}" to your cart` : 'Removed from cart');
    };

    /** Free papers and papers you already own download straight away. */
    const handleDownload = async (paper: PaperListing) => {
        try {
            const res = await fetch(`/api/papers/${paper.id}/download`);
            const data = await res.json();

            if (res.status === 401) {
                toast.error('Sign in to download this paper');
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

    const activeSummary = [
        filters.level && LEVELS.find((l) => l.slug === filters.level)?.name,
        filters.grade,
        filters.exam_type && examTypeName(filters.exam_type),
        filters.subject,
        filters.year,
    ].filter(Boolean);

    return (
        <div className="min-h-screen bg-background">
            <TopNav />

            {/* Search + sort bar */}
            <div className="sticky top-16 z-40 border-b bar-blur">
                <div className="shell-width flex items-center gap-2 py-3">
                    <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="search"
                            value={searchDraft}
                            onChange={(e) => setSearchDraft(e.target.value)}
                            placeholder="Search papers — subject, school, topic, year…"
                            className="field pl-9"
                            aria-label="Search papers"
                        />
                        {searchDraft && (
                            <button
                                type="button"
                                onClick={() => setSearchDraft('')}
                                className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-secondary"
                                aria-label="Clear search"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>

                    <select
                        value={filters.sort}
                        onChange={(e) => patchFilters({ sort: e.target.value as PaperFilters['sort'] })}
                        className="field hidden w-auto sm:block"
                        aria-label="Sort papers"
                    >
                        {SORTS.map((s) => (
                            <option key={s.value} value={s.value}>
                                {s.label}
                            </option>
                        ))}
                    </select>

                    <button type="button" onClick={() => setShowFiltersMobile(true)} className="btn-outline lg:hidden">
                        <SlidersHorizontal className="h-4 w-4" />
                        Filters
                    </button>
                </div>
            </div>

            <div className="shell-width grid gap-8 py-6 lg:grid-cols-[260px_1fr]">
                {/* Desktop rail */}
                <aside className="hidden lg:block">
                    <div className="sticky top-[8.5rem] max-h-[calc(100vh-10rem)] scroll-panel pr-2">
                        <FilterRail
                            filters={filters}
                            facets={response?.facets}
                            subjects={subjects}
                            onChange={patchFilters}
                            onReset={resetFilters}
                        />
                    </div>
                </aside>

                {/* Results */}
                <main>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h1 className="text-xl font-bold tracking-tight">
                                {activeSummary.length > 0 ? activeSummary.join(' · ') : 'All exam papers'}
                            </h1>
                            <p className="mt-0.5 text-sm text-muted-foreground">
                                {loading
                                    ? 'Loading…'
                                    : `${response?.total ?? 0} paper${(response?.total ?? 0) === 1 ? '' : 's'} available`}
                            </p>
                        </div>

                        <Link href="/set" className="btn-outline">
                            <PenSquare className="h-4 w-4" />
                            Set your own exam
                        </Link>
                    </div>

                    {loading ? (
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="surface h-52 animate-pulse bg-secondary/60" />
                            ))}
                        </div>
                    ) : papers.length === 0 ? (
                        <EmptyState
                            hasFilters={activeSummary.length > 0 || Boolean(filters.search)}
                            onReset={resetFilters}
                        />
                    ) : (
                        <>
                            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                {papers.map((paper) => (
                                    <PaperCard
                                        key={paper.id}
                                        paper={paper}
                                        inCart={cart.has(paper.id)}
                                        onToggleCart={handleToggleCart}
                                        onDownload={handleDownload}
                                    />
                                ))}
                            </div>

                            {response?.hasMore && (
                                <div className="mt-8 flex justify-center">
                                    <button
                                        type="button"
                                        onClick={loadMore}
                                        disabled={loadingMore}
                                        className="btn-outline"
                                    >
                                        {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                        Load more papers
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </main>
            </div>

            {/* Mobile filter sheet */}
            {showFiltersMobile && (
                <div className="fixed inset-0 z-50 lg:hidden">
                    <div
                        className="absolute inset-0 bg-foreground/40"
                        onClick={() => setShowFiltersMobile(false)}
                        aria-hidden
                    />
                    <div className="absolute inset-y-0 right-0 flex w-[85%] max-w-sm flex-col bg-card shadow-xl">
                        <div className="flex items-center justify-between border-b border-border p-4">
                            <h2 className="font-bold">Filters</h2>
                            <button
                                type="button"
                                onClick={() => setShowFiltersMobile(false)}
                                className="grid h-9 w-9 place-items-center rounded-lg hover:bg-secondary"
                                aria-label="Close filters"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="flex-1 scroll-panel p-4">
                            <FilterRail
                                filters={filters}
                                facets={response?.facets}
                                subjects={subjects}
                                onChange={patchFilters}
                                onReset={resetFilters}
                            />
                        </div>
                        <div className="border-t border-border p-4">
                            <button
                                type="button"
                                onClick={() => setShowFiltersMobile(false)}
                                className="btn-primary w-full"
                            >
                                Show {response?.total ?? 0} papers
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function EmptyState({ hasFilters, onReset }: { hasFilters: boolean; onReset: () => void }) {
    return (
        <div className="surface flex flex-col items-center justify-center px-6 py-16 text-center">
            <FileQuestion className="mb-4 h-10 w-10 text-muted-foreground" />
            <h2 className="text-lg font-bold">No papers match this yet</h2>
            <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
                {hasFilters
                    ? 'Try a wider level or exam type — or build the paper yourself from the question bank.'
                    : 'The catalog is empty. Publish your first paper from the setter and it appears here.'}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
                {hasFilters && (
                    <button type="button" onClick={onReset} className="btn-outline">
                        Clear filters
                    </button>
                )}
                <Link href="/set" className="btn-primary">
                    <PenSquare className="h-4 w-4" />
                    Set an exam
                </Link>
            </div>
        </div>
    );
}
