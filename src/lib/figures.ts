/**
 * Where a question's diagram lives, and how to ask for it.
 *
 * Figures sit beside the papers under a `figures/` prefix, in whichever bucket
 * `utils/storage.ts` is pointed at — Cloudflare R2 on this deployment. They are
 * never addressed directly: the bucket is private because it also holds the
 * paid PDFs, so reads go through `/api/questions/figure`, which signs one and
 * refuses any key outside the prefix.
 */

export const FIGURE_PREFIX = 'figures/';

/** The URL for an `<img src>` or the PDF renderer. */
export function figureUrl(key: string): string {
    return `/api/questions/figure?key=${encodeURIComponent(key)}`;
}

/**
 * The storage key for a question's figure.
 *
 * Keyed by question id, so a figure cannot be orphaned from what it explains
 * and re-uploading replaces rather than accumulates. The extension is kept
 * because the serving route hands the content type straight back.
 */
export function figureKey(questionId: string, filename: string): string {
    const ext = (/\.([a-z0-9]+)$/i.exec(filename)?.[1] || 'jpg').toLowerCase();
    return `${FIGURE_PREFIX}${questionId}.${ext}`;
}

/** Guards the serving route: nothing outside the prefix may be signed. */
export function isFigureKey(key: string): boolean {
    return key.startsWith(FIGURE_PREFIX) && !key.includes('..');
}
