'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Check, Loader2, Smartphone } from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import Footer from '@/components/shell/Footer';
import PaymentPending from '@/components/checkout/PaymentPending';
import { formatPrice } from '@/lib/catalog';
import { durationLabel, perMonth, savingsPercent, type SubscriptionPlan, type SubscriptionStatus } from '@/lib/plans';
import { createClient } from '@/utils/supabase/client';
import type { Order } from '@/types/shop';

/**
 * ALL-ACCESS PLANS.
 *
 * Not in the top navigation on purpose. The site is two things — buy a paper,
 * set a paper — and a third permanent tab would dilute that. This page is
 * reached from the moments where a plan is actually the better answer: a cart
 * with several papers in it, and the library.
 *
 * Buying a plan is the same transaction as buying a paper, so it reuses the same
 * order, the same M-Pesa prompt and the same paybill fallback.
 */
export default function PlansPage() {
    const router = useRouter();

    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [subscription, setSubscription] = useState<SubscriptionStatus>({ active: false });
    const [loading, setLoading] = useState(true);
    const [signedIn, setSignedIn] = useState<boolean | null>(null);

    const [chosen, setChosen] = useState<string | null>(null);
    const [phone, setPhone] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [order, setOrder] = useState<Order | null>(null);
    const [statusMessage, setStatusMessage] = useState('');
    const [receipt, setReceipt] = useState('');

    const loadPlans = useCallback(async () => {
        try {
            const res = await fetch('/api/plans');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not load the plans');
            setPlans(data.plans || []);
            setSubscription(data.subscription || { active: false });
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not load the plans');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadPlans();
        createClient()
            .auth.getUser()
            .then(({ data }) => setSignedIn(Boolean(data.user)))
            .catch(() => setSignedIn(false));
    }, [loadPlans]);

    // While a payment is outstanding, poll until the callback settles it. The
    // subscription only becomes real when the database says the order is paid.
    useEffect(() => {
        if (!order || order.status === 'paid') return;
        const timer = setInterval(async () => {
            try {
                const res = await fetch(`/api/orders/${order.id}`);
                const data = await res.json();
                if (data.order?.status === 'paid') {
                    setOrder(data.order);
                    clearInterval(timer);
                    toast.success('Payment received — every paper is now yours to download');
                    await loadPlans();
                    router.push('/library');
                } else if (data.order?.status === 'failed') {
                    setOrder(data.order);
                    setStatusMessage('That payment did not go through. Try again or pay to the paybill.');
                    clearInterval(timer);
                }
            } catch {
                /* a dropped request is not fatal; keep polling */
            }
        }, 4000);

        const stop = setTimeout(() => clearInterval(timer), 180_000);
        return () => {
            clearInterval(timer);
            clearTimeout(stop);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [order?.id, order?.status]);

    const subscribe = async (slug: string) => {
        if (!signedIn) {
            router.push('/auth/login?next=/plans');
            return;
        }
        setSubmitting(true);
        setStatusMessage('');
        try {
            const res = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan_slug: slug, phone }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || 'Could not start that subscription');
                return;
            }
            setOrder(data.order);
            setStatusMessage(data.message || '');
        } catch {
            toast.error('Could not reach the server. Check your connection and try again.');
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

    return (
        <div className="min-h-screen bg-background">
            <TopNav />

            <div className="shell-width min-w-0 py-10">
                <Link
                    href="/catalog"
                    className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to the shop
                </Link>

                <header className="page-header">
                    <h1 className="title-1">Every paper, one payment</h1>
                    <p className="mt-2 text-muted-foreground">
                        A term needs eight or ten papers. Buying them one at a time means one M-Pesa prompt each.
                        A pass covers the whole catalogue — including everything added while it runs.
                    </p>
                </header>

                {subscription.active && (
                    <div className="settle-in mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-success/30 bg-success/5 p-4">
                        <Check className="h-5 w-5 shrink-0 text-success" />
                        <p className="text-sm">
                            <strong>{subscription.plan_name}</strong> is active — {subscription.days_left} day
                            {subscription.days_left === 1 ? '' : 's'} left. Renewing now adds to the end, so no
                            days are lost.
                        </p>
                    </div>
                )}

                {loading ? (
                    <div className="mt-8 grid gap-4 sm:grid-cols-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="skeleton h-64" />
                        ))}
                    </div>
                ) : plans.length === 0 ? (
                    <p className="mt-8 text-sm text-muted-foreground">
                        No plans are on sale at the moment.
                    </p>
                ) : (
                    <div className="mt-8 grid min-w-0 gap-4 sm:grid-cols-3">
                        {plans.map((plan) => {
                            const saving = savingsPercent(plan, plans);
                            const monthly = perMonth(plan);
                            const isChosen = chosen === plan.slug;

                            return (
                                <button
                                    key={plan.slug}
                                    type="button"
                                    onClick={() => setChosen(plan.slug)}
                                    aria-pressed={isChosen}
                                    className={`sheet min-w-0 p-4 text-left transition-colors ${
                                        isChosen ? 'border-primary ring-1 ring-primary' : 'hover:border-primary/40'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <h2 className="title-2">{plan.name}</h2>
                                        {plan.is_featured && <span className="chip chip-applied">Most popular</span>}
                                    </div>

                                    <p className="figure mt-4 text-2xl font-bold">
                                        {formatPrice(plan.price_cents, plan.currency)}
                                    </p>
                                    <p className="text-sm text-muted-foreground">for {durationLabel(plan.duration_days)}</p>

                                    {monthly && (
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {monthly}
                                            {saving > 0 ? ` · saves ${saving}%` : ''}
                                        </p>
                                    )}

                                    {plan.description && (
                                        <p className="mt-3 text-sm text-muted-foreground">{plan.description}</p>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Checkout */}
                {chosen && !order && (
                    <div className="settle-in sheet mt-6 max-w-md p-5">
                        <h2 className="title-2">Pay with M-Pesa</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Your number receives a prompt. If it does not arrive, pay to the paybill instead —
                            the option appears after you continue.
                        </p>

                        <label className="label mt-4" htmlFor="plan-phone">
                            Safaricom number
                        </label>
                        <div className="relative">
                            <Smartphone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                id="plan-phone"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                placeholder="0712345678"
                                inputMode="tel"
                                className="field pl-9"
                            />
                        </div>

                        <button
                            type="button"
                            onClick={() => subscribe(chosen)}
                            disabled={submitting}
                            className="btn-primary mt-4 w-full"
                        >
                            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                            {submitting ? 'Starting…' : 'Continue'}
                        </button>

                        <p className="mt-3 text-center text-xs text-muted-foreground">
                            No automatic renewal — it simply ends unless you buy again.
                        </p>
                    </div>
                )}

                {order && (
                    <div className="sheet mt-6 max-w-md p-5">
                        <PaymentPending
                            order={order}
                            statusMessage={statusMessage}
                            receipt={receipt}
                            setReceipt={setReceipt}
                            onSubmitReceipt={submitReceipt}
                            submitting={submitting}
                        />
                    </div>
                )}
            </div>
            <Footer />
        </div>
    );
}
