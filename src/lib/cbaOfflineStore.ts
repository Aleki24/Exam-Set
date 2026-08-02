'use client';

/**
 * OFFLINE SCORE CAPTURE
 * ----------------------------------------------------------------------------
 * Scores are written to the phone first and pushed to the server afterwards.
 *
 * This ordering is the entire feature. A teacher scoring a class is standing in
 * a classroom, often with no signal, and the work is a whole period of tapping
 * that cannot be asked for twice. Anything that writes to the network first —
 * even with a retry — loses the lot the moment the connection goes, and the
 * teacher finds out at the end.
 *
 * So every tap lands in localStorage synchronously and is queued. Sync is a
 * background convenience; the record of truth while the class is in front of you
 * is the device.
 *
 * WHY localStorage AND NOT IndexedDB
 *
 * IndexedDB is the technically correct answer and the wrong practical one here.
 * A class of fifty against eight outcomes is four hundred entries of about forty
 * bytes — sixteen kilobytes, against a five-megabyte budget. localStorage is
 * synchronous, which means a tap cannot be lost to a promise that never settles
 * if the page is closed mid-write, and it is already the pattern the rest of the
 * app uses (see `recentlyViewed`). IndexedDB would buy headroom this data will
 * not need and add a failure mode it currently cannot have.
 *
 * If a school ever needs a register large enough to strain this, the storage
 * usage below reports it rather than failing silently.
 */

import type { PerformanceLevel } from './cbaRubric';

const KEY_PREFIX = 'skulbase.cba.';
const QUEUE_KEY = 'skulbase.cba.queue.v1';

/** Scores for one assessment: learnerId -> outcomeId -> level. */
export type ScoreSheet = Record<string, Record<string, PerformanceLevel | undefined>>;

export interface QueuedScore {
    assessmentId: string;
    learnerId: string;
    outcomeId: string;
    level: PerformanceLevel;
    /** Epoch millis. Last write wins on conflict. */
    at: number;
}

function sheetKey(assessmentId: string): string {
    return `${KEY_PREFIX}sheet.${assessmentId}`;
}

/**
 * Every storage access goes through these two.
 *
 * Storage can be unavailable — private browsing, a locked-down school tablet, a
 * full quota — and a teacher mid-class must not meet a stack trace. A failure
 * degrades to "this tap did not stick", which is visible and recoverable,
 * rather than taking the page down.
 */
function read<T>(key: string, fallback: T): T {
    if (typeof window === 'undefined') return fallback;
    try {
        const raw = window.localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
        return fallback;
    }
}

function write(key: string, value: unknown): boolean {
    if (typeof window === 'undefined') return false;
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        // Quota or a disabled store. Reported rather than swallowed, because a
        // score that did not save is the one thing the teacher must know about.
        console.error('CBA: could not write to local storage.');
        return false;
    }
}

// ============================================================================
// THE SHEET
// ============================================================================

export function loadSheet(assessmentId: string): ScoreSheet {
    return read<ScoreSheet>(sheetKey(assessmentId), {});
}

/**
 * Records one tap. Returns false when it did not stick, so the UI can say so.
 */
export function setScore(
    assessmentId: string,
    learnerId: string,
    outcomeId: string,
    level: PerformanceLevel
): boolean {
    const sheet = loadSheet(assessmentId);
    sheet[learnerId] = { ...(sheet[learnerId] ?? {}), [outcomeId]: level };

    const saved = write(sheetKey(assessmentId), sheet);
    if (!saved) return false;

    enqueue({ assessmentId, learnerId, outcomeId, level, at: Date.now() });
    return true;
}

/** Replaces the local sheet with what the server holds. */
export function replaceSheet(assessmentId: string, sheet: ScoreSheet): void {
    write(sheetKey(assessmentId), sheet);
}

export function clearSheet(assessmentId: string): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.removeItem(sheetKey(assessmentId));
    } catch {
        /* nothing to do */
    }
}

// ============================================================================
// THE QUEUE
// ============================================================================

export function queued(): QueuedScore[] {
    return read<QueuedScore[]>(QUEUE_KEY, []);
}

/**
 * Queues a score, collapsing repeats.
 *
 * A teacher correcting a tap — BE, then ME a second later — should send one
 * score, not two. Keyed on the cell rather than appended, so a period of
 * indecision does not become a hundred rows to sync over a bad connection.
 */
function enqueue(entry: QueuedScore): void {
    const key = `${entry.assessmentId}|${entry.learnerId}|${entry.outcomeId}`;
    const rest = queued().filter(
        (q) => `${q.assessmentId}|${q.learnerId}|${q.outcomeId}` !== key
    );
    write(QUEUE_KEY, [...rest, entry]);
}

/** Drops entries that the server has confirmed. */
export function dequeue(confirmed: QueuedScore[]): void {
    const done = new Set(
        confirmed.map((q) => `${q.assessmentId}|${q.learnerId}|${q.outcomeId}|${q.at}`)
    );
    write(
        QUEUE_KEY,
        queued().filter(
            (q) => !done.has(`${q.assessmentId}|${q.learnerId}|${q.outcomeId}|${q.at}`)
        )
    );
}

export function queueSize(): number {
    return queued().length;
}

/**
 * Pushes everything queued.
 *
 * Anything that fails stays queued — that is the point, and it is why this
 * returns what was confirmed rather than throwing. A teacher who closes the app
 * on a dead connection and opens it on the school wifi an hour later should find
 * their morning's work intact and syncing.
 */
export async function syncQueue(): Promise<{ sent: number; failed: number }> {
    const pending = queued();
    if (pending.length === 0) return { sent: 0, failed: 0 };

    // Grouped per assessment: one request each, rather than one per tap.
    const byAssessment = new Map<string, QueuedScore[]>();
    for (const entry of pending) {
        const list = byAssessment.get(entry.assessmentId) ?? [];
        list.push(entry);
        byAssessment.set(entry.assessmentId, list);
    }

    let sent = 0;
    let failed = 0;
    const confirmed: QueuedScore[] = [];

    for (const [assessmentId, entries] of byAssessment) {
        try {
            const res = await fetch(`/api/cba/${assessmentId}/scores`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scores: entries.map((e) => ({
                        learner_id: e.learnerId,
                        outcome_id: e.outcomeId,
                        level: e.level,
                    })),
                }),
            });

            if (!res.ok) {
                failed += entries.length;
                continue;
            }

            confirmed.push(...entries);
            sent += entries.length;
        } catch {
            // Still offline. Left queued deliberately.
            failed += entries.length;
        }
    }

    if (confirmed.length > 0) dequeue(confirmed);
    return { sent, failed };
}

/**
 * Roughly how much of the local budget the captured scores occupy.
 *
 * Surfaced so a school with an unusually large register finds out before a write
 * starts failing, rather than after.
 */
export function storageUsage(): { bytes: number; nearLimit: boolean } {
    if (typeof window === 'undefined') return { bytes: 0, nearLimit: false };
    let bytes = 0;
    try {
        for (const key of Object.keys(window.localStorage)) {
            if (!key.startsWith(KEY_PREFIX)) continue;
            bytes += (window.localStorage.getItem(key) ?? '').length * 2; // UTF-16
        }
    } catch {
        return { bytes: 0, nearLimit: false };
    }
    // Browsers vary, but 5 MB is the usual floor. Warn well before it.
    return { bytes, nearLimit: bytes > 3_500_000 };
}
