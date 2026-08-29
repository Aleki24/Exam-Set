import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { bundleDiscount } from '@/lib/catalog';
import { getMpesaConfig, normalisePhone, stkPush } from '@/lib/mpesa';
import { createPlanOrder, makeReference } from '@/services/planOrders';
import { createAdminClient } from '@/utils/supabase/admin';
import { findOrCreateBuyerForPhone } from '@/services/buyerAccounts';
import { ORDER_TOKEN_COOKIE, ORDER_TOKEN_TTL_MS, orderTokenSecret, signOrderToken } from '@/lib/orderAccess';

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

        const body = await req.json();
        const examIds: string[] = Array.from(new Set<string>(body.exam_ids || []));
        const phoneRaw: string = body.phone || '';
        const planSlug: string | null = body.plan_slug || null;

        /*
         * Buying without a sign-in page.
         *
         * A teacher who has decided to spend KES 30 should not first have to
         * decide on a password. Checkout used to answer them with a 401 and a
         * redirect to /auth/login, which is the moment most of them left — the
         * cart survived the trip, the intention did not.
         *
         * So the M-Pesa number they are about to pay with becomes their
         * account, created silently, shared with the WhatsApp bot so the same
         * number is the same customer in both places.
         *
         * What they do NOT get is a session. On WhatsApp a number is proven by
         * the message arriving from it; typed into a form it proves nothing, so
         * signing somebody in on the strength of it would let anyone empty a
         * returning buyer's library by typing their number. They get a signed
         * token for this one order instead — see lib/orderAccess.ts.
         */
        let userId = auth?.user?.id ?? null;
        let guestOrder = false;

        /*
         * A plan is the exception, and stays behind the sign-in it always had.
         *
         * Guest access is a signed token for one order, good for a week. A
         * subscription is a months-long relationship that has to be reachable
         * from a different phone, on a new device, after the cookie is long
         * gone — so an account is not friction here, it is the thing being
         * bought. Selling one to somebody with no way back in would take their
         * money for something they cannot keep.
         */
        if (planSlug && !userId) {
            return NextResponse.json(
                { error: 'Sign in to start a plan — it needs an account to live in.', requiresAuth: true },
                { status: 401 }
            );
        }

        if (!userId) {
            const guestPhone = phoneRaw ? normalisePhone(phoneRaw) : null;
            if (!guestPhone) {
                return NextResponse.json(
                    {
                        error: 'Enter the M-Pesa number you will pay with, e.g. 0712345678',
                        needsPhone: true,
                    },
                    { status: 400 }
                );
            }

            const admin = createAdminClient();
            if (!admin) {
                return NextResponse.json({ error: 'Sign in to check out' }, { status: 401 });
            }

            userId = await findOrCreateBuyerForPhone(admin, guestPhone, 'checkout');
            if (!userId) {
                return NextResponse.json({ error: 'Sign in to check out' }, { status: 401 });
            }
            guestOrder = true;
        }

        /*
         * Row level security keys the orders and entitlements tables to the
         * signed-in user, which a guest is not. Their order is written with the
         * service role instead — the same rows, the same columns, the same
         * `user_id`, just a client that RLS does not shut out.
         *
         * This widens nothing: `userId` above is the account for the number
         * being paid from, prices are still re-read from the database below,
         * and the guarded SQL functions still own every status transition. A
         * signed-in buyer keeps their own client and their own policies.
         */
        const db = guestOrder ? createAdminClient() : supabase;
        if (!db) return NextResponse.json({ error: 'Sign in to check out' }, { status: 401 });

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
        const { data: papers, error: papersError } = await db
            .from('exams')
            .select('id, title, price_cents, currency, is_published, source')
            .in('id', examIds);

        if (papersError) return NextResponse.json({ error: papersError.message }, { status: 500 });

        const sellable = (papers || []).filter((p) => p.source === 'catalog' && p.is_published);
        if (sellable.length === 0) {
            return NextResponse.json({ error: 'None of these papers are available' }, { status: 400 });
        }

        // Drop anything the buyer already owns rather than charging twice.
        const { data: owned } = await db
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

        /*
         * The guest's proof, attached to whatever this route answers with.
         *
         * httpOnly so no script on the page can read it, `lax` so it survives
         * the return trip from M-Pesa, and scoped to one order id — a buyer
         * with two orders holds two cookies and each opens only its own.
         *
         * Signing fails closed: with no secret configured there is no cookie,
         * the guest simply cannot download without signing in, and nothing is
         * handed out on the strength of an unsigned value.
         */
        const withGuestAccess = (res: NextResponse, orderId: string): NextResponse => {
            if (!guestOrder) return res;
            const secret = orderTokenSecret();
            if (!secret) {
                console.error('No ORDER_TOKEN_SECRET or service role key — guest cannot download.');
                return res;
            }
            res.cookies.set(ORDER_TOKEN_COOKIE, signOrderToken(orderId, secret), {
                httpOnly: true,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                path: '/',
                maxAge: Math.floor(ORDER_TOKEN_TTL_MS / 1000),
            });
            return res;
        };

        const { data: order, error: orderError } = await db
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

        const { error: itemsError } = await db.from('order_items').insert(
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
        /*
         * The shape the checkout page reads.
         *
         * `items` above are catalog rows, keyed `id`; the order detail route
         * returns real `order_items`, keyed `exam_id`. The page cannot render
         * two shapes, and a download button reading `exam_id` off a catalog row
         * silently asks for `undefined`. So the free path answers in the same
         * shape the polled path does.
         */
        const orderItems = items.map((p) => ({
            exam_id: p.id,
            title: p.title,
            unit_price_cents: p.price_cents || 0,
        }));

        if (total === 0) {
            const { error: freeError } = await db.rpc('finalize_free_order', { p_order_id: order.id });
            if (freeError) {
                console.error('finalize_free_order failed:', freeError.message);
                return NextResponse.json({ error: freeError.message }, { status: 400 });
            }
            return withGuestAccess(
                NextResponse.json({
                    order: { ...order, status: 'paid', items: orderItems },
                    granted: true,
                    guest: guestOrder,
                    message: guestOrder
                        ? 'Yours to download. Set a password to keep them in a library.'
                        : 'Added to your library — download any time.',
                }),
                order.id
            );
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
                await db.rpc('attach_payment_attempt', {
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
                return withGuestAccess(
                    NextResponse.json({
                        order: { ...order, status: 'awaiting_confirmation', items: orderItems },
                        guest: guestOrder,
                        message: push.customerMessage,
                    }),
                    order.id
                );
            } catch (pushError) {
                const message = pushError instanceof Error ? pushError.message : 'M-Pesa request failed';
                console.error('STK push failed:', message);
                // Fall back to manual payment rather than dead-ending the sale.
                return withGuestAccess(
                    NextResponse.json({
                        order: { ...order, provider: 'manual', items: orderItems },
                        fallback: 'manual',
                        guest: guestOrder,
                        message: `${message}. Pay to the paybill and enter your transaction code instead.`,
                    }),
                    order.id
                );
            }
        }

        return withGuestAccess(
            NextResponse.json({
                order: { ...order, items: orderItems },
                guest: guestOrder,
                message: 'Pay to the paybill shown, then enter your M-Pesa transaction code.',
            }),
            order.id
        );
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

