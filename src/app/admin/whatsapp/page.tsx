'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Check, Loader2, Lock, MessageCircle, Send } from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import { useRole } from '@/lib/roles';
import { formatPrice } from '@/lib/catalog';

/**
 * CONVERSATIONS WAITING FOR A PERSON
 *
 * When somebody asks for a human, the bot flags the session and stops replying.
 * That silence is deliberate — nothing is worse than a bot talking over a real
 * conversation — but it only holds up if somebody sees the flag. This page is
 * the other half of that promise; without it, "talk to a person" means "be
 * ignored".
 *
 * Sorted longest-wait-first, because a queue sorted by newest is a queue where
 * whoever has waited all morning is never reached.
 *
 * There is no message history here and there should not be: migration 020 stores
 * message ids for idempotency and no content, which was a decision rather than
 * an oversight. Staff see who is waiting, why, what is in their cart, and
 * whether WhatsApp will even accept a reply.
 */

interface Conversation {
    phone: string;
    userId: string | null;
    since: string | null;
    reason: string | null;
    lastInboundAt: string | null;
    state: string;
    muted: boolean;
    cartCount: number;
    cartTotalCents: number;
    canReply: boolean;
}

/** "3 hours" — how long they have been waiting, said the way a person would. */
function waitedFor(since: string | null): string {
    if (!since) return 'just now';
    const minutes = Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 60000));
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? '' : 's'}`;
}

export default function AdminWhatsAppPage() {
    const { isAdmin, ready, signedIn } = useRole();

    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [openPhone, setOpenPhone] = useState<string | null>(null);
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/whatsapp');
            const data = await res.json();
            if (data.error) {
                toast.error(data.error);
                return;
            }
            setConversations(data.conversations ?? []);
        } catch {
            toast.error('Could not load the queue');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!ready || !isAdmin) return;
        load();
    }, [ready, isAdmin, load]);

    const reply = async (phone: string) => {
        const body = draft.trim();
        if (!body) return;
        setBusy(phone);
        try {
            const res = await fetch('/api/admin/whatsapp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, action: 'reply', body }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not send');
            toast.success('Sent');
            setDraft('');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not send');
        } finally {
            setBusy(null);
        }
    };

    const resolve = async (phone: string) => {
        setBusy(phone);
        try {
            const res = await fetch('/api/admin/whatsapp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, action: 'resolve' }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not update');
            setConversations((current) => current.filter((c) => c.phone !== phone));
            if (openPhone === phone) setOpenPhone(null);
            toast.success('Handed back to the bot');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not update');
        } finally {
            setBusy(null);
        }
    };

    if (ready && !signedIn) {
        return <Gate title="Sign in to continue" body="This queue is for the shop owner and admins." />;
    }
    if (ready && !isAdmin) {
        return (
            <Gate
                title="You do not have admin access"
                body="Only the shop owner and admins can see customer conversations."
            />
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <TopNav />

            <main className="shell-width max-w-3xl py-10 sm:py-14">
                <Link href="/admin" className="chip">
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                    Admin
                </Link>

                <header className="mt-6">
                    <p className="overline">WhatsApp</p>
                    <h1 className="display-2 mt-3">Waiting for a person</h1>
                    <p className="lead mt-4">
                        The bot has gone quiet on these numbers. Answer here, or hand the
                        conversation back when you are done.
                    </p>
                </header>

                {loading ? (
                    <div className="grid place-items-center py-24">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
                    </div>
                ) : conversations.length === 0 ? (
                    <div className="sheet mt-8 p-8 text-center">
                        <MessageCircle
                            className="mx-auto h-8 w-8 text-muted-foreground"
                            aria-hidden
                        />
                        <p className="heading-ui mt-4">Nobody is waiting</p>
                        <p className="meta mt-1.5">
                            Conversations appear here when somebody asks for a person, or when the
                            bot cannot help.
                        </p>
                    </div>
                ) : (
                    <ul className="mt-8 space-y-3">
                        {conversations.map((c) => {
                            const open = openPhone === c.phone;
                            return (
                                <li key={c.phone} className="sheet p-5">
                                    <div className="flex flex-wrap items-start justify-between gap-4">
                                        <div>
                                            <p className="figure text-base">{c.phone}</p>
                                            <p className="meta mt-1.5">
                                                Waiting {waitedFor(c.since)}
                                                {c.reason ? ` · ${c.reason}` : ''}
                                            </p>
                                            {c.cartCount > 0 && (
                                                <p className="meta mt-1">
                                                    {c.cartCount} paper
                                                    {c.cartCount === 1 ? '' : 's'} in their list ·{' '}
                                                    {formatPrice(c.cartTotalCents, 'KES')}
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2">
                                            {c.muted ? (
                                                <span className="badge-soft">Stopped messages</span>
                                            ) : !c.canReply ? (
                                                <span className="badge-soft">Over 24h — call them</span>
                                            ) : null}

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setOpenPhone(open ? null : c.phone);
                                                    setDraft('');
                                                }}
                                                disabled={!c.canReply || c.muted}
                                                className="btn-outline"
                                            >
                                                <Send className="h-4 w-4" aria-hidden />
                                                Reply
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => resolve(c.phone)}
                                                disabled={busy === c.phone}
                                                className="btn-primary"
                                            >
                                                {busy === c.phone && (
                                                    <Loader2
                                                        className="h-4 w-4 animate-spin"
                                                        aria-hidden
                                                    />
                                                )}
                                                <Check className="h-4 w-4" aria-hidden />
                                                Done
                                            </button>
                                        </div>
                                    </div>

                                    {open && (
                                        <div className="mt-4 border-t border-border pt-4">
                                            <label htmlFor={`reply-${c.phone}`} className="overline">
                                                Your reply
                                            </label>
                                            <textarea
                                                id={`reply-${c.phone}`}
                                                value={draft}
                                                onChange={(e) => setDraft(e.target.value)}
                                                rows={3}
                                                maxLength={3000}
                                                placeholder="Types straight into their WhatsApp."
                                                className="field mt-2"
                                            />
                                            <div className="mt-3 flex items-center gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => reply(c.phone)}
                                                    disabled={busy === c.phone || !draft.trim()}
                                                    className="btn-primary"
                                                >
                                                    {busy === c.phone && (
                                                        <Loader2
                                                            className="h-4 w-4 animate-spin"
                                                            aria-hidden
                                                        />
                                                    )}
                                                    Send
                                                </button>
                                                <p className="meta">
                                                    They stay on this list until you mark it done.
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </main>
        </div>
    );
}

function Gate({ title, body }: { title: string; body: string }) {
    return (
        <div className="min-h-screen bg-background">
            <TopNav />
            <div className="shell-width py-20 text-center">
                <Lock className="mx-auto mb-4 h-10 w-10 text-muted-foreground" aria-hidden />
                <h1 className="title-1">{title}</h1>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{body}</p>
                <div className="mt-6 flex justify-center gap-2">
                    <Link href="/" className="btn-primary">
                        Browse papers
                    </Link>
                </div>
            </div>
        </div>
    );
}
