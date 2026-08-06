import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { bundleDiscount } from '@/lib/catalog';
import { getMpesaConfig, normalisePhone, stkPush } from '@/lib/mpesa';
import { createPlanOrder, makeReference } from '@/services/planOrders';

/**
 * POST /api/orders — turn a cart into an order.
 *
 * Prices are re-read from the database, never trusted from the request body, so
 * a tampered cart cannot change what anything costs. Status transitions go
 * through the guarded SQL functions in migration 012 — this route cannot mark
 * an order paid on its own.
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
            return NextResponse.json({ error: 'Sign in to check out' }, { status: 401 });
        }
        const userId = auth.user.id;

        const body = await req.json();
        const examIds: string[] = Array.from(new Set<string>(body.exam_ids || []));
        const phoneRaw: string = body.phone || '';
        const planSlug: string | null = body.plan_slug || null;

        // An order is either a basket of papers or one plan, never both. Keeping
        // them apart is what lets the M-Pesa flow, the reference and the admin
        // confirmation queue stay identical for the two kinds of sale.
        if (planSlug) {
            return planCheckout(supabase, userId, planSlug, phoneRaw);
        }

        if (examIds.length === 0) {
            return NextResponse.json({ error: 'Your cart is empty' }, { status: 400 });
        }
        if (examIds.length > 50) {
            return NextResponse.json({ error: 'Please check out at most 50 papers at a time' }, { status: 400 });
        }

        // --- Authoritative pricing ------------------------------------------
        const { data: papers, error: papersError } = await supabase
            .from('exams')
            .select('id, title, price_cents, currency, is_published, source')
            .in('id', examIds);

        if (papersError) return NextResponse.json({ error: papersError.message }, { status: 500 });

        const sellable = (papers || []).filter((p) => p.source === 'catalog' && p.is_published);
        if (sellable.length === 0) {
            return NextResponse.json({ error: 'None of these papers are available' }, { status: 400 });
        }

        // Drop anything the buyer already owns rather than charging twice.
        const { data: owned } = await supabase
            .from('entitlements')
            .select('exam_id')
            .eq('user_id', userId)
            .in(
                'exam_id',
                sellable.map((p) => p.id)
            );
        const ownedIds = new Set((owned || []).map((e) => e.exam_id as string));

        const items = sellable.filter((p) => !ownedIds.has(p.id));
        if (items.length === 0) {
            return NextResponse.json(
                { error: 'You already own every paper in this cart', alreadyOwned: true },
                { status: 400 }
            );
        }

        const subtotal = items.reduce((sum, p) => sum + (p.price_cents || 0), 0);
        const paidItems = items.filter((p) => p.price_cents > 0);
        const discount = bundleDiscount(paidItems.length, subtotal);
        const total = Math.max(0, subtotal - discount.amountCents);
        const currency = items[0].currency || 'KES';

        // --- Create the order ------------------------------------------------
        const reference = makeReference();
        const mpesaReady = Boolean(getMpesaConfig());
        const phone = phoneRaw ? normalisePhone(phoneRaw) : null;
        const provider: 'free' | 'mpesa' | 'manual' =
            total === 0 ? 'free' : mpesaReady && phone ? 'mpesa' : 'manual';

        if (total > 0 && mpesaReady && phoneRaw && !phone) {
            return NextResponse.json({ error: 'Enter a valid Safaricom number, e.g. 0712345678' }, { status: 400 });
        }

        const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert({
                reference,
                user_id: userId,
                status: 'pending',
                subtotal_cents: subtotal,
                discount_cents: discount.amountCents,
                total_cents: total,
                currency,
                provider,
                phone: phone ?? null,
            })
            .select()
            .single();

        if (orderError) {
            console.error('order insert failed:', orderError.message);
            return NextResponse.json({ error: orderError.message }, { status: 500 });
        }

        const { error: itemsError } = await supabase.from('order_items').insert(
            items.map((p) => ({
                order_id: order.id,
                exam_id: p.id,
                title: p.title,
                unit_price_cents: p.price_cents || 0,
            }))
        );
        if (itemsError) {
            console.error('order items insert failed:', itemsError.message);
            return NextResponse.json({ error: itemsError.message }, { status: 500 });
        }

        // --- Free orders unlock straight away --------------------------------
        // The database re-checks that every line really is free before granting.
        if (total === 0) {
            const { error: freeError } = await supabase.rpc('finalize_free_order', { p_order_id: order.id });
            if (freeError) {
                console.error('finalize_free_order failed:', freeError.message);
                return NextResponse.json({ error: freeError.message }, { status: 400 });
            }
            return NextResponse.json({
                order: { ...order, status: 'paid', items },
                granted: true,
                message: 'Added to your library — download any time.',
            });
        }

        // --- Paid orders: push to the phone when Daraja is wired up ----------
        if (provider === 'mpesa' && phone) {
            try {
                const push = await stkPush({
                    phone,
                    amountCents: total,
                    reference,
                    description: `${items.length} exam paper${items.length === 1 ? '' : 's'}`,
                });
                await supabase.rpc('attach_payment_attempt', {
                    p_order_id: order.id,
                    p_provider: 'mpesa',
                    p_request_id: push.checkoutRequestId,
                    p_receipt: null,
                    p_phone: phone,
                });

                // The CheckoutRequestID stays on the server. It is the handle the
                // callback settles an order by, and handing it to the browser
                // gave a buyer the one piece of a forged payment they could not
                // otherwise guess. Nothing on the client ever read it; only the
                // message meant for the buyer goes back.
                return NextResponse.json({
                    order: { ...order, status: 'awaiting_confirmation', items },
                    message: push.customerMessage,
                });
            } catch (pushError) {
                const message = pushError instanceof Error ? pushError.message : 'M-Pesa request failed';
                console.error('STK push failed:', message);
                // Fall back to manual payment rather than dead-ending the sale.
                return NextResponse.json({
                    order: { ...order, provider: 'manual', items },
                    fallback: 'manual',
                    message: `${message}. Pay to the paybill and enter your transaction code instead.`,
                });
            }
        }

        return NextResponse.json({
            order: { ...order, items },
            message: 'Pay to the paybill shown, then enter your M-Pesa transaction code.',
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        console.error('POST /api/orders error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/** GET /api/orders — the buyer's own order history. */
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

        const { data, error } = await supabase
            .from('orders')
            .select('*, order_items(*)')
            .eq('user_id', auth.user.id)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        const orders = (data || []).map((o) => ({ ...o, items: o.order_items, order_items: undefined }));
        return NextResponse.json({ orders });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * Selling a subscription.
 *
 * Structurally the same transaction as a paper sale — an order, a payment, then
 * the database grants what was bought — so it deliberately reuses the same
 * pieces rather than growing a parallel checkout. The implementation lives in
 * services/planOrders so the WhatsApp bot can create an identical order without
 * a user session; the only thing that differs is what gets granted on
 * confirmation, and that decision lives in SQL, in
 * `activate_subscription_for_order`, where a browser cannot reach it.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
async function planCheckout(supabase: any, userId: string, planSlug: string, phoneRaw: string) {
    const result = await createPlanOrder(supabase, userId, planSlug, phoneRaw, { channel: 'web' });

    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.error?.includes('not available') ? 400 : 500 });
    }

    return NextResponse.json({
        order: result.order,
        plan: result.plan,
        ...(result.stkSent ? {} : { fallback: 'manual' }),
        message: result.message,
    });
}

