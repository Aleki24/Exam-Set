'use client';

import React from 'react';
import Link from 'next/link';
import { Check, Download, FileText, Plus, ClipboardCheck, Clock } from 'lucide-react';
import type { PaperListing } from '@/types/shop';
import { examTypeName, formatPrice, LEVEL_BY_SLUG } from '@/lib/catalog';

interface PaperCardProps {
    paper: PaperListing;
    inCart: boolean;
    onToggleCart: (paper: PaperListing) => void;
    onDownload?: (paper: PaperListing) => void;
}

/**
 * One paper in the shop grid. Everything a buyer needs to decide is on the
 * card: what it is, what level it targets, whether the marking scheme comes
 * with it, and what it costs.
 */
export default function PaperCard({ paper, inCart, onToggleCart, onDownload }: PaperCardProps) {
    const level = paper.level_slug ? LEVEL_BY_SLUG[paper.level_slug] : undefined;
    const isFree = paper.price_cents === 0;
    const owned = Boolean(paper.owned);

    return (
        <article className="card-elevated group flex flex-col p-4">
            {/* Type + price */}
            <div className="mb-3 flex items-start justify-between gap-3">
                <span className="badge-soft">{examTypeName(paper.exam_type)}</span>
                {isFree ? <span className="badge-free">Free</span> : <span className="badge-price">{formatPrice(paper.price_cents, paper.currency)}</span>}
            </div>

            {/* Title */}
            <h3 className="text-[15px] font-bold leading-snug tracking-tight">
                <Link href={`/papers/${paper.slug || paper.id}`} className="hover:text-primary">
                    {paper.title}
                </Link>
            </h3>

            {/* Context line */}
            <p className="mt-1.5 text-xs text-muted-foreground">
                {[paper.subject, paper.grade_label || level?.short, paper.year, paper.paper_number]
                    .filter(Boolean)
                    .join(' · ')}
            </p>

            {/* Facts */}
            <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                {paper.total_marks > 0 && (
                    <div className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" />
                        <dt className="sr-only">Total marks</dt>
                        <dd className="tabular-nums">{paper.total_marks} marks</dd>
                    </div>
                )}
                {paper.question_count > 0 && (
                    <div className="flex items-center gap-1.5">
                        <dt className="sr-only">Questions</dt>
                        <dd className="tabular-nums">{paper.question_count} questions</dd>
                    </div>
                )}
                {paper.time_limit && (
                    <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        <dt className="sr-only">Duration</dt>
                        <dd>{paper.time_limit}</dd>
                    </div>
                )}
                {paper.has_marking_scheme && (
                    <div className="flex items-center gap-1.5 text-primary">
                        <ClipboardCheck className="h-3.5 w-3.5" />
                        <dt className="sr-only">Includes</dt>
                        <dd className="font-semibold">Marking scheme</dd>
                    </div>
                )}
            </dl>

            <div className="flex-1" />

            {/* Actions */}
            <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
                {owned || isFree ? (
                    <button type="button" onClick={() => onDownload?.(paper)} className="btn-primary flex-1">
                        <Download className="h-4 w-4" />
                        {owned && !isFree ? 'Download' : 'Get it free'}
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => onToggleCart(paper)}
                        className={inCart ? 'btn-outline flex-1' : 'btn-buy flex-1'}
                        aria-pressed={inCart}
                    >
                        {inCart ? (
                            <>
                                <Check className="h-4 w-4" />
                                In cart
                            </>
                        ) : (
                            <>
                                <Plus className="h-4 w-4" />
                                Add to cart
                            </>
                        )}
                    </button>
                )}
                <Link
                    href={`/papers/${paper.slug || paper.id}`}
                    className="btn-outline px-3"
                    aria-label={`View details for ${paper.title}`}
                >
                    Details
                </Link>
            </div>
        </article>
    );
}
