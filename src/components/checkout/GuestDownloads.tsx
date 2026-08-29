'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Check, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Order } from '@/types/shop';

/**
 * What a guest gets the moment their payment lands.
 *
 * Somebody who bought without an account has no library page to be sent to, so
 * this is their library: the papers they just paid for, on the screen they paid
 * from, downloadable immediately. Sending them to /library instead would land
 * them on a sign-in wall holding a paid receipt, which is the exact experience
 * guest checkout exists to remove.
 *
 * The access is real but narrow — a signed cookie naming this one order, good
 * for a week (see lib/orderAccess.ts). So the invitation to set a password is
 * not an upsell, it is the honest next step, and it says why rather than just
 * asking.
 */
export default function GuestDownloads({ order }: { order: Order }) {
    const items = order.items ?? [];

    return (
        <div className="mt-5 space-y-4">
            <div className="rounded-[var(--radius)] border border-success/40 bg-success/[0.06] p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-success">
                    <Check className="h-4 w-4" aria-hidden />
                    Payment received
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                    Order {order.reference} — everything below is yours.
                </p>
            </div>

            <ul className="space-y-2">
                {items.map((item) => (
                    <li key={item.exam_id}>
                        <DownloadRow examId={item.exam_id} title={item.title} />
                    </li>
                ))}
            </ul>

            <div className="rounded-[var(--radius)] border border-border p-4">
                <h3 className="overline">Keep these papers</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    You can download them from this device for the next seven days. Set a password
                    and they move into a library you can reach from anywhere, on any phone.
                </p>
                <Link href="/auth/signup?next=/library" className="btn-outline mt-3 w-full">
                    Set a password
                </Link>
            </div>
        </div>
    );
}

/**
 * One paper, and the marking scheme if it came with one.
 *
 * The scheme is not requested up front: the button asks the download route for
 * it and simply reports back if there is none, rather than this component
 * carrying a second copy of what each paper includes.
 */
function DownloadRow({ examId, title }: { examId: string; title: string }) {
    const [busy, setBusy] = useState<'paper' | 'scheme' | null>(null);

    const fetchFile = async (asset: 'paper' | 'scheme') => {
        setBusy(asset);
        try {
            const res = await fetch(`/api/papers/${examId}/download?asset=${asset}`);
            const data = await res.json();

            if (!res.ok || !data.url) {
                toast.error(data.error || 'That download could not be prepared.');
                return;
            }
            window.location.href = data.url;
        } catch {
            toast.error('That download could not be prepared. Check your connection.');
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="rounded-[var(--radius)] border border-border p-3">
            <p className="text-sm font-semibold leading-snug">{title}</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => fetchFile('paper')}
                    disabled={busy !== null}
                    className="btn-primary flex-1 text-xs"
                >
                    {busy === 'paper' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <Download className="h-3.5 w-3.5" aria-hidden />
                    )}
                    Download
                </button>
                <button
                    type="button"
                    onClick={() => fetchFile('scheme')}
                    disabled={busy !== null}
                    className="btn-outline flex-1 text-xs"
                >
                    {busy === 'scheme' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <Download className="h-3.5 w-3.5" aria-hidden />
                    )}
                    Marking scheme
                </button>
            </div>
        </div>
    );
}
