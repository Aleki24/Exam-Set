/**
 * BULK LISTING — the decisions that are not the model's to make.
 *
 * The classifier reads covers; this decides what to do with what it read. Kept
 * out of the route so it can be checked without an API key, an admin session or
 * a network — which is the only way the awkward cases ever get tested, because
 * they are exactly the ones nobody uploads on purpose.
 */

/** The shape the classifier returns for one uploaded file. */
export interface Classified {
    key: string;
    filename: string;
    ok: boolean;
    error?: string;
    is_marking_scheme?: boolean;
    /** Key of the paper this scheme belongs to. Null when nothing matched. */
    pairs_with?: string | null;
    title?: string;
    subject?: string;
    level_slug?: string | null;
    grade_label?: string | null;
    exam_type?: string | null;
    resource_kind?: string;
    term_slug?: string | null;
    year?: number;
    paper_number?: string | null;
    total_marks?: number | null;
    time_limit?: string | null;
    institution?: string | null;
    confidence?: 'high' | 'medium' | 'low';
}

/**
 * The filename with the scheme-words and punctuation taken out.
 *
 * Pairing runs on this rather than on the documents themselves, because a
 * marking scheme and its paper are deliberately near-identical in content —
 * they share every question — and so the text is the one signal that cannot
 * separate them. The filename is what actually differs, and it differs in a
 * small, predictable set of ways.
 */
export function pairingStem(filename: string): string {
    return (
        filename
            .toLowerCase()
            .replace(/\.[a-z0-9]+$/, '')
            /*
             * Separators become spaces *before* the scheme words are stripped,
             * not after. An underscore is a word character to a regex, so in
             * `Grade_9_Maths_ANSWER_KEY` there is no word boundary anywhere and
             * `\banswer\b` matches nothing — the scheme keeps its marker, the
             * stems differ, and a paper silently ships without its answers.
             */
            .replace(/[_\-.]+/g, ' ')
            .replace(/\b(marking\s*schemes?|marking\s*guides?|answer\s*keys?|answers?|scheme|ms|mg|ans)\b/g, '')
            .replace(/[^a-z0-9]+/g, '')
    );
}

/**
 * Attach each marking scheme to the paper it marks.
 *
 * A teacher who buys a paper without its scheme has bought half a product, and
 * the site's own title promises both — so an unpaired scheme is surfaced rather
 * than quietly listed as a paper in its own right.
 *
 * Ambiguity is refused, not guessed: when two papers share a stem there is no
 * way to know which one a scheme belongs to, and attaching it to the first is
 * how the wrong answers end up behind the right paywall.
 */
export function pairSchemes(all: Classified[]): Classified[] {
    const papers = all.filter((c) => !c.is_marking_scheme);

    return all.map((c) => {
        if (!c.is_marking_scheme) return c;

        const mine = pairingStem(c.filename);
        // Too short to be distinctive — "ms.pdf" would match everything.
        if (mine.length < 4) return { ...c, pairs_with: null };

        const matches = papers.filter((p) => pairingStem(p.filename) === mine);
        return { ...c, pairs_with: matches.length === 1 ? matches[0].key : null };
    });
}

/**
 * A year the paper could actually carry.
 *
 * The model is reading a cover, not validating one, and a page full of figures
 * gives it plenty of four-digit numbers to mistake for a year. A wrong year is
 * quiet damage: it files the paper under a sitting that never happened and the
 * teacher searching for it never sees it.
 */
export function sensibleYear(value: unknown, now = new Date().getFullYear()): number | undefined {
    const year = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(year)) return undefined;
    // Kenyan CBC starts well after 2000, and next year's papers are set in advance.
    return year >= 2000 && year <= now + 1 ? year : undefined;
}

/**
 * Whether a page carried enough text to be worth reading.
 *
 * A scanned paper with no text layer extracts to a handful of stray characters.
 * Sending that to the model does not fail — it invents a plausible cover from a
 * filename, and an invention presented as a reading is worse than a blank row
 * somebody has to fill in.
 */
export function hasReadableText(text: string, minimum = 40): boolean {
    return text.replace(/\s+/g, ' ').trim().length >= minimum;
}
