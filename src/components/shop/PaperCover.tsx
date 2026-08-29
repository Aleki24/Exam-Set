import React from 'react';
import Image from 'next/image';
import { isSittable, resourceKindName } from '@/lib/resources';
import { examTypeName, LEVEL_BY_SLUG, TERMS } from '@/lib/catalog';
import type { PaperListing } from '@/types/shop';

/**
 * What the document looks like, without giving it away.
 *
 * A buyer deciding on a paper they cannot open wants to see the shape of the
 * thing. `thumbnail_url` is on the row and is used when it is set — but nothing
 * in the product writes it yet, so the fallback is the case that actually runs:
 * a cover typeset from the fields the row already carries.
 *
 * That is deliberately a cover and not a "preview". It claims to be exactly
 * what it is — the front page, set the way the real one is set — rather than
 * implying content that is behind the paywall. It is in Lora, the face this
 * design system reserves for printed papers precisely so they read as a script
 * rather than as the app, and every line is omitted when its value is missing.
 */
export default function PaperCover({ paper }: { paper: PaperListing }) {
    return (
        <figure className="surface overflow-hidden">
            <div className="relative aspect-[1/1.294] w-full bg-paper">
                <CoverPage paper={paper} />
            </div>

            <figcaption className="meta border-t border-border px-4 py-2.5">
                {paper.thumbnail_url
                    ? 'First page'
                    : /* Never "preview" — nothing of the contents is being shown. */
                      'Cover, set from this paper’s details'}
                {paper.has_marking_scheme ? ' · marking scheme included' : ''}
            </figcaption>
        </figure>
    );
}

/**
 * THE CARD THUMBNAIL
 *
 * A shop listing was a wall of text: title, one metadata line, a price. Every
 * document site a teacher already uses — Scribd among them — leads each result
 * with a picture of the first page, and the reason is not decoration. It is the
 * fastest way to tell a scanned photocopy from a typed paper, and a one-page
 * handout from a real exam, before reading a word.
 *
 * This is the same cover as above, drawn once and scaled down, rather than a
 * second miniature that would drift from it. `transform` rather than smaller
 * type on purpose: the proportions, the rule, the spacing all shrink together,
 * so it reads as a page rather than as cramped text.
 *
 * Deliberately small. A grid of thirty is scanned, and a thumbnail that takes
 * the space of the title is a picture competing with the thing it illustrates.
 */
export function PaperThumb({ paper }: { paper: PaperListing }) {
    // The cover is laid out at this width, then scaled to fit the tile. Both
    // numbers live here so the ratio cannot drift: 1:1.294 is A4.
    const WIDTH = 320;
    const TILE = 58;

    return (
        <div
            className="relative shrink-0 overflow-hidden rounded-[3px] bg-paper ring-1 ring-border"
            style={{ width: TILE, height: Math.round(TILE * 1.294) }}
            aria-hidden
        >
            <div
                className="absolute left-0 top-0 origin-top-left"
                style={{
                    width: WIDTH,
                    height: Math.round(WIDTH * 1.294),
                    transform: `scale(${TILE / WIDTH})`,
                }}
            >
                <CoverPage paper={paper} />
            </div>
        </div>
    );
}

/** The page itself, at whatever size the caller gives it. */
function CoverPage({ paper }: { paper: PaperListing }) {
    const level = paper.level_slug ? LEVEL_BY_SLUG[paper.level_slug] : undefined;
    const term = TERMS.find((t) => t.slug === paper.term_slug);

    const classLine = [paper.grade_label || level?.name, paper.subject].filter(Boolean).join(' · ');
    const sittingLine = [
        paper.exam_type ? examTypeName(paper.exam_type) : resourceKindName(paper.resource_kind),
        term?.name,
        paper.year,
    ]
        .filter(Boolean)
        .join(' · ');

    return (
        <>
            {paper.thumbnail_url ? (
                    /*
                     * `unoptimized` because the storage host is an environment
                     * variable, so it cannot be listed in `images.remotePatterns`
                     * at build time. Without this, the first thumbnail anyone
                     * uploads would 400 on a host the optimizer refuses to
                     * fetch — a failure that would only appear in production.
                     */
                    <Image
                        src={paper.thumbnail_url}
                        alt={`First page of ${paper.title}`}
                        fill
                        unoptimized
                        sizes="(min-width: 1024px) 320px, 100vw"
                        className="object-cover object-top"
                    />
                ) : (
                    <div className="ruled absolute inset-0 flex flex-col px-7 py-8 text-center font-serif text-foreground">
                        {paper.institution && (
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">
                                {paper.institution}
                            </p>
                        )}

                        <div className="flex flex-1 flex-col items-center justify-center">
                            {classLine && <p className="text-sm font-semibold">{classLine}</p>}

                            <p className="mt-3 text-lg font-bold leading-tight">{paper.title}</p>

                            {sittingLine && (
                                <p className="mt-3 text-xs uppercase tracking-[0.12em]">{sittingLine}</p>
                            )}

                            {paper.paper_number && (
                                <p className="mt-1 text-xs uppercase tracking-[0.12em]">
                                    Paper {paper.paper_number}
                                </p>
                            )}

                            <span className="mt-5 block h-px w-16 bg-border" aria-hidden />

                            <dl className="mt-5 space-y-1 text-[11px]">
                                {paper.time_limit && (
                                    <div>
                                        <dt className="inline">Time: </dt>
                                        <dd className="inline font-semibold">{paper.time_limit}</dd>
                                    </div>
                                )}
                                {paper.total_marks > 0 && (
                                    <div>
                                        <dt className="inline">Total: </dt>
                                        <dd className="inline font-semibold">{paper.total_marks} marks</dd>
                                    </div>
                                )}
                            </dl>
                        </div>

                        {/* An instruction to a candidate, so it belongs only on
                            something a candidate sits. A scheme of work is read
                            by the teacher who bought it. */}
                        {isSittable(paper.resource_kind) && (
                            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                                Do not open this paper until told to do so
                            </p>
                        )}
                    </div>
            )}
        </>
    );
}
