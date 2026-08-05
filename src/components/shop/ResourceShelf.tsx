import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { Shelf } from '@/services/discoveryService';
import { formatPrice, examTypeName } from '@/lib/catalog';
import { resourceKindName } from '@/lib/resources';
import { freshnessLabel } from '@/lib/examCalendar';

/**
 * One horizontal shelf of resources.
 *
 * Renders nothing at all when the shelf is empty. That is not defensive
 * tidiness — it is the contract every shelf in `discoveryService` is written
 * against, and the reason a catalogue with three papers in it does not show
 * four confident headings over the same paper three times.
 *
 * Scrolls sideways on a phone rather than wrapping into a tall grid. A shelf is
 * a suggestion, and a suggestion that pushes the rest of the page below the
 * fold has stopped being one.
 */
export default function ResourceShelf({ shelf }: { shelf: Shelf }) {
    if (shelf.items.length === 0) return null;

    const headingId = `shelf-${shelf.id}`;

    return (
        <section aria-labelledby={headingId} className="min-w-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                    <h2 id={headingId} className="title-2">
                        {shelf.heading}
                    </h2>
                    {shelf.reason && <p className="meta mt-1">{shelf.reason}</p>}
                </div>

                {shelf.href && (
                    <Link
                        href={shelf.href}
                        className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:text-primary/80"
                    >
                        See all
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                )}
            </div>

            <ul className="rail-x mt-4 -mx-1 px-1">
                {shelf.items.map((item, index) => (
                    <li key={item.id} className="w-[17rem] shrink-0 sm:w-[19rem]">
                        <ShelfCard item={item} index={index} />
                    </li>
                ))}
            </ul>
        </section>
    );
}

function ShelfCard({ item, index }: { item: Shelf['items'][number]; index: number }) {
    const free = item.price_cents === 0;
    const href = `/papers/${item.slug || item.id}`;

    // The kind leads, because on a mixed shelf "Scheme of work" versus "Past
    // paper" is the first thing that decides whether this is for you at all.
    const kicker = item.resource_kind
        ? resourceKindName(item.resource_kind)
        : examTypeName(item.exam_type);

    const meta = [item.grade_label, item.subject, item.year].filter(Boolean).join(' · ');
    const freshness = freshnessLabel(item.year);

    return (
        <Link
            href={href}
            className="sheet settle-in group flex h-full flex-col p-4"
            style={{ '--i': index % 12 } as React.CSSProperties}
        >
            <p className="overline">{kicker}</p>

            <h3 className="heading-ui mt-2.5 line-clamp-2 transition-colors group-hover:text-primary">
                {item.title}
            </h3>

            <p className="meta mt-1.5 line-clamp-1">{meta}</p>

            <div className="flex-1" />

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
                <span className="figure text-sm font-semibold">
                    {free ? (
                        <span className="text-success">Free</span>
                    ) : (
                        formatPrice(item.price_cents, item.currency)
                    )}
                </span>
                {/* Only ever what the row actually says. A paper with no year
                    gets no badge rather than an optimistic one — this is the
                    specific claim a teacher checks before paying. */}
                {freshness ? (
                    <span className="badge-soft">{freshness}</span>
                ) : (
                    item.has_marking_scheme && (
                        <span className="figure text-[10px] text-muted-foreground">+ scheme</span>
                    )
                )}
            </div>
        </Link>
    );
}
