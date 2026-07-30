'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, ClipboardCheck, Loader2, ShieldCheck, ShoppingCart, Trash2, Smartphone } from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import { useCart } from '@/lib/cart';
import { BUNDLE_TIERS, examTypeName, formatPrice } from '@/lib/catalog';
import { createClient } from '@/utils/supabase/client';
import type { Order } from '@/types/shop';

/**
 * CART + CHECKOUT in one page.
 *
 * Splitting them across two routes only adds a step; the buyer sees what they
 * are paying for and pays for it in the same place.
 */
export default function CartPage() {
    const router = useRouter();
    const cart = useCart();
    const [signedIn, setSignedIn] = useState<boolean | null>(null);
    const [phone, setPhone] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [order, setOrder] = useState<Order | null>(null);
    const [statusMessage, setStatusMessage] = useState('');
    const [receipt, setReceipt] = useState('');

    useEffect(() => {
        createClient()
            .auth.getUser()
            .then(({ data }) => setSignedIn(Boolean(data.user)));
    }, []);

    // While an M-Pesa prompt is outstanding, poll until the callback settles it.
    useEffect(() => {
        if (!order || order.status === 'paid') return;
        const timer = setInterval(async () => {
            try {
                const res = await fetch(`/api/orders/${order.id}`);
                const data = await res.json();
                if (data.order?.status === 'paid') {
                    setOrder(data.order);
                    cart.clear();
                    toast.success('Payment received — your papers are in your library');
                    clearInterval(timer);
                    router.push('/library');
                } else if (data.order?.status === 'failed') {
                    setOrder(data.order);
                    setStatusMessage('That payment did not go through. Try again or pay to the paybill.');
                    clearInterval(timer);
                }
            } catch {
                /* keep polling; a dropped request is not fatal */
            }
        }, 4000);

        // Stop after 3 minutes — the STK prompt expires well before then.
        const stop = setTimeout(() => clearInterval(timer), 180_000);
        return () => {
            clearInterval(timer);
            clearTimeout(stop);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [order?.id, order?.status]);

    const checkout = async () => {
        if (!signedIn) {
            router.push('/auth/login?next=/cart');
            return;
        }
        setSubmitting(true);
        setStatusMessage('');
        try {
            const res = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ exam_ids: cart.items.map((i) => i.exam_id), phone }),
            });
            const data = await res.json();

            if (!res.ok) {
                toast.error(data.error || 'Checkout failed');
                return;
            }

            setOrder(data.order);
            setStatusMessage(data.message || '');

            if (data.granted) {
                cart.clear();
                toast.success(data.message || 'Added to your library');
                router.push('/library');
            }
        } catch {
            toast.error('Checkout failed. Check your connection and try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const submitReceipt = async () => {
        if (!order) return;
        setSubmitting(true);
        try {
            const res = await fetch(`/api/orders/${order.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'manual', receipt }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || 'Could not record that code');
                return;
            }
            toast.success('Code received');
            setStatusMessage(data.message);
            setReceipt('');
        } finally {
            setSubmitting(false);
        }
    };

    const { items, totals } = cart;
    const paidCount = items.filter((i) => i.price_cents > 0).length;
    const nextTier = BUNDLE_TIERS.slice().reverse().find((t) => paidCount < t.minItems);

    if (cart.ready && items.length === 0 && !order) {
        return (
            <div className="min-h-screen bg-background">
                <TopNav />
                <div className="shell-width py-20 text-center">
                    <ShoppingCart className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                    <h1 className="title-1">Your cart is empty</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Add papers from the shop, or build one yourself in the setter.
                    </p>
                    <div className="mt-6 flex justify-center gap-2">
                        <Link href="/" className="btn-primary">
                            Browse papers
                        </Link>
                        <Link href="/set" className="btn-outline">
                            Set an exam
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <TopNav />

            <div className="shell-width py-6">
                <Link
                    href="/"
                    className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Keep shopping
                </Link>

                <div className="mb-6">
                    <p className="overline mb-2">Checkout</p>
                    <h1 className="display-2">Your cart</h1>
                </div>

                <div className="mt-6 grid min-w-0 gap-8 lg:grid-cols-[1fr_380px]">
                    {/* Items */}
                    <div className="min-w-0 space-y-3">
                        {items.map((item) => (
                            <div key={item.exam_id} className="sheet flex items-center gap-4 p-4">
                                <div className="min-w-0 flex-1">
                                    <Link
                                        href={`/papers/${item.exam_id}`}
                                        className="heading-ui block truncate hover:text-primary"
                                    >
                                        {item.title}
                                    </Link>
                                    <p className="mt-1 truncate text-xs text-muted-foreground">
                                        {[item.subject, item.grade_label, examTypeName(item.exam_type), item.year]
                                            .filter(Boolean)
                                            .join(' · ')}
                                    </p>
                                    {item.has_marking_scheme && (
                                        <span className="badge-soft mt-2">
                                            <ClipboardCheck className="h-3 w-3" />
                                            Marking scheme
                                        </span>
                                    )}
                                </div>
                                <span className="figure shrink-0 text-sm font-bold">
                                    {formatPrice(item.price_cents, item.currency)}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => cart.remove(item.exam_id)}
                                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                                    aria-label={`Remove ${item.title}`}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        ))}

                        {nextTier && (
                            <p className="rounded-lg border border-accent/25 bg-accent/[0.07] px-4 py-3 text-sm text-accent">
                                Add {nextTier.minItems - paidCount} more paper
                                {nextTier.minItems - paidCount === 1 ? '' : 's'} to save {nextTier.percentOff}% on this
                                order.
                            </p>
                        )}
                    </div>

                    {/* Summary + pay */}
                    <aside>
                        <div className="surface sticky top-24 p-5">
                            <h2 className="overline">Order summary</h2>

                            <dl className="mt-4 space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <dt className="text-muted-foreground">
                                        Subtotal ({items.length} paper{items.length === 1 ? '' : 's'})
                                    </dt>
                                    <dd className="figure font-semibold">
                                        {formatPrice(totals.subtotalCents, totals.currency)}
                                    </dd>
                                </div>
                                {totals.discountCents > 0 && (
                                    <div className="flex justify-between text-primary">
                                        <dt>Bundle discount ({totals.discountPercent}%)</dt>
                                        <dd className="figure font-semibold">
                                            −{formatPrice(totals.discountCents, totals.currency)}
                                        </dd>
                                    </div>
                                )}
                                <div className="flex justify-between border-t border-border pt-3 text-base">
                                    <dt className="font-bold">Total</dt>
                                    <dd className="figure text-base font-bold">
                                        {formatPrice(totals.totalCents, totals.currency)}
                                    </dd>
                                </div>
                            </dl>

                            {/* Payment */}
                            {!order ? (
                                <div className="mt-5">
                                    {totals.totalCents > 0 && (
                                        <div className="mb-3">
                                            <label className="label" htmlFor="phone">
                                                M-Pesa number
                                            </label>
                                            <div className="relative">
                                                <Smartphone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                                <input
                                                    id="phone"
                                                    type="tel"
                                                    inputMode="tel"
                                                    value={phone}
                                                    onChange={(e) => setPhone(e.target.value)}
                                                    placeholder="0712 345 678"
                                                    className="field pl-9"
                                                />
                                            </div>
                                            <p className="mt-1.5 text-xs text-muted-foreground">
                                                We send the payment request straight to your phone.
                                            </p>
                                        </div>
                                    )}

                                    <button
                                        type="button"
                                        onClick={checkout}
                                        disabled={submitting || signedIn === null}
                                        className="btn-buy w-full"
                                    >
                                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                        {totals.totalCents === 0
                                            ? 'Add to my library'
                                            : `Pay ${formatPrice(totals.totalCents, totals.currency)}`}
                                    </button>

                                    {signedIn === false && (
                                        <p className="mt-3 text-xs text-muted-foreground">
                                            You will be asked to sign in first — your cart is kept.
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <PaymentPending
                                    order={order}
                                    statusMessage={statusMessage}
                                    receipt={receipt}
                                    setReceipt={setReceipt}
                                    onSubmitReceipt={submitReceipt}
                                    submitting={submitting}
                                />
                            )}

                            <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
                                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                Papers unlock only after payment is confirmed, then stay in your library for good.
                            </p>
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
}

/** Shown between "pay" and "paid": the STK prompt or the paybill fallback. */
function PaymentPending({
    order,
    statusMessage,
    receipt,
    setReceipt,
    onSubmitReceipt,
    submitting,
}: {
    order: Order;
    statusMessage: string;
    receipt: string;
    setReceipt: (v: string) => void;
    onSubmitReceipt: () => void;
    submitting: boolean;
}) {
    const paybill = process.env.NEXT_PUBLIC_MPESA_PAYBILL;
    const till = process.env.NEXT_PUBLIC_MPESA_TILL;

    return (
        <div className="mt-5 space-y-4">
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                <p className="text-sm font-semibold">Order {order.reference}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                    {statusMessage || 'Waiting for payment confirmation…'}
                </p>
                {order.status === 'awaiting_confirmation' && order.provider === 'mpesa' && (
                    <p className="mt-3 flex items-center gap-2 text-xs text-primary">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Enter your M-Pesa PIN on your phone
                    </p>
                )}
            </div>

            {/* Manual fallback: always available, because STK can fail. */}
            <div className="rounded-lg border border-border p-4">
                <h3 className="overline">Or pay manually</h3>
                <ol className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {(paybill || till) && (
                        <li>
                            1. M-Pesa → {paybill ? `Paybill ${paybill}` : `Buy Goods, Till ${till}`}
                        </li>
                    )}
                    <li>{paybill || till ? '2.' : '1.'} Account number: <strong className="text-foreground">{order.reference}</strong></li>
                    <li>{paybill || till ? '3.' : '2.'} Paste the confirmation code below</li>
                </ol>

                <div className="mt-3 flex gap-2">
                    <input
                        value={receipt}
                        onChange={(e) => setReceipt(e.target.value.toUpperCase())}
                        placeholder="SGH4X9ZQ12"
                        className="field font-mono text-sm uppercase"
                        maxLength={15}
                        aria-label="M-Pesa transaction code"
                    />
                    <button
                        type="button"
                        onClick={onSubmitReceipt}
                        disabled={submitting || receipt.length < 8}
                        className="btn-outline shrink-0"
                    >
                        Submit
                    </button>
                </div>
            </div>
        </div>
    );
}
