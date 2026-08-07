import React from 'react';
import Link from 'next/link';
import {
    ArrowRight,
    BookMarked,
    BookOpen,
    CalendarDays,
    CalendarRange,
    ClipboardCheck,
    ClipboardList,
    Compass,
    FileText,
    ListChecks,
    NotebookPen,
    Presentation,
    Ruler,
    ScrollText,
    Sun,
    Timer,
    TrendingUp,
    type LucideIcon,
} from 'lucide-react';
import type { ResourceKind, ResourceKindDef } from '@/lib/resources';

/**
 * A kind of resource, as a card.
 *
 * The information architecture already named this thing — "the kind tile on
 * /learn, and it is `sheet` with a different arrangement of the same parts, not
 * a new component idea". This is that tile, extracted so the landing page, the
 * catalogue and every level page render one component instead of three
 * lookalikes that drift.
 *
 * A server component on purpose: it is a link with no interactive children, so
 * it costs no JavaScript on the pages that lean on it hardest.
 */

/**
 * Icons live here rather than on `ResourceKindDef`, because `lib/resources.ts`
 * is imported by the sitemap, the API routes and the services — none of which
 * should be dragging an icon library into their bundle to describe a taxonomy.
 */
const KIND_ICONS: Record<ResourceKind, LucideIcon> = {
    'past-paper': FileText,
    'marking-scheme': ClipboardCheck,
    'termly-exam': CalendarDays,
    mock: Timer,
    prediction: TrendingUp,
    topical: ListChecks,
    'revision-booklet': BookOpen,
    'holiday-assignment': Sun,
    notes: NotebookPen,
    'setbook-guide': BookMarked,
    'scheme-of-work': CalendarRange,
    'lesson-plan': Presentation,
    'record-of-work': ClipboardList,
    'curriculum-design': Compass,
    'assessment-tools': Ruler,
    syllabus: ScrollText,
};

interface KindCardProps {
    kind: ResourceKindDef;
    /**
     * How many of these are actually stocked.
     *
     * `undefined` means "not known" — the facets have not loaded, or the
     * request failed — and the card then says nothing at all about quantity.
     * That distinction is the whole point: a card that prints "0 resources"
     * when it simply could not count is a lie, and one that prints a made-up
     * number is a worse one.
     */
    count?: number;
    href: string;
    index?: number;
    /** Off when the cards are already grouped under their family heading. */
    showFamily?: boolean;
}

export default function KindCard({ kind, count, href, index = 0, showFamily = true }: KindCardProps) {
    const Icon = KIND_ICONS[kind.slug] ?? FileText;

    return (
        <article
            className="sheet settle-in group relative flex h-full flex-col p-5"
            style={{ '--i': index % 12 } as React.CSSProperties}
        >
            <Link href={href} className="absolute inset-0 rounded-[inherit]">
                <span className="sr-only">{kind.plural}</span>
            </Link>

            <Icon
                className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary"
                aria-hidden
            />

            {showFamily && <p className="overline mt-4">{kind.family}</p>}

            <h3 className={`heading-ui transition-colors group-hover:text-primary ${showFamily ? 'mt-2' : 'mt-4'}`}>
                {kind.plural}
            </h3>

            <p className="meta mt-1.5">{kind.description}</p>

            <div className="flex-1" />

            <p className="relative mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
                <CountLabel count={count} />
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                    Browse
                    <ArrowRight
                        className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                        aria-hidden
                    />
                </span>
            </p>
        </article>
    );
}

/** Zero is a fact worth stating. Not knowing is not. */
function CountLabel({ count }: { count?: number }) {
    if (count === undefined) return <span />;

    if (count === 0) {
        return <span className="meta">Nothing stocked yet</span>;
    }

    return (
        <span className="figure text-[11px] text-muted-foreground">
            {count} resource{count === 1 ? '' : 's'}
        </span>
    );
}
