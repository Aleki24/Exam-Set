'use client';

/**
 * RECENTLY VIEWED, AND A DOWNLOAD QUEUE THAT SURVIVES A DROPPED CONNECTION
 * ----------------------------------------------------------------------------
 * Both live in localStorage, on purpose.
 *
 * The connection this product is used over drops. Not rarely, not as an edge
 * case — routinely, mid-download, on a matatu. Anything that only exists on the
 * server is gone the moment the phone loses signal, and the thing somebody most
 * wants when signal returns is the list of what they were doing.
 *
 * Nothing here is authoritative and nothing here is trusted. It is a cache of
 * ids and titles the browser already had on screen; every actual download still
 * goes through the entitlement check, so a queue entry is a reminder rather
 * than a permission. Someone editing localStorage by hand gets a longer list of
 * things they still cannot download.
 */

import type { PaperListing } from '@/types/shop';

const RECENT_KEY = 'skulbase.recent.v1';
const QUEUE_KEY = 'skulbase.queue.v1';

/** Enough to be useful, small enough that the whole thing parses instantly. */
const MAX_RECENT = 24;
const MAX_QUEUE = 40;

export interface RecentItem {
    id: string;
    slug?: string;
    title: string;
    subject?: string;
    gradeLabel?: string;
    kind?: string;
    priceCents: number;
    /** Epoch millis. Used only for ordering. */
    seenAt: number;
}

export interface QueuedDownload {
    examId: string;
    title: string;
    asset: 'paper' | 'scheme';
    queuedAt: number;
    /** Bumped each time a download is attempted and does not finish. */
    attempts: number;
}

/**
 * Storage can be unavailable — private browsing, a locked-down WebView, a full
 * quota. Every access goes through these two so a failure degrades to "no
 * history" instead of taking a page down with it.
 */
function read<T>(key: string, fallback: T): T {
    if (typeof window === 'undefined') return fallback;
    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as T) : fallback;
    } catch {
        return fallback;
    }
}

function write(key: string, value: unknown): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Quota exceeded, or storage disabled. A lost history is not worth an
        // error anybody has to read.
    }
}

// ============================================================================
// RECENTLY VIEWED
// ============================================================================

export function recentlyViewed(): RecentItem[] {
    return read<RecentItem[]>(RECENT_KEY, []).sort((a, b) => b.seenAt - a.seenAt);
}

/**
 * Records a view, newest first, without duplicates.
 *
 * Re-viewing something moves it to the front rather than adding a second entry
 * — a history that lists the same paper six times because somebody kept coming
 * back to it is exactly wrong about what it is trying to say.
 */
export function recordView(paper: Pick<PaperListing, 'id' | 'slug' | 'title' | 'subject' | 'grade_label' | 'price_cents' | 'resource_kind'>): void {
    if (!paper?.id) return;

    const entry: RecentItem = {
        id: paper.id,
        slug: paper.slug,
        title: paper.title,
        subject: paper.subject,
        gradeLabel: paper.grade_label,
        kind: paper.resource_kind,
        priceCents: paper.price_cents ?? 0,
        seenAt: Date.now(),
    };

    const next = [entry, ...recentlyViewed().filter((r) => r.id !== paper.id)].slice(0, MAX_RECENT);
    write(RECENT_KEY, next);
}

export function clearRecentlyViewed(): void {
    write(RECENT_KEY, []);
}

// ============================================================================
// DOWNLOAD QUEUE
// ============================================================================

export function downloadQueue(): QueuedDownload[] {
    return read<QueuedDownload[]>(QUEUE_KEY, []).sort((a, b) => a.queuedAt - b.queuedAt);
}

/** Adding the same thing twice is a no-op, not a second copy. */
export function enqueueDownload(examId: string, title: string, asset: 'paper' | 'scheme' = 'paper'): void {
    if (!examId) return;
    const current = downloadQueue();
    if (current.some((q) => q.examId === examId && q.asset === asset)) return;

    write(
        QUEUE_KEY,
        [...current, { examId, title, asset, queuedAt: Date.now(), attempts: 0 }].slice(0, MAX_QUEUE)
    );
}

export function dequeueDownload(examId: string, asset: 'paper' | 'scheme' = 'paper'): void {
    write(
        QUEUE_KEY,
        downloadQueue().filter((q) => !(q.examId === examId && q.asset === asset))
    );
}

export function noteAttempt(examId: string, asset: 'paper' | 'scheme' = 'paper'): void {
    write(
        QUEUE_KEY,
        downloadQueue().map((q) =>
            q.examId === examId && q.asset === asset ? { ...q, attempts: q.attempts + 1 } : q
        )
    );
}

export function clearQueue(): void {
    write(QUEUE_KEY, []);
}

/**
 * Whether the browser currently believes it is online.
 *
 * `navigator.onLine` is famously weak — it reports the network interface, not
 * whether anything is reachable — so it is used only to decide whether to
 * *offer* a retry, never to decide whether a request will work. A false here is
 * reliable enough ("definitely no network"); a true means nothing more than
 * "worth trying", which is exactly how it is used.
 */
export function isOnline(): boolean {
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine !== false;
}
