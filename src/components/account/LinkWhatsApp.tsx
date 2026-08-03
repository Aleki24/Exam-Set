'use client';

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, Loader2, MessageCircle } from 'lucide-react';

/**
 * LINK WHATSAPP — the browser half of joining a chat to an account.
 *
 * The bot tells people this control exists: send LINK and it replies "Open
 * /account and tap Link WhatsApp for a 6-character code". So the instruction has
 * to be true, and the code has to look exactly like what they are about to type.
 *
 * The code is set in the mono face used for every other figure on the site, at a
 * size you can read across a desk while holding a phone. Nothing new was added
 * to the design system for it — `sheet`, `overline`, `figure`, `btn-outline` and
 * `meta` were already carrying this kind of block everywhere else.
 *
 * The countdown is not decoration. A code silently going stale is somebody
 * typing carefully into a chat and being told it is invalid, with no way to tell
 * whether they mistyped it or simply took too long.
 */

/** The bot's number, when the deployment has published one. */
const BOT_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '';

function waLink(code: string): string | null {
    const digits = BOT_NUMBER.replace(/\D/g, '');
    if (!digits) return null;
    // Pre-filled so the code does not have to survive a trip through short-term
    // memory and a keyboard.
    return `https://wa.me/${digits}?text=${encodeURIComponent(code)}`;
}

export default function LinkWhatsApp() {
    const [linked, setLinked] = useState<{ linked: boolean; phone: string | null } | null>(null);
    const [code, setCode] = useState<string | null>(null);
    const [expiresAt, setExpiresAt] = useState<number | null>(null);
    const [secondsLeft, setSecondsLeft] = useState(0);
    const [working, setWorking] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/account/link-code')
            .then((r) => r.json())
            .then((data) => {
                if (cancelled || data.error) return;
                setLinked({ linked: Boolean(data.linked), phone: data.phone ?? null });
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    // One interval for the whole countdown, cleared when the code expires so a
    // page left open overnight is not ticking once a second until morning.
    useEffect(() => {
        if (!expiresAt) return;
        const tick = () => {
            const left = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
            setSecondsLeft(left);
            if (left === 0) {
                // Clearing `expiresAt` re-runs this effect, whose cleanup stops
                // the interval. Clearing only the code would leave a page opened
                // overnight ticking once a second until morning.
                setCode(null);
                setExpiresAt(null);
            }
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [expiresAt]);

    const request = async () => {
        setWorking(true);
        setCopied(false);
        try {
            const res = await fetch('/api/account/link-code', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not create a code');
            setCode(data.code);
            setExpiresAt(new Date(data.expiresAt).getTime());
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not create a code');
        } finally {
            setWorking(false);
        }
    };

    const copy = async () => {
        if (!code) return;
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard access is refused often enough — over plain HTTP, in
            // some in-app browsers — that failing loudly would be noise. The
            // code is on screen and can be typed; that is the actual path.
            toast.message('Type the code into the chat instead.');
        }
    };

    const mmss = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`;
    const link = code ? waLink(code) : null;

    return (
        <section aria-labelledby="whatsapp-heading" className="mt-12">
            <h2 id="whatsapp-heading" className="overline">
                WhatsApp
            </h2>
            <p className="meta mt-2">
                Buy and receive papers in a chat. Link this number and your purchases show up in
                both places.
            </p>

            <div className="sheet mt-4 p-5">
                {linked?.linked && !code ? (
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <span className="flex items-center gap-2.5">
                            <MessageCircle className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                            <span>
                                <span className="heading-ui block">Linked</span>
                                <span className="meta">{linked.phone}</span>
                            </span>
                        </span>
                        <button
                            type="button"
                            onClick={request}
                            disabled={working}
                            className="btn-outline"
                        >
                            {working && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                            Link another number
                        </button>
                    </div>
                ) : !code ? (
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <p className="meta max-w-md">
                            Get a code, then send it to us on WhatsApp. It works for fifteen
                            minutes and once only.
                        </p>
                        <button
                            type="button"
                            onClick={request}
                            disabled={working}
                            className="btn-primary"
                        >
                            {working && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                            Link WhatsApp
                        </button>
                    </div>
                ) : (
                    <div>
                        <p className="overline">Your code</p>
                        <div className="mt-2 flex flex-wrap items-center gap-4">
                            <span className="figure text-3xl tracking-[0.35em]">{code}</span>
                            <button
                                type="button"
                                onClick={copy}
                                className="btn-outline"
                                aria-label="Copy the code"
                            >
                                {copied ? (
                                    <Check className="h-4 w-4" aria-hidden />
                                ) : (
                                    <Copy className="h-4 w-4" aria-hidden />
                                )}
                                {copied ? 'Copied' : 'Copy'}
                            </button>
                        </div>

                        <ol className="meta mt-5 space-y-1.5 leading-relaxed">
                            <li>1. Open WhatsApp and message us.</li>
                            <li>2. Send the word LINK.</li>
                            <li>3. Send the code above.</li>
                        </ol>

                        {link && (
                            <a
                                href={link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-primary mt-5"
                            >
                                <MessageCircle className="h-4 w-4" aria-hidden />
                                Open WhatsApp
                            </a>
                        )}

                        <p className="meta mt-5" role="status">
                            Expires in {mmss}. Anyone who has this code can claim your papers, so
                            do not share it.
                        </p>
                    </div>
                )}
            </div>
        </section>
    );
}
