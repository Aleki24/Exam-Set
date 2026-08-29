'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Loader2, Lock } from 'lucide-react';
import type { PaperListing } from '@/types/shop';

/**
 * THE DOCUMENT, AS A DOCUMENT
 * ----------------------------------------------------------------------------
 * A reader in the shape people already know from every document site: sheets of
 * paper stacked in a scroller, a page counter that follows what you are looking
 * at, and — where the preview stops — a locked sheet that says so and points at
 * the price rather than pretending the document ended.
 *
 * That last part is the whole design. A preview that simply runs out looks like
 * a broken page; one that shows a closed door looks like a purchase. The lock
 * is a real boundary, not a CSS one: the pages past it were never parsed, never
 * left the server, and are not sitting in the DOM under a blur.
 *
 * `PaperCover` still exists and is still right for a grid, where a typeset mock
 * of a front page is all that fits. This is for the detail page, where somebody
 * has already decided to look properly.
 */

type PreviewPage =
    | { kind: 'image'; dataUrl: string; width: number; height: number }
    | { kind: 'text'; text: string }
    | { kind: 'html'; html: string };

interface PreviewData {
    pages: PreviewPage[];
    totalPages: number | null;
    previewPages?: number;
    unavailable?: string;
}

export default function DocumentPreview({
    paper,
    owned,
    onBuy,
}: {
    paper: PaperListing;
    owned: boolean;
    onBuy?: () => void;
}) {
    const [data, setData] = useState<PreviewData | null>(null);
    const [loading, setLoading] = useState(true);
    const [current, setCurrent] = useState(1);

    const scroller = useRef<HTMLDivElement>(null);
    const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);

        fetch(`/api/papers/${paper.slug || paper.id}/preview`)
            .then((res) => res.json())
            .then((body) => {
                if (!cancelled) setData(body);
            })
            .catch(() => {
                // A preview is an extra. Its failure must not colour a page
                // whose real job — selling the paper — is unaffected.
                if (!cancelled) setData({ pages: [], totalPages: null, unavailable: 'No preview available.' });
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [paper.slug, paper.id]);

    /*
     * The counter follows the page you are actually reading rather than the one
     * you last clicked to, which is what makes it feel like a document and not
     * a slideshow. An observer rather than a scroll handler: it fires once when
     * a page crosses the middle, instead of on every frame of a flick scroll.
     */
    useEffect(() => {
        const root = scroller.current;
        if (!root || !data?.pages.length) return;

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    const index = pageRefs.current.indexOf(entry.target as HTMLDivElement);
                    if (index >= 0) setCurrent(index + 1);
                }
            },
            { root, threshold: 0.5 }
        );

        for (const page of pageRefs.current) if (page) observer.observe(page);
        return () => observer.disconnect();
    }, [data]);

    const go = (page: number) => {
        const target = pageRefs.current[page - 1];
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    if (loading) {
        return (
            <section className="mt-10">
                <h2 className="overline mb-4">Look inside</h2>
                <figure className="surface flex h-64 items-center justify-center overflow-hidden bg-paper">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
                    <span className="sr-only">Loading the preview</span>
                </figure>
            </section>
        );
    }

    /*
     * Nothing to show, so nothing is shown — heading included.
     *
     * A legacy .doc, a scan in a filter this build does not read, a paper whose
     * file is generated on first download: all real, and all better served by
     * the page simply not claiming to have a preview. The typeset cover in the
     * buy rail is still there, doing the job it was always doing.
     */
    if (!data || data.pages.length === 0) return null;

    const shown = data.pages.length;
    const total = data.totalPages;
    const moreToCome = !owned && (total === null || total > shown);

    return (
        <section className="mt-10">
            <h2 className="overline mb-4">Look inside</h2>
            <figure className="surface overflow-hidden">
            {/* Reader chrome. Page counter left, movement right — the
                arrangement every document reader uses, so nobody has to learn
                this one. */}
            <figcaption className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                <span className="figure text-[11px] font-semibold text-muted-foreground">
                    Page {current} of {total ?? shown}
                    {total !== null && total > shown ? ` · previewing ${shown}` : ''}
                </span>
                <span className="hidden items-center gap-1 sm:flex">
                    <button
                        type="button"
                        onClick={() => go(Math.max(1, current - 1))}
                        disabled={current <= 1}
                        className="grid h-7 w-7 place-items-center rounded hover:bg-secondary disabled:opacity-40"
                        aria-label="Previous page"
                    >
                        <ChevronLeft className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                        type="button"
                        onClick={() => go(Math.min(shown, current + 1))}
                        disabled={current >= shown}
                        className="grid h-7 w-7 place-items-center rounded hover:bg-secondary disabled:opacity-40"
                        aria-label="Next page"
                    >
                        <ChevronRight className="h-4 w-4" aria-hidden />
                    </button>
                </span>
            </figcaption>

            <div
                ref={scroller}
                className="scroll-panel max-h-[60vh] space-y-3 overflow-y-auto overscroll-contain bg-secondary/40 p-2 sm:max-h-[75vh] sm:space-y-4 sm:p-4"
            >
                {data.pages.map((page, index) => (
                    <div
                        key={index}
                        ref={(el) => {
                            pageRefs.current[index] = el;
                        }}
                        className="mx-auto w-full max-w-full overflow-hidden rounded-sm bg-paper shadow-sm ring-1 ring-border sm:max-w-[680px]"
                    >
                        <PageBody page={page} title={paper.title} index={index} />
                    </div>
                ))}

                {/* Where the preview stops. A closed door, not a cut cable. */}
                {moreToCome && (
                    <div className="mx-auto w-full max-w-full rounded-sm bg-paper px-5 py-8 text-center shadow-sm ring-1 ring-border sm:max-w-[680px] sm:px-6 sm:py-10">
                        <Lock className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden />
                        <p className="heading-ui mt-3">
                            {total === null
                                ? 'The rest of this document'
                                : `${total - shown} more page${total - shown === 1 ? '' : 's'}`}
                        </p>
                        <p className="meta mx-auto mt-2 max-w-xs">
                            {paper.has_marking_scheme
                                ? 'The full paper and its marking scheme come with your purchase.'
                                : 'The full paper comes with your purchase.'}
                        </p>
                        {onBuy && (
                            <button type="button" onClick={onBuy} className="btn-primary btn-sm mt-4">
                                {paper.price_cents === 0 ? 'Get it free' : 'Add to cart'}
                            </button>
                        )}
                    </div>
                )}
            </div>
            </figure>
        </section>
    );
}

/** One page, drawn the way its source allows. */
function PageBody({ page, title, index }: { page: PreviewPage; title: string; index: number }) {
    if (page.kind === 'image') {
        return (
            <Image
                src={page.dataUrl}
                alt={`Page ${index + 1} of ${title}`}
                width={page.width}
                height={page.height}
                unoptimized
                className="h-auto w-full"
            />
        );
    }

    if (page.kind === 'html') {
        return (
            <div
                className="preview-page px-4 py-5 font-serif text-[12px] leading-relaxed text-foreground sm:px-8 sm:py-8 sm:text-[13px]"
                /*
                 * Sanitised server-side down to an allowlist of tags with every
                 * attribute stripped — see `sanitiseHtml`. There is no `href`,
                 * `src`, `style` or `on*` left in it to reason about.
                 */
                dangerouslySetInnerHTML={{ __html: page.html }}
            />
        );
    }

    return (
        <pre className="whitespace-pre-wrap break-words px-4 py-5 font-serif text-[12px] leading-relaxed text-foreground sm:px-8 sm:py-8 sm:text-[13px]">
            {page.text}
        </pre>
    );
}
