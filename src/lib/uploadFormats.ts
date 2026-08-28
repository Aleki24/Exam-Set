/**
 * WHAT A PAPER MAY ARRIVE AS
 * ----------------------------------------------------------------------------
 * The shop accepted PDFs and nothing else, in five separate places that each
 * spelled `application/pdf` out by hand: the file picker, the bulk drop zone,
 * the ticket route, the finalising route, and the bucket's own mime list. A
 * teacher uploading the Word copy of a scheme of work — which is what most
 * Kenyan resource sites actually sell, because a scheme is a document you edit
 * before you teach from it, not a page you print — got a silent rejection from
 * the file dialog and no explanation anywhere.
 *
 * This is the one list. Everything that has an opinion about which files may be
 * uploaded reads it from here, so widening the shop to a new format is a change
 * to this file plus a migration for the bucket, and never a hunt for the fifth
 * place that still says PDF.
 *
 * Deliberately free of server imports: the browser needs the same answers as
 * the routes do, and a client and a server that disagree about which files are
 * allowed produce the worst failure available — a file that uploads to storage
 * and is then refused at the step that records it.
 */

export type PaperFormat = 'pdf' | 'docx' | 'doc';

export interface PaperFormatSpec {
    format: PaperFormat;
    /** What the shop calls it in front of a buyer. */
    label: string;
    /** The single content type this app stores the file under. */
    contentType: string;
    /** Including the dot. Becomes the storage key's extension. */
    extension: string;
    /**
     * Other content types a browser may report for the same file.
     *
     * Windows without Office installed, Android's file picker and a good deal
     * of Chrome OS report a .docx as `application/octet-stream`, and some
     * report nothing at all. Those are not exotic devices in this market, so
     * the type the browser volunteers is treated as a hint and the filename
     * decides when the hint is useless — see `resolvePaperFormat`.
     */
    aliases: readonly string[];
    /** True when the buyer can edit it, which is the reason to want it. */
    editable: boolean;
}

export const PAPER_FORMATS: readonly PaperFormatSpec[] = [
    {
        format: 'pdf',
        label: 'PDF',
        contentType: 'application/pdf',
        extension: '.pdf',
        aliases: ['application/x-pdf'],
        editable: false,
    },
    {
        format: 'docx',
        label: 'Word',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        extension: '.docx',
        aliases: [],
        editable: true,
    },
    {
        format: 'doc',
        label: 'Word',
        contentType: 'application/msword',
        extension: '.doc',
        aliases: ['application/x-msword', 'application/vnd.ms-word'],
        editable: true,
    },
];

const BY_FORMAT = new Map<PaperFormat, PaperFormatSpec>(PAPER_FORMATS.map((f) => [f.format, f]));

/** Every content type a route will accept, canonical and alias alike. */
export const ACCEPTED_CONTENT_TYPES: readonly string[] = PAPER_FORMATS.flatMap((f) => [
    f.contentType,
    ...f.aliases,
]);

/**
 * The `accept` attribute for a paper file input.
 *
 * Extensions *and* content types on purpose. A picker given only content types
 * greys out .docx on exactly the machines that misreport it, which is the same
 * population this change exists for.
 */
export const PAPER_FILE_ACCEPT = [
    ...PAPER_FORMATS.map((f) => f.extension),
    ...PAPER_FORMATS.map((f) => f.contentType),
].join(',');

/** How the accepted formats are described to a person. */
export const PAPER_FORMAT_HINT = 'PDF or Word (.pdf, .doc, .docx)';

function normaliseContentType(value: string | null | undefined): string {
    // `text/plain; charset=utf-8` and `APPLICATION/PDF` are the same header.
    return String(value ?? '').split(';')[0].trim().toLowerCase();
}

/** The format a content type names, or null when it names none of ours. */
export function formatByContentType(contentType: string | null | undefined): PaperFormatSpec | null {
    const wanted = normaliseContentType(contentType);
    if (!wanted) return null;
    return (
        PAPER_FORMATS.find((f) => f.contentType === wanted || f.aliases.includes(wanted)) ?? null
    );
}

/** The format a filename's extension names, or null. Also reads storage keys. */
export function formatByExtension(name: string | null | undefined): PaperFormatSpec | null {
    const lower = String(name ?? '').toLowerCase();
    // `.docx` before `.doc` would still be wrong here if the list were reordered,
    // so match the extension itself rather than the longest prefix.
    const dot = lower.lastIndexOf('.');
    if (dot === -1) return null;
    const ext = lower.slice(dot);
    return PAPER_FORMATS.find((f) => f.extension === ext) ?? null;
}

/**
 * What this file actually is, or null when it is not something we take.
 *
 * The content type wins when it is one we recognise: it comes from the
 * platform's own registry and survives a file being renamed. When it is absent,
 * `application/octet-stream`, or anything else unrecognised, the extension
 * decides — which is the whole reason a .docx from an Android phone can be
 * uploaded at all.
 */
export function resolvePaperFormat(file: {
    name?: string | null;
    type?: string | null;
}): PaperFormatSpec | null {
    return formatByContentType(file.type) ?? formatByExtension(file.name);
}

/**
 * The format a stored file is in, read from its key.
 *
 * Storage keys are minted by this app and always carry the extension of the
 * format they hold, so the key is the record of the format — there is no column
 * for it, and adding one would leave every paper uploaded before today unlabelled
 * rather than correctly labelled PDF.
 *
 * Anything unrecognised is a PDF, because for the entire history of this shop
 * before Word was accepted, it was.
 */
export function formatFromKey(key: string | null | undefined): PaperFormatSpec {
    return formatByExtension(key) ?? BY_FORMAT.get('pdf')!;
}

export function formatSpec(format: PaperFormat): PaperFormatSpec {
    return BY_FORMAT.get(format)!;
}

/**
 * The format label for a listing — "PDF", "Word", or both when the paper and
 * its marking scheme did not arrive in the same one.
 */
export function describeFormats(keys: (string | null | undefined)[]): string {
    const labels = [...new Set(keys.filter(Boolean).map((key) => formatFromKey(key).label))];
    return labels.length > 0 ? labels.join(' + ') : formatSpec('pdf').label;
}

/** Why a file was refused, in words a person can act on. */
export function rejectionReason(label: string): string {
    return `The ${label} must be a ${PAPER_FORMAT_HINT} file`;
}

/**
 * A title worth pre-filling, read off the filename.
 *
 * Nearly every paper arrives named after itself — `Grade 9 Maths EOT2.docx` —
 * and retyping that into the first required field is the most common keystroke
 * on the upload page. It is only ever a suggestion: the form fills an empty
 * title with it and never overwrites one somebody has typed.
 *
 * Lives here rather than in the page because it is the same filename-reading
 * this module already does, and because a page component is not somewhere a
 * verify script can reach.
 */
export function titleFromFilename(filename: string): string {
    const stem = String(filename ?? '')
        // Strip the path a drag from a folder can carry.
        .split(/[\\/]/)
        .pop()!
        .replace(/\.[a-z0-9]+$/i, '')
        .replace(/_+/g, ' ')
        // A hyphen with space around it is a separator; the one inside
        // `end-term` is part of the word, so it stays.
        .replace(/\s+-\s*|\s*-\s+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (stem.length < 3) return '';

    // Anything already carrying a capital is left alone — `KCSE` must not
    // become `Kcse`, and `EOT2` must not become `Eot2`.
    return stem
        .split(' ')
        .map((word) => (/[A-Z]/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
        .join(' ')
        .slice(0, 255);
}
