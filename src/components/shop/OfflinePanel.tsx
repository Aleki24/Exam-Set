'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Clock, Download, Loader2, WifiOff, X } from 'lucide-react';
import {
    downloadQueue,
    dequeueDownload,
    noteAttempt,
    recentlyViewed,
    isOnline,
    type QueuedDownload,
    type RecentItem,
} from '@/lib/recentlyViewed';

/**
 * WHAT YOU WERE DOING WHEN THE SIGNAL WENT
 *
 * Two lists a phone keeps for itself: the papers you were looking at, and the
 * downloads that did not finish.
 *
 * Client-only and rendered after mount, because both live in localStorage and
 * the server has no idea what is in it. Rendering them on the server would mean
 * shipping markup that is wrong on arrival and corrected a frame later, which
 * on a slow connection is a visible flinch.
 *
 * The queue is a list of intentions, never a list of permissions. Retrying goes
 * through the ordinary download route and the ordinary entitlement check, so a
 * queue entry for something unpaid stays a queue entry.
 */
export default function OfflinePanel() {
    const [recent, setRecent] = useState<RecentItem[]>([]);
    const [queue, setQueue] = useState<QueuedDownload[]>([]);
    const [online, setOnline] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    const refresh = useCallback(() => {
        setRecent(recentlyViewed());
        setQueue(downloadQueue());
    }, []);

    useEffect(() => {
        setMounted(true);
        refresh();
        setOnline(isOnline());

        const up = () => setOnline(true);
        const down = () => setOnline(false);
        window.addEventListener('online', up);
        window.addEventListener('offline', down);
        return () => {
            window.removeEventListener('online', up);
            window.removeEventListener('offline', down);
        };
    }, [refresh]);

    const retry = async (item: QueuedDownload) => {
        setBusy(item.examId);
        noteAttempt(item.examId, item.asset);
        try {
            const res = await fetch(`/api/papers/${item.examId}/download?asset=${item.asset}`);
            const data = await res.json();

            if (!res.ok) {
                // A refusal is a real answer and the queue should stop holding
                // it: retrying something unpurchased for ever is just noise.
                if (res.status === 402 || res.status === 403) {
                    dequeueDownload(item.examId, item.asset);
                    refresh();
                    toast.error(data.error ?? 'You do not have this one yet');
                    return;
                }
                throw new Error(data.error ?? 'Could not download');
            }

            if (data.url) {
                const a = document.createElement('a');
                a.href = data.url;
                a.rel = 'noopener';
                document.body.appendChild(a);
                a.click();
                a.remove();
            }

            dequeueDownload(item.examId, item.asset);
            refresh();
            toast.success('Downloading');
        } catch (err) {
            // Left in the queue on purpose. This is the case the queue exists
            // for, and removing it would throw away the only record of what the
            // person was trying to do.
            refresh();
            toast.error(err instanceof Error ? err.message : 'Still no connection — kept in your queue');
        } finally {
            setBusy(null);
        }
    };

    const remove = (item: QueuedDownload) => {
        dequeueDownload(item.examId, item.asset);
        refresh();
    };

    // Nothing to say until the browser has told us what it remembers.
    if (!mounted || (recent.length === 0 && queue.length === 0)) return null;

    return (
        <>
            {queue.length > 0 && (
                <section aria-labelledby="queue-heading" className="mt-16">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <h2 id="queue-heading" className="title-2">
                            Waiting to download
                        </h2>
                        {!online && (
                            <span className="meta inline-flex items-center gap-1.5">
                                <WifiOff className="h-3.5 w-3.5" aria-hidden />
                                No connection
                            </span>
                        )}
                    </div>
                    <p className="meta mt-1">
                        Kept on this phone. Tap to try again when you have signal.
                    </p>

                    <ul className="mt-4 divide-y divide-border">
                        {queue.map((item) => (
                            <li
                                key={`${item.examId}-${item.asset}`}
                                className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="heading-ui">{item.title}</p>
                                    <p className="meta mt-0.5">
                                        {item.asset === 'scheme' ? 'Marking scheme' : 'Question paper'}
                                        {item.attempts > 0 &&
                                            ` · ${item.attempts} attempt${item.attempts === 1 ? '' : 's'}`}
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => retry(item)}
                                    disabled={busy === item.examId || !online}
                                    className="btn-primary btn-sm shrink-0"
                                >
                                    {busy === item.examId ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                    ) : (
                                        <Download className="h-3.5 w-3.5" aria-hidden />
                                    )}
                                    {online ? 'Try again' : 'Waiting'}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => remove(item)}
                                    className="btn-icon h-9 w-9 shrink-0"
                                    aria-label={`Remove ${item.title} from the queue`}
                                >
                                    <X className="h-4 w-4" aria-hidden />
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {recent.length > 0 && (
                <section aria-labelledby="recent-heading" className="mt-16">
                    <h2 id="recent-heading" className="title-2 inline-flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" aria-hidden />
                        Recently viewed
                    </h2>
                    <p className="meta mt-1">Remembered on this phone, not on your account.</p>

                    <ul className="rail-x mt-4 -mx-1 px-1">
                        {recent.slice(0, 12).map((r, i) => (
                            <li key={r.id} className="w-[15rem] shrink-0">
                                <Link
                                    href={`/papers/${r.slug || r.id}`}
                                    className="sheet settle-in group flex h-full flex-col p-4"
                                    style={{ '--i': i % 12 } as React.CSSProperties}
                                >
                                    <h3 className="heading-ui line-clamp-2 transition-colors group-hover:text-primary">
                                        {r.title}
                                    </h3>
                                    <p className="meta mt-1.5 line-clamp-1">
                                        {[r.gradeLabel, r.subject].filter(Boolean).join(' · ')}
                                    </p>
                                    <div className="flex-1" />
                                    <span className="figure mt-3 text-[11px] text-muted-foreground">
                                        {r.priceCents === 0 ? 'Free' : 'Paid'}
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </>
    );
}
