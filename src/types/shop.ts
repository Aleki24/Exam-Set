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
    level_slug?: LevelSlug | string;
    grade_label?: string;
    term_slug?: TermSlug | string;
    year?: number;
    paper_number?: string;

    total_marks: number;
    question_count: number;
    time_limit?: string;
    institution?: string;

    price_cents: number;
    currency: string;
    is_published: boolean;
    is_featured: boolean;

    thumbnail_url?: string;
    has_marking_scheme: boolean;
    preview_pages: number;

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
    term?: string;
    year?: number;
    /** 'free' | 'paid' | undefined for both */
    price?: 'free' | 'paid';
    search?: string;
    sort?: 'newest' | 'popular' | 'price-asc' | 'price-desc' | 'title';
    limit?: number;
    offset?: number;
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
    };
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
