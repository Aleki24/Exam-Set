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

/**
 * 4 MB.
 *
 * A figure is a crop out of a scanned paper — a graph, a circuit, a map — and
 * one of those is a couple of hundred kilobytes. Four megabytes is generous for
 * a phone photo of a textbook page and still small enough that the PDF renderer
 * can hold forty of them in a serverless function's memory at once, which is
 * exactly what building a forty-question paper does.
 */
export const MAX_FIGURE_BYTES = 4 * 1024 * 1024;

/**
 * What may be uploaded, and the extension each one is stored under.
 *
 * The extension comes from the content type rather than the filename because
 * the filename is the browser's to choose and the content type is checked. A
 * key ending `.jpg` that holds a PDF would be signed and served by
 * `/api/questions/figure` without complaint.
 *
 * No SVG. It is an image to a person and a script to a browser, and this one is
 * served from the app's own origin.
 */
export const FIGURE_TYPES: Readonly<Record<string, string>> = Object.freeze({
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
});

/** The extension a content type is stored under, or null when it is not allowed. */
export function figureExtension(contentType: string): string | null {
    return FIGURE_TYPES[String(contentType).toLowerCase().trim()] ?? null;
}

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

/**
 * The storage key for a figure of a known content type.
 *
 * The upload path uses this rather than `figureKey`, because by then the type
 * has been validated and the filename has not.
 */
export function figureKeyForType(questionId: string, contentType: string): string | null {
    const ext = figureExtension(contentType);
    if (!ext) return null;
    if (!isQuestionId(questionId)) return null;
    return `${FIGURE_PREFIX}${questionId}.${ext}`;
}

/**
 * A question id is a UUID, and this is the only thing standing between a caller
 * and a key of their own choosing.
 *
 * `figureKeyForType` interpolates the id straight into the key. Without this a
 * caller could pass `../papers/someone/2026-paper` and be handed a signed PUT
 * over a paid PDF — the `isFigureKey` guard on the read side would never see
 * it, because it guards reads.
 */
export function isQuestionId(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Guards the serving route: nothing outside the prefix may be signed. */
export function isFigureKey(key: string): boolean {
    return key.startsWith(FIGURE_PREFIX) && !key.includes('..');
}
