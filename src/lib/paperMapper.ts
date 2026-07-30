/**
 * Maps an `exams` row onto the PaperListing shape the UI consumes.
 *
 * Lives here rather than in a route file because Next.js only allows request
 * handlers to be exported from a route module.
 */

import type { PaperListing } from '@/types/shop';

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
        level_slug: row.level_slug ?? undefined,
        grade_label: row.grade_label ?? undefined,
        term_slug: row.term_slug ?? undefined,
        year: row.year ?? undefined,
        paper_number: row.paper_number ?? undefined,
        total_marks: row.total_marks ?? 0,
        question_count: row.question_count ?? 0,
        time_limit: row.time_limit ?? undefined,
        institution: row.institution ?? undefined,
        price_cents: row.price_cents ?? 0,
        currency: row.currency ?? 'KES',
        is_published: row.is_published ?? false,
        is_featured: row.is_featured ?? false,
        pdf_url: row.pdf_url ?? undefined,
        thumbnail_url: row.thumbnail_url ?? undefined,
        marking_scheme_url: row.marking_scheme_url ?? undefined,
        has_marking_scheme: row.has_marking_scheme ?? false,
        preview_pages: row.preview_pages ?? 1,
        download_count: row.download_count ?? 0,
        purchase_count: row.purchase_count ?? 0,
        created_by: row.created_by ?? undefined,
        created_at: row.created_at,
        published_at: row.published_at ?? undefined,
    };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
