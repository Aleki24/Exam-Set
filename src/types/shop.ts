/**
 * SHOP & SETTER TYPES
 * Shared shapes for the paper catalog, the cart, orders and entitlements.
 */

import type { ExamTypeSlug, LevelSlug, TermSlug } from '@/lib/catalog';

// ============================================================================
// CATALOG
// ============================================================================

export type PaperSource = 'catalog' | 'user_set';

/** A paper as shown in the shop. */
export interface PaperListing {
    id: string;
    slug?: string;
    title: string;
    description?: string;
    subject: string;
    subject_id?: string;
    code?: string;

    source: PaperSource;
    exam_type?: ExamTypeSlug | string;
    /** What the artefact is — see lib/resources.ts. Distinct from exam_type. */
    resource_kind?: string;
    level_slug?: LevelSlug | string;
    grade_label?: string;
    term_slug?: TermSlug | string;
    year?: number;
    paper_number?: string;

    total_marks: number;
    question_count: number;
    time_limit?: string;
    institution?: string;

    /**
     * The sitting this paper belongs to — see lib/examSets.ts.
     *
     * `set_name` and `set_slug` are present only when the row was read with the
     * `exam_sets` embed, so their absence means "not loaded", not "no set".
     * `set_id` is the one to test when you need to know whether a paper is
     * grouped at all.
     */
    set_id?: string;
    set_name?: string;
    set_slug?: string;

    price_cents: number;
    currency: string;
    is_published: boolean;
    is_featured: boolean;

    thumbnail_url?: string;
    has_marking_scheme: boolean;
    preview_pages: number;

    /**
     * What the buyer downloads — "PDF", "Word", or "PDF + Word" when the paper
     * and its marking scheme differ.
     *
     * Derived from the storage keys rather than stored, because the key's
     * extension is what actually decides the file that gets served. Absent when
     * the row was read without its keys, which is why nothing treats a missing
     * value as "unknown format" and shows a placeholder.
     */
    file_format?: string;
    /** True when at least one of the files is a Word document the buyer can edit. */
    editable?: boolean;

    /*
     * No `pdf_url` or `marking_scheme_url`. The `exams` row has both columns and
     * the server still reads them, but a listing is what unauthenticated
     * browsers receive from /api/papers — and a link to a paid PDF has no
     * business in it. Downloads are minted per request by
     * /api/papers/[id]/download, after the entitlement check, and expire in
     * fifteen minutes. Anything else is a paywall with the file next to it.
     */

    download_count: number;
    purchase_count: number;

    created_by?: string;
    created_at: string;
    published_at?: string;

    /** Set by the API when the signed-in user already owns this paper. */
    owned?: boolean;
}

export interface PaperFilters {
    level?: string;
    grade?: string;
    subject?: string;
    exam_type?: string;
    /** A `resource_kind` slug — scheme of work, lesson plan, notes. See lib/resources.ts. */
    kind?: string;
    term?: string;
    year?: number;
    /** A set slug — restricts to one sitting. See lib/examSets.ts. */
    set?: string;
    /** 'free' | 'paid' | undefined for both */
    price?: 'free' | 'paid';
    search?: string;
    /**
     * Search the words literally instead of reading them as filters.
     *
     * Off by default: "form 4 maths term 3" is a request, and treating it as a
     * substring finds nothing. Set when somebody is hunting an exact phrase, or
     * disagrees with how their sentence was read.
     */
    raw?: boolean;
    sort?: 'newest' | 'popular' | 'price-asc' | 'price-desc' | 'title';
    limit?: number;
    offset?: number;
}

/**
 * How a typed search was read — see services/paperSearch.ts.
 *
 * Sent back with the results so the page can show its work. Search that
 * silently rewrites itself is search nobody can correct.
 */
export interface SearchInterpretation {
    /** The sentence as typed. */
    query: string;
    /** "Form 4 · Mathematics · Term 3" — what was recognised. */
    label: string;
    /** The filters the sentence supplied. */
    applied: { key: string; label: string }[];
    /** Whatever was left over, searched as free text. */
    text?: string;
    /** Filters given up, in order, because nothing matched as asked. */
    relaxed: string[];
}

export interface PaperListResponse {
    papers: PaperListing[];
    total: number;
    hasMore: boolean;
    /** Result counts per facet value, used to label the filter rail. */
    facets?: {
        levels: Record<string, number>;
        examTypes: Record<string, number>;
        subjects: Record<string, number>;
        /** Keyed by `resource_kind` slug — see lib/resources.ts. */
        kinds?: Record<string, number>;
        /** Keyed by set slug, valued `{ name, count }` — see lib/examSets.ts. */
        sets?: Record<string, { name: string; count: number }>;
    };
    /**
     * How the search box was read, when it was read as a request rather than
     * searched literally. Absent when nothing in it was recognised.
     */
    understood?: SearchInterpretation;
}

// ============================================================================
// CART
// ============================================================================

export interface CartItem {
    exam_id: string;
    title: string;
    subject: string;
    grade_label?: string;
    exam_type?: string;
    year?: number;
    price_cents: number;
    currency: string;
    has_marking_scheme: boolean;
}

// ============================================================================
// ORDERS
// ============================================================================

export type OrderStatus = 'pending' | 'awaiting_confirmation' | 'paid' | 'failed' | 'cancelled';
export type PaymentProvider = 'mpesa' | 'manual' | 'free';

export interface OrderItem {
    id: string;
    order_id: string;
    exam_id: string;
    title: string;
    unit_price_cents: number;
}

export interface Order {
    id: string;
    reference: string;
    user_id: string;
    status: OrderStatus;
    subtotal_cents: number;
    discount_cents: number;
    total_cents: number;
    currency: string;
    provider: PaymentProvider;
    phone?: string;
    provider_ref?: string;
    provider_request_id?: string;
    created_at: string;
    paid_at?: string;
    items?: OrderItem[];
}

export interface Entitlement {
    id: string;
    user_id: string;
    exam_id: string;
    order_id?: string;
    kind: 'purchase' | 'free' | 'author' | 'grant';
    granted_at: string;
}

// ============================================================================
// SETTER
// ============================================================================

/** A blueprint drives automatic paper assembly in the setter. */
export interface PaperBlueprint {
    /** Target total marks; sections are filled until this is met. */
    targetMarks: number;
    /** Rough share of each difficulty, as percentages summing to 100. */
    difficultyMix: { Easy: number; Medium: number; Difficult: number };
    /** Restrict the draw to these topics (empty = any topic). */
    topics: string[];
    /** Restrict the draw to these question types (empty = any type). */
    questionTypes: string[];
    /** Prefer questions that have been used least. */
    preferUnused: boolean;
    /** Never reuse a question already in the paper. */
    avoidDuplicates: boolean;
}

export const DEFAULT_BLUEPRINT: PaperBlueprint = {
    targetMarks: 60,
    difficultyMix: { Easy: 40, Medium: 40, Difficult: 20 },
    topics: [],
    questionTypes: [],
    preferUnused: true,
    avoidDuplicates: true,
};
