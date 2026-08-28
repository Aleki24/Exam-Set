/**
 * Maps an `exams` row onto the PaperListing shape the UI consumes.
 *
 * Lives here rather than in a route file because Next.js only allows request
 * handlers to be exported from a route module.
 */

import type { PaperListing } from '@/types/shop';
import { describeFormats, formatFromKey } from '@/lib/uploadFormats';

/* eslint-disable @typescript-eslint/no-explicit-any */
export function toListing(row: any): PaperListing {
    return {
        id: row.id,
        slug: row.slug ?? undefined,
        title: row.title,
        description: row.description ?? undefined,
        subject: row.subject,
        subject_id: row.subject_id ?? undefined,
        code: row.code ?? undefined,
        source: row.source ?? 'catalog',
        exam_type: row.exam_type ?? undefined,
        resource_kind: row.resource_kind ?? 'past-paper',
        level_slug: row.level_slug ?? undefined,
        grade_label: row.grade_label ?? undefined,
        term_slug: row.term_slug ?? undefined,
        year: row.year ?? undefined,
        paper_number: row.paper_number ?? undefined,
        total_marks: row.total_marks ?? 0,
        question_count: row.question_count ?? 0,
        time_limit: row.time_limit ?? undefined,
        institution: row.institution ?? undefined,
        // The sitting, when the row was read with the `exam_sets` embed. Rows
        // selected without it keep `set_id` and simply have no name to show,
        // which is why every consumer treats `set_name` as optional rather than
        // inferring "no set" from its absence.
        set_id: row.set_id ?? undefined,
        set_name: row.exam_sets?.name ?? undefined,
        set_slug: row.exam_sets?.slug ?? undefined,
        price_cents: row.price_cents ?? 0,
        currency: row.currency ?? 'KES',
        is_published: row.is_published ?? false,
        is_featured: row.is_featured ?? false,
        thumbnail_url: row.thumbnail_url ?? undefined,
        // `pdf_url` and `marking_scheme_url` are deliberately not carried over.
        // The row holds them and `ensurePaperFile` still honours them for papers
        // that arrived with a direct link, but this shape is what /api/papers
        // hands to anyone browsing the shop signed out. Copying a download link
        // into it puts the file beside the price tag.
        has_marking_scheme: row.has_marking_scheme ?? false,
        preview_pages: row.preview_pages ?? 1,
        /*
         * The format, but never the link.
         *
         * The keys are read here and thrown away — what leaves is the word
         * "PDF" or "Word". Teachers buying a scheme of work care a great deal
         * which one it is (a scheme is bought to be edited), and it is the one
         * fact about the file that was impossible to learn before paying.
         *
         * A row selected without its storage keys simply has no format, rather
         * than a wrong one: `has_marking_scheme` says whether a scheme exists,
         * so a scheme key is only consulted when it does.
         */
        file_format: formatsFor(row),
        editable: editableFor(row),
        download_count: row.download_count ?? 0,
        purchase_count: row.purchase_count ?? 0,
        created_by: row.created_by ?? undefined,
        created_at: row.created_at,
        published_at: row.published_at ?? undefined,
    };
}

/**
 * The storage keys this listing's files live at, paper first.
 *
 * `marking_scheme_storage_key` is only consulted when the row says there is a
 * scheme: a generated paper's scheme key is written on first download, so a row
 * can carry one for a scheme the shop does not advertise.
 */
function fileKeys(row: any): string[] {
    return [row.pdf_storage_key, row.has_marking_scheme ? row.marking_scheme_storage_key : null].filter(
        (key): key is string => typeof key === 'string' && key.length > 0
    );
}

function formatsFor(row: any): string | undefined {
    const keys = fileKeys(row);
    return keys.length > 0 ? describeFormats(keys) : undefined;
}

function editableFor(row: any): boolean | undefined {
    const keys = fileKeys(row);
    return keys.length > 0 ? keys.some((key) => formatFromKey(key).editable) : undefined;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
