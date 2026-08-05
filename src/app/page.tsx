'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Search, SlidersHorizontal, X, PenSquare, Loader2, FileQuestion, Upload } from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import { useRole } from '@/lib/roles';
import PaperCard, { PaperCardSkeleton } from '@/components/shop/PaperCard';
import LevelStrip from '@/components/shop/LevelStrip';
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

            {/* Search + sort. Shares the nav's sticky region so the page has a
                single edge rather than two stacked bars. */}
            <div className="sticky top-16 z-40 border-b bar-blur">
                <div className="shell-width flex items-center gap-2 py-2.5">
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

            <div className="shell-width grid min-w-0 gap-8 py-6 lg:grid-cols-[212px_1fr]">
                {/* Desktop rail */}
                <aside className="hidden lg:block">
                    <div className="sticky top-[8.5rem] max-h-[calc(100vh-10rem)] scroll-panel pr-2">
                        <FilterRail
                            filters={filters}
                            facets={response?.facets}
                            subjects={subjects}
                            onChange={patchFilters}
                        />
                    </div>
                </aside>

                {/* Results */}
                <main className="min-w-0">
                    {/* Level strip: the fastest way in, and it doubles as the
                        page's only "hero" — no marketing, just the catalog. */}
                    <div className="mb-8">
                        <LevelStrip
                            active={filters.level}
                            counts={response?.facets?.levels}
                            onSelect={(level) => patchFilters({ level, grade: undefined })}
                        />
                    </div>

                    <AppliedFilters
                        filters={filters}
                        onChange={patchFilters}
                        onClearSearch={() => setSearchDraft('')}
                        onReset={resetFilters}
                    />

                    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
                        <div className="min-w-0">
                            <p className="overline mb-2.5">
                                {loading
                                    ? 'Loading'
                                    : `${response?.total ?? 0} paper${(response?.total ?? 0) === 1 ? '' : 's'}`}
                            </p>
                            <h1 className="display-2">
                                {activeSummary.length > 0 ? activeSummary.join(' · ') : 'Every exam paper'}
                            </h1>
                            {activeSummary.length === 0 && !filters.search && (
                                <p className="lead mt-3 max-w-md text-sm sm:text-[15px]">
                                    Question papers and marking schemes, ready to print.
                                </p>
                            )}
                        </div>

                        <Link href="/set" className="btn-outline shrink-0">
                            <PenSquare className="h-4 w-4" aria-hidden />
                            Set your own exam
                        </Link>
                    </header>

                    {loading ? (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <PaperCardSkeleton key={i} index={i} />
                            ))}
                        </div>
                    ) : papers.length === 0 ? (
                        <EmptyState
                            hasFilters={activeSummary.length > 0 || Boolean(filters.search)}
                            onReset={resetFilters}
                        />
                    ) : (
                        <>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                                {papers.map((paper, i) => (
                                    <PaperCard
                                        key={paper.id}
                                        paper={paper}
                                        index={i}
                                        inCart={cart.has(paper.id)}
                                        onToggleCart={handleToggleCart}
                                        onDownload={handleDownload}
                                    />
                                ))}
                            </div>

                            {response?.hasMore && (
                                <div className="mt-10 flex flex-col items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={loadMore}
                                        disabled={loadingMore}
                                        className="btn-outline"
                                    >
                                        {loadingMore ? (
                                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                        ) : null}
                                        Load more papers
                                    </button>
                                    <p className="figure text-[11px] text-muted-foreground">
                                        {papers.length} of {response.total}
                                    </p>
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

/**
 * Applied filters, restated above the results.
 *
 * The rail folds groups away, so this is the honest record of what is narrowing
 * the list — and the one place to undo any of it.
 */
function AppliedFilters({
    filters,
    onChange,
    onClearSearch,
    onReset,
}: {
    filters: PaperFilters;
    onChange: (patch: Partial<PaperFilters>) => void;
    onClearSearch: () => void;
    onReset: () => void;
}) {
    const applied: { label: string; clear: Partial<PaperFilters>; isSearch?: boolean }[] = [];

    if (filters.level) {
        const level = LEVELS.find((l) => l.slug === filters.level);
        applied.push({ label: level?.name ?? filters.level, clear: { level: undefined, grade: undefined } });
    }
    if (filters.grade) applied.push({ label: filters.grade, clear: { grade: undefined } });
    if (filters.exam_type) applied.push({ label: examTypeName(filters.exam_type), clear: { exam_type: undefined } });
    if (filters.subject) applied.push({ label: filters.subject, clear: { subject: undefined } });
    if (filters.term) applied.push({ label: filters.term, clear: { term: undefined } });
    if (filters.year) applied.push({ label: String(filters.year), clear: { year: undefined } });
    if (filters.price) {
        applied.push({ label: filters.price === 'free' ? 'Free' : 'Premium', clear: { price: undefined } });
    }
    if (filters.search) {
        applied.push({ label: `“${filters.search}”`, clear: { search: undefined }, isSearch: true });
    }

    if (applied.length === 0) return null;

    return (
        <div className="mb-6 flex flex-wrap items-center gap-1.5">
            {applied.map((item) => (
                <button
                    key={item.label}
                    type="button"
                    onClick={() => (item.isSearch ? onClearSearch() : onChange(item.clear))}
                    className="chip-applied"
                    aria-label={`Remove filter ${item.label}`}
                >
                    {item.label}
                    <X className="h-3 w-3 opacity-60" aria-hidden />
                </button>
            ))}
            {applied.length > 1 && (
                <button
                    type="button"
                    onClick={onReset}
                    className="ml-1 text-xs font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                    Clear all
                </button>
            )}
        </div>
    );
}

/**
 * The empty shop.
 *
 * An owner and a shopper are looking at the same screen for opposite reasons:
 * one has nothing to buy, the other has nothing stocked. Telling the person who
 * runs the shop to go and set an exam — when what they need is to upload the
 * PDFs sitting on their laptop — is the wrong instruction to the wrong person,
 * and it was the only one offered.
 */
function EmptyState({ hasFilters, onReset }: { hasFilters: boolean; onReset: () => void }) {
    const { isAdmin } = useRole();

    return (
        <div className="surface relative overflow-hidden px-6 py-20 text-center">
            {/* Ruled exercise-book lines, faded out — a blank page. */}
            <div className="ruled pointer-events-none absolute inset-0 opacity-40" aria-hidden />
            <div className="relative">
                <FileQuestion className="mx-auto mb-5 h-9 w-9 text-muted-foreground" aria-hidden />
                <h2 className="title-1">
                    {hasFilters ? 'No papers match this yet' : isAdmin ? 'Your shop has no papers yet' : 'No papers match this yet'}
                </h2>
                <p className="lead mx-auto mt-3 max-w-md text-sm sm:text-base">
                    {hasFilters
                        ? 'Try a wider level or exam type — or build the paper yourself from the question bank.'
                        : isAdmin
                          ? 'Upload the PDFs you already have, or build one from your question bank. Either way it appears here for sale straight away.'
                          : 'The catalog is empty. Check back shortly.'}
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-2">
                    {hasFilters && (
                        <button type="button" onClick={onReset} className="btn-outline">
                            Clear filters
                        </button>
                    )}
                    {isAdmin && (
                        <Link href="/papers/new" className="btn-buy">
                            <Upload className="h-4 w-4" aria-hidden />
                            Upload a paper
                        </Link>
                    )}
                    <Link href="/set" className={isAdmin ? 'btn-outline' : 'btn-primary'}>
                        <PenSquare className="h-4 w-4" aria-hidden />
                        Set an exam
                    </Link>
                </div>
            </div>
        </div>
    );
}
