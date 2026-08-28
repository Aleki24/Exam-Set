/**
 * THE FIRST FEW PAGES, AS PAGES
 * ----------------------------------------------------------------------------
 * A buyer deciding on a paper they cannot open has, until now, had two things
 * to go on: the title, and `PaperCover` — a cover *typeset from the row's own
 * fields*, which is honest about being a mock-up and shows nothing of the
 * document. That is a hard sell for KES 30 from a teacher who has been burned
 * by a blurry scan before, and every resource site this one competes with shows
 * the first page.
 *
 * So this reads the real document and returns its opening pages, which the
 * viewer then renders as paper. Three sources, because the shop holds three
 * kinds of file and they fail in different ways:
 *
 *   a PDF with a text layer  — per-page text, straight from the parser
 *   a scanned PDF            — the page images themselves, which for a Kenyan
 *                              past paper is the common case and the best
 *                              fidelity available
 *   a Word document          — converted to a small, attribute-free subset of
 *                              HTML so a scheme of work keeps its table
 *
 * WHAT THIS MUST NEVER DO
 *
 * Return more than it was asked for. The page count is the paywall: everything
 * here is served to people who have not paid, so `maxPages` is not a hint about
 * performance, it is the boundary of what has been sold. Every path below
 * limits its own read rather than reading the document and slicing afterwards,
 * because a slice is one refactor away from being forgotten.
 */

import { extractPdfPageImages } from './documentText';
import { formatFromKey, type PaperFormat } from '@/lib/uploadFormats';

export type PreviewPage =
    | { kind: 'image'; dataUrl: string; width: number; height: number }
    | { kind: 'text'; text: string }
    | { kind: 'html'; html: string };

export interface DocumentPreview {
    pages: PreviewPage[];
    /** Pages in the whole document, when the format will say. */
    totalPages: number | null;
    /** Why there is nothing to show, in words a buyer can act on. */
    unavailable?: string;
}

/**
 * Below this a page has no text layer worth reading and is treated as a scan.
 *
 * The same threshold `hasReadableText` uses on the classifier's side, for the
 * same reason: a scanned page extracts to a handful of stray characters, and
 * showing those as "the first page" is worse than showing the image.
 */
const MIN_PAGE_TEXT = 40;

/** Roughly a page of a Word document, in characters. */
const HTML_CHARS_PER_PAGE = 1800;

/**
 * Tags a converted Word document may keep.
 *
 * An allowlist, and attributes are dropped from every one of them rather than
 * filtered — so there is no `href`, no `src`, no `style` and no `on*` handler
 * to reason about at all. `mammoth` builds this HTML itself from the document's
 * structure rather than passing anything through, so this is defence in depth;
 * but the thing being rendered arrived as a file upload, and a preview is shown
 * to everyone, signed in or not.
 */
const ALLOWED_TAGS = new Set([
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'sup', 'sub',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'blockquote',
    'table', 'thead', 'tbody', 'tr', 'td', 'th',
]);

/** Tags that never nest, so they must not move the depth counter. */
const VOID_TAGS = new Set(['br', 'img', 'hr']);

export function sanitiseHtml(html: string): string {
    // Anything whose *content* is code goes entirely, opening tag to closing.
    let out = html.replace(
        /<(script|style|iframe|object|embed|template|noscript)\b[\s\S]*?<\/\1\s*>/gi,
        ''
    );
    out = out.replace(/<(script|style|iframe|object|embed|link|meta|base)\b[^>]*>/gi, '');
    // Comments can carry conditional markup in Office output.
    out = out.replace(/<!--[\s\S]*?-->/g, '');

    // Then every remaining tag is rewritten to its bare name, or dropped.
    return out.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (_match, rawName: string) => {
        const tag = rawName.toLowerCase();
        if (!ALLOWED_TAGS.has(tag)) return '';
        return _match.startsWith('</') ? `</${tag}>` : `<${tag}>`;
    });
}

/**
 * Cut sanitised HTML into pages, only ever at a point where no tag is open.
 *
 * Word has no pages — pagination is something a word processor decides at print
 * time from fonts and margins nobody here has — so these are honest
 * approximations, sized to look like a page rather than to match one. What they
 * must be is well-formed: a cut in the middle of a table hands the browser an
 * unclosed tag and the rest of the preview renders inside it.
 */
export function paginateHtml(html: string, maxPages: number, budget = HTML_CHARS_PER_PAGE): string[] {
    const pages: string[] = [];
    const tag = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)>/g;

    let depth = 0;
    let start = 0;
    let lastIndex = 0;
    let textSinceCut = 0;
    let match: RegExpExecArray | null;

    while ((match = tag.exec(html)) !== null) {
        textSinceCut += match.index - lastIndex;
        lastIndex = tag.lastIndex;

        if (match[1] === '/') {
            depth = Math.max(0, depth - 1);
            if (depth === 0 && textSinceCut >= budget) {
                pages.push(html.slice(start, tag.lastIndex));
                if (pages.length >= maxPages) return pages;
                start = tag.lastIndex;
                textSinceCut = 0;
            }
        } else if (!VOID_TAGS.has(match[2].toLowerCase())) {
            depth++;
        }
    }

    const tail = html.slice(start).trim();
    if (tail && pages.length < maxPages) pages.push(tail);
    return pages;
}

/**
 * The opening pages of a stored document.
 *
 * `format` comes from the storage key — see `lib/uploadFormats`, where the
 * extension is the only record of what a file is.
 */
export async function buildPreview(
    buffer: Buffer,
    format: PaperFormat,
    maxPages: number
): Promise<DocumentPreview> {
    const limit = Math.max(1, Math.min(maxPages, 10));

    if (format === 'pdf') return previewPdf(buffer, limit);
    if (format === 'docx') return previewWord(buffer, limit);

    // A legacy .doc is a binary format `mammoth` does not read, and there is no
    // second reader here. Saying so beats an empty frame.
    return {
        pages: [],
        totalPages: null,
        unavailable: 'This document is in the older Word format, which cannot be previewed.',
    };
}

/** Same decision the download route makes, from the same place. */
export function previewFormatFromKey(key: string | null | undefined): PaperFormat {
    return formatFromKey(key).format;
}

async function previewPdf(buffer: Buffer, limit: number): Promise<DocumentPreview> {
    // Both of these have to happen before pdfjs loads. See services/documentText,
    // where each stands for a separate production failure.
    const { ensureDomMatrix } = await import('./documentText');
    ensureDomMatrix();

    const { PDFParse } = await import('pdf-parse');
    let parser: InstanceType<typeof PDFParse> | undefined;

    try {
        parser = new PDFParse({ data: buffer });
        // `first` is the paywall expressed to the parser: the pages beyond the
        // preview are never read, so they cannot be returned by accident.
        const result = await parser.getText({ first: limit, pageJoiner: '' });

        const pages: PreviewPage[] = [];
        let needsImages = false;

        for (const page of result.pages ?? []) {
            const text = (page.text ?? '').replace(/\s+\n/g, '\n').trim();
            if (text.length >= MIN_PAGE_TEXT) {
                pages.push({ kind: 'text', text });
            } else {
                // Hold the place; a scan's pages come from the image pass below.
                needsImages = true;
                pages.push({ kind: 'text', text: '' });
            }
        }

        if (needsImages) {
            /*
             * A scan is a photograph of a readable page, not an empty one, and
             * most Kenyan past papers arrive that way — so this is the common
             * path rather than the exceptional one. The images are lifted out
             * of the file rather than rendered from it, which costs no headless
             * browser and no 58 MB of native canvas.
             */
            const images = await extractPdfPageImages(buffer, limit);
            for (let i = 0; i < pages.length; i++) {
                const page = pages[i];
                const image = images[i];
                if (page.kind === 'text' && page.text === '' && image) {
                    pages[i] = {
                        kind: 'image',
                        dataUrl: `data:${image.mediaType};base64,${image.data.toString('base64')}`,
                        width: image.width,
                        height: image.height,
                    };
                }
            }
        }

        const usable = pages.filter((page) => page.kind !== 'text' || page.text !== '');
        if (usable.length === 0) {
            return {
                pages: [],
                totalPages: result.total ?? null,
                unavailable: 'This paper is a scan in a format that cannot be previewed here.',
            };
        }

        return { pages: usable, totalPages: result.total ?? null };
    } finally {
        await parser?.destroy();
    }
}

async function previewWord(buffer: Buffer, limit: number): Promise<DocumentPreview> {
    const mammoth = await import('mammoth');
    const result = await mammoth.convertToHtml({ buffer });
    const html = sanitiseHtml(result.value || '');

    if (!html.replace(/<[^>]*>/g, '').trim()) {
        return { pages: [], totalPages: null, unavailable: 'This document has no readable text.' };
    }

    /*
     * One page more than the preview allows, purely to answer "is there more?".
     * The extra page is counted and thrown away, never returned — the viewer
     * needs to know the document continues, and the buyer has not paid to see
     * how.
     */
    const cut = paginateHtml(html, limit + 1);
    const pages: PreviewPage[] = cut.slice(0, limit).map((page) => ({ kind: 'html', html: page }));

    return {
        pages,
        // Word has no page count of its own, so this is honest only about the
        // preview: null means "we cannot say how long this is".
        totalPages: cut.length > limit ? null : cut.length,
    };
}
