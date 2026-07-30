'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Check, ClipboardCheck, Clock, Download, Plus } from 'lucide-react';
import type { PaperListing } from '@/types/shop';
import { examTypeName, formatPrice, LEVEL_BY_SLUG } from '@/lib/catalog';

interface PaperCardProps {
    paper: PaperListing;
    inCart: boolean;
    onToggleCart: (paper: PaperListing) => void;
    onDownload?: (paper: PaperListing) => void;
    /** Stagger index for the entry reveal. */
    index?: number;
}

/**
 * One paper in the shop grid, built as a "sheet": white page on the warm
 * ground, exam type as a mono kicker, title in the display serif, and the mark
 * total set in the margin like an examiner's note.
 *
 * Everything a buyer needs to decide is on the card — level, marks, duration,
 * whether the marking scheme is included, and the price.
 */
export default function PaperCard({ paper, inCart, onToggleCart, onDownload, index = 0 }: PaperCardProps) {
    const level = paper.level_slug ? LEVEL_BY_SLUG[paper.level_slug] : undefined;
    const isFree = paper.price_cents === 0;
    const owned = Boolean(paper.owned);

    const context = [paper.subject, paper.grade_label || level?.short, paper.year, paper.paper_number]
        .filter(Boolean)
        .join(' · ');

    return (
        <article
            className="sheet group rise-in flex flex-col p-5"
            style={{ '--i': index % 12 } as React.CSSProperties}
        >
            {/* Kicker + price */}
            <header className="mb-3 flex items-start justify-between gap-3">
                <span className="overline pt-0.5">{examTypeName(paper.exam_type)}</span>
                {isFree ? (
                    <span className="badge-free shrink-0">Free</span>
                ) : (
                    <span className="figure shrink-0 text-sm font-bold text-accent">
                        {formatPrice(paper.price_cents, paper.currency)}
                    </span>
                )}
            </header>

            {/* Title */}
            <h3 className="title-2 pr-2">
                <Link
                    href={`/papers/${paper.slug || paper.id}`}
                    className="transition-colors hover:text-primary focus-visible:text-primary"
                >
                    {paper.title}
                </Link>
            </h3>

            <p className="meta mt-2">{context}</p>

            {/* Facts */}
            <dl className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                {paper.total_marks > 0 && (
                    <div className="flex items-baseline gap-1.5">
                        <dt className="sr-only">Total marks</dt>
                        <dd className="badge-marks">{paper.total_marks} marks</dd>
                    </div>
                )}
                {paper.question_count > 0 && (
                    <div className="flex items-baseline gap-1.5">
                        <dt className="sr-only">Questions</dt>
                        <dd className="figure text-[11px] text-muted-foreground">
                            {paper.question_count} questions
                        </dd>
                    </div>
                )}
                {paper.time_limit && (
                    <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                        <dt className="sr-only">Duration</dt>
                        <dd className="meta">{paper.time_limit}</dd>
                    </div>
                )}
            </dl>

            {paper.has_marking_scheme && (
                <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                    <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />
                    Marking scheme included
                </p>
            )}

            <div className="flex-1" />

            {/* Actions */}
            <footer className="mt-5 flex items-center gap-2 border-t border-border pt-4">
                {owned || isFree ? (
                    <button type="button" onClick={() => onDownload?.(paper)} className="btn-primary btn-sm flex-1">
                        <Download className="h-4 w-4" aria-hidden />
                        {owned && !isFree ? 'Download' : 'Get it free'}
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => onToggleCart(paper)}
                        className={inCart ? 'btn-outline btn-sm flex-1' : 'btn-buy btn-sm flex-1'}
                        aria-pressed={inCart}
                    >
                        {inCart ? (
                            <>
                                <Check className="h-4 w-4" aria-hidden />
                                In cart
                            </>
                        ) : (
                            <>
                                <Plus className="h-4 w-4" aria-hidden />
                                Add to cart
                            </>
                        )}
                    </button>
                )}

                <Link
                    href={`/papers/${paper.slug || paper.id}`}
                    className="btn-ghost btn-sm gap-1"
                    aria-label={`View details for ${paper.title}`}
                >
                    Details
                    <ArrowRight
                        className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                        aria-hidden
                    />
                </Link>
            </footer>
        </article>
    );
}

/** Placeholder that holds the real card's shape while the shop loads. */
export function PaperCardSkeleton({ index = 0 }: { index?: number }) {
    return (
        <div className="surface fade-in p-5" style={{ '--i': index } as React.CSSProperties}>
            <div className="flex justify-between">
                <div className="skeleton h-3 w-24" />
                <div className="skeleton h-3 w-14" />
            </div>
            <div className="skeleton mt-4 h-5 w-full" />
            <div className="skeleton mt-2 h-5 w-2/3" />
            <div className="skeleton mt-4 h-3 w-40" />
            <div className="mt-5 flex gap-4">
                <div className="skeleton h-3 w-16" />
                <div className="skeleton h-3 w-20" />
            </div>
            <div className="mt-6 border-t border-border pt-4">
                <div className="skeleton h-9 w-full" />
            </div>
        </div>
    );
}
