'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, ClipboardCheck, Infinity as InfinityIcon, LifeBuoy, Loader2, ShieldCheck, ShoppingCart, Trash2, Smartphone } from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import Footer from '@/components/shell/Footer';
import PaymentPending from '@/components/checkout/PaymentPending';
import GuestDownloads from '@/components/checkout/GuestDownloads';
import { useCart } from '@/lib/cart';
import { BUNDLE_TIERS, examTypeName, formatPrice } from '@/lib/catalog';
import { durationLabel, type SubscriptionPlan } from '@/lib/plans';
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
    const [cheapestPlan, setCheapestPlan] = useState<SubscriptionPlan | null>(null);

    useEffect(() => {
        createClient()
            .auth.getUser()
            .then(({ data }) => setSignedIn(Boolean(data.user)))
            .catch(() => setSignedIn(false));
    }, []);

    // Only used to compare against the cart total, so a failure here should
    // silently mean "no comparison to offer" rather than break checkout.
    useEffect(() => {
        fetch('/api/plans')
            .then((res) => res.json())
            .then((data) => {
                const active: SubscriptionPlan[] = data.plans || [];
                if (data.subscription?.active || active.length === 0) return;
                setCheapestPlan([...active].sort((a, b) => a.price_cents - b.price_cents)[0]);
            })
            .catch(() => {});
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
                    clearInterval(timer);
                    if (signedIn) {
                        toast.success('Payment received — your papers are in your library');
                        router.push('/library');
                    } else {
                        toast.success('Payment received — your papers are ready below');
                    }
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
        /*
         * No detour through /auth/login.
         *
         * This used to bounce anybody without a session to a sign-in form. The
         * cart survived the trip; the intention usually did not — a teacher who
         * has decided to spend KES 30 should not first have to decide on a
         * password. The number they are about to pay from is enough to hold
         * their purchase, and the server makes the account from it.
         */
        if (!signedIn && !phone.trim()) {
            setStatusMessage('Enter the M-Pesa number you will pay with.');
            document.getElementById('phone')?.focus();
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
                // A guest has no library page to be sent to — their downloads
                // are on the order in front of them. Pushing them to /library
                // would land them on a sign-in wall holding a paid receipt.
                if (!data.guest) router.push('/library');
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
                        <Link href="/catalog" className="btn-primary">
                            Browse papers
                        </Link>
                        <Link href="/set" className="btn-outline">
                            Set an exam
                        </Link>
                    </div>
                </div>
                <Footer />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <TopNav />

            <div className="shell-width py-6">
                <Link
                    href="/catalog"
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

                            {/* The one place a pass is obviously the better buy:
                                the moment the basket costs more than a month of
                                unlimited access. Shown only when the arithmetic
                                genuinely favours it, so it reads as help rather
                                than an upsell. */}
                            {cheapestPlan && totals.totalCents >= cheapestPlan.price_cents && !order && (
                                <Link
                                    href="/plans"
                                    className="settle-in mt-4 block rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm hover:border-primary/60"
                                >
                                    <span className="font-semibold text-primary">
                                        Every paper for {formatPrice(cheapestPlan.price_cents, cheapestPlan.currency)}
                                    </span>
                                    <span className="mt-0.5 block text-xs text-muted-foreground">
                                        Less than this cart, and it covers {durationLabel(cheapestPlan.duration_days)} of
                                        the whole catalogue.
                                    </span>
                                </Link>
                            )}

                            {/* Payment */}
                            {!order ? (
                                <div className="mt-5">
                                    {totals.totalCents > 0 && (
                                        /* The payment gets its own panel. It is
                                           the one decision on this screen, and
                                           a bare label under a price table did
                                           not look like one. Green is the
                                           wordmark's own `--brand-green` — a
                                           token that already exists, not a new
                                           colour borrowed from Safaricom. */
                                        <div
                                            className="mb-4 rounded-[var(--radius)] border p-4"
                                            style={{
                                                borderColor:
                                                    'color-mix(in oklab, var(--brand-green) 30%, var(--border))',
                                                background:
                                                    'color-mix(in oklab, var(--brand-green) 5%, transparent)',
                                            }}
                                        >
                                            <label className="label" htmlFor="phone">
                                                Pay with M-Pesa
                                            </label>
                                            <div className="relative">
                                                <Smartphone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                                <input
                                                    id="phone"
                                                    name="phone"
                                                    type="tel"
                                                    inputMode="tel"
                                                    autoComplete="tel"
                                                    value={phone}
                                                    onChange={(e) => setPhone(e.target.value)}
                                                    placeholder="0712 345 678"
                                                    className="field pl-9"
                                                />
                                            </div>
                                            <p className="mt-2 text-xs text-muted-foreground">
                                                The request goes straight to this phone. Use the number
                                                that holds the M-Pesa account.
                                            </p>
                                        </div>
                                    )}

                                    <button
                                        type="button"
                                        onClick={checkout}
                                        disabled={submitting || signedIn === null}
                                        className="btn-buy w-full"
                                    >
                                        {submitting ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : totals.totalCents > 0 ? (
                                            <Smartphone className="h-4 w-4" aria-hidden />
                                        ) : null}
                                        {totals.totalCents === 0
                                            ? 'Add to my library'
                                            : `Pay ${formatPrice(totals.totalCents, totals.currency)} with M-Pesa`}
                                    </button>

                                    {signedIn === false && (
                                        <p className="mt-3 text-xs text-muted-foreground">
                                            No account needed — this number becomes yours, and your
                                            papers are ready to download the moment payment lands.
                                        </p>
                                    )}
                                </div>
                            ) : (
                                order.status === 'paid' && signedIn === false ? (
                                    // A guest has nowhere else to be sent. Their
                                    // papers are here, on the screen they paid from.
                                    <GuestDownloads order={order} />
                                ) : (
                                    <PaymentPending
                                        order={order}
                                        statusMessage={statusMessage}
                                        receipt={receipt}
                                        setReceipt={setReceipt}
                                        onSubmitReceipt={submitReceipt}
                                        submitting={submitting}
                                    />
                                )
                            )}

                            <ul className="mt-5 space-y-2.5 border-t border-border pt-4">
                                <li className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
                                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                                    <span>
                                        Downloads unlock the moment payment is confirmed — no waiting
                                        for anyone to email you a file.
                                    </span>
                                </li>
                                <li className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
                                    <InfinityIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                                    <span>Everything you buy stays in your library, to fetch again any time.</span>
                                </li>
                                <li className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
                                    <LifeBuoy className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                                    <span>
                                        Paid and nothing arrived?{' '}
                                        <Link href="/contact" className="font-semibold text-primary hover:underline">
                                            Tell us
                                        </Link>{' '}
                                        — we fix it by hand.
                                    </span>
                                </li>
                            </ul>
                        </div>
                    </aside>
                </div>
            </div>
            <Footer />
        </div>
    );
}
