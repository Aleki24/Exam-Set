'use client';

import React from 'react';
import Link from 'next/link';
import { Check, Download, Plus } from 'lucide-react';
import type { PaperListing } from '@/types/shop';
import { examTypeName, formatPrice, LEVEL_BY_SLUG } from '@/lib/catalog';

interface PaperCardProps {
    paper: PaperListing;
    inCart: boolean;
    onToggleCart: (paper: PaperListing) => void;
    onDownload?: (paper: PaperListing) => void;
    /** Stagger index for the entry reveal. */
    index?: number;
    /**
     * Suppresses the set name in the eyebrow. For the set page itself, where
     * the heading already says it and eight cards repeating it is noise.
     */
    hideSet?: boolean;
    /**
     * `compact` keeps the price and the action on one row — right for a dense
     * shop grid. `stacked` gives the action the full width of the card, which
     * is the bigger tap target a category page wants.
     *
     * Defaults to `compact` so every existing grid is untouched.
     */
    layout?: 'compact' | 'stacked';
}

/**
 * One paper in the shop grid.
 *
 * Built for a grid of thirty: the title carries the weight, everything else is
 * one quiet line of metadata, and exactly one element is coloured — the action.
 * The whole card is the link to the detail page, so the only button on it is the
 * commerce action.
 */
export default function PaperCard({
    paper,
    inCart,
    onToggleCart,
    onDownload,
    index = 0,
    hideSet = false,
    layout = 'compact',
}: PaperCardProps) {
    const stacked = layout === 'stacked';
    const level = paper.level_slug ? LEVEL_BY_SLUG[paper.level_slug] : undefined;
    const isFree = paper.price_cents === 0;
    const owned = Boolean(paper.owned);
    const href = `/papers/${paper.slug || paper.id}`;

    // One line, in the order a teacher scans: what level, which subject, when.
    const meta = [paper.grade_label || level?.short, paper.subject, paper.year].filter(Boolean).join(' · ');

    // Facts fold into a single short line. Duration is deliberately left to the
    // detail page: on a card it only ever caused a wrap.
    const facts = [
        paper.total_marks > 0 ? `${paper.total_marks} marks` : null,
        paper.question_count > 0 ? `${paper.question_count} questions` : null,
        paper.has_marking_scheme ? '+ scheme' : null,
    ]
        .filter(Boolean)
        .join(' · ');

    return (
        <article
            className="sheet settle-in group relative flex flex-col p-4"
            style={{ '--i': index % 12 } as React.CSSProperties}
        >
            {/* The card is the link. Sits under the content so the action button
                stays clickable, and gives the whole surface a single target. */}
            <Link href={href} className="absolute inset-0 rounded-[inherit]" aria-label={paper.title}>
                <span className="sr-only">{paper.title}</span>
            </Link>

            {/* The sitting, when there is one. It replaces the exam type rather
                than joining it: "Kabras Mock End Term 2 2025" already says the
                exam type, and a card in a grid of thirty has room for one
                eyebrow, not two. */}
            <p className="overline truncate" title={paper.set_name || undefined}>
                {(!hideSet && paper.set_name) || examTypeName(paper.exam_type)}
            </p>

            <h3 className="heading-ui mt-2 transition-colors group-hover:text-primary">{paper.title}</h3>

            <p className="meta mt-1.5">{meta}</p>

            <div className="flex-1" />

            <p className="figure mt-3 text-[11px] leading-relaxed text-muted-foreground">{facts}</p>

            {/* Price and action share the last line: the decision, in one place. */}
            <div
                className={
                    stacked
                        ? 'relative mt-3 border-t border-border pt-3'
                        : 'relative mt-3 flex items-center justify-between gap-3 border-t border-border pt-3'
                }
            >
                <span className={stacked ? 'figure block text-sm font-semibold' : 'figure text-sm font-semibold'}>
                    {isFree ? <span className="text-success">Free</span> : formatPrice(paper.price_cents, paper.currency)}
                </span>

                {owned || isFree ? (
                    <button
                        type="button"
                        onClick={() => onDownload?.(paper)}
                        className={stacked ? 'btn-primary mt-3 w-full' : 'btn-primary btn-sm'}
                    >
                        <Download className="h-3.5 w-3.5" aria-hidden />
                        {owned && !isFree ? 'Download' : 'Get it'}
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => onToggleCart(paper)}
                        className={
                            stacked
                                ? `${inCart ? 'btn-outline' : 'btn-primary'} mt-3 w-full`
                                : inCart
                                  ? 'btn-outline btn-sm'
                                  : 'btn-primary btn-sm'
                        }
                        aria-pressed={inCart}
                    >
                        {inCart ? (
                            <>
                                <Check className="h-3.5 w-3.5" aria-hidden />
                                In cart
                            </>
                        ) : (
                            <>
                                <Plus className="h-3.5 w-3.5" aria-hidden />
                                {stacked ? 'Add to cart' : 'Add'}
                            </>
                        )}
                    </button>
                )}
            </div>
        </article>
    );
}

/** Placeholder that holds the real card's shape while the shop loads. */
export function PaperCardSkeleton({ index = 0 }: { index?: number }) {
    return (
        <div className="surface fade-in p-4" style={{ '--i': index } as React.CSSProperties}>
            <div className="skeleton h-2.5 w-20" />
            <div className="skeleton mt-3 h-4 w-full" />
            <div className="skeleton mt-2 h-4 w-3/5" />
            <div className="skeleton mt-3 h-3 w-40" />
            <div className="skeleton mt-6 h-3 w-52" />
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <div className="skeleton h-4 w-16" />
                <div className="skeleton h-9 w-20" />
            </div>
        </div>
    );
}
