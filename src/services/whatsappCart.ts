/**
 * THE CART, INSIDE THE CHAT — server only
 * ----------------------------------------------------------------------------
 * Adding papers, totalling them, and turning that into a paid order.
 *
 * This is the piece the bot was missing. Until now `offerPaper` ended at "Reply
 * PLAN to subscribe" or "Buy it on the website", so somebody who wanted one
 * KES 30 paper was either pushed into a browser or upsold a year's access.
 *
 * ONE ORDER SHAPE, NOT TWO
 *
 * Checkout writes an ordinary `orders` row with `channel = 'whatsapp'` plus
 * `order_items`, which is exactly what the website's cart produces. Everything
 * downstream then works untouched: `confirm_order_payment` already mints one
 * entitlement per item, `can_download_paper` already reads entitlements, and
 * `/library` already lists them. A chat purchase and a web purchase are the same
 * purchase, which is the only way the two can show the same history.
 *
 * PRICES ARE READ FROM THE DATABASE AT EVERY STEP
 *
 * The cart stores a price so the customer can be shown a total without a query,
 * but that stored figure is never what they are charged. Checkout re-reads every
 * paper and rebuilds the total from the row. A cart is session state, session
 * state is editable by anything that can write the session, and a price a
 * customer could influence is not a price.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { getMpesaConfig, normalisePhone, stkPush } from '@/lib/mpesa';
import { makeReference } from './planOrders';
import { formatPrice } from '@/lib/catalog';

/** Enough for a term's worth of papers; small enough that a total stays readable. */
const MAX_ITEMS = 20;

export interface CartItem {
    exam_id: string;
    title: string;
    price_cents: number;
}

export function cartTotal(cart: CartItem[]): number {
    return cart.reduce((sum, item) => sum + (Number(item.price_cents) || 0), 0);
}

/** Adding the same paper twice is a no-op, not a second charge. */
export function addToCart(cart: CartItem[], item: CartItem): CartItem[] {
    if (cart.some((c) => c.exam_id === item.exam_id)) return cart;
    return [...cart, item].slice(0, MAX_ITEMS);
}

export function removeFromCart(cart: CartItem[], examId: string): CartItem[] {
    return cart.filter((c) => c.exam_id !== examId);
}

/** How the cart reads in a chat message: one line each, then the total. */
export function describeCart(cart: CartItem[], currency = 'KES'): string {
    if (cart.length === 0) return 'Your list is empty.';

    const lines = cart.map(
        (item, i) => `${i + 1}. ${item.title} — ${formatPrice(item.price_cents, currency)}`
    );

    return [
        ...lines,
        '',
        `Total: ${formatPrice(cartTotal(cart), currency)} for ${cart.length} paper${cart.length === 1 ? '' : 's'}`,
    ].join('\n');
}

export interface CheckoutResult {
    ok: boolean;
    error?: string;
    orderId?: string;
    reference?: string;
    totalCents?: number;
    /** True when the M-Pesa prompt reached the handset. */
    stkSent?: boolean;
    /** Papers dropped at checkout, with the reason, so nobody is charged silently. */
    dropped?: { title: string; reason: string }[];
    /** Free or already-owned papers, which need no payment and are sent directly. */
    freeExamIds?: string[];
}

/**
 * Turns a cart into a paid order and pushes the M-Pesa prompt.
 *
 * Every paper is re-read and re-checked here, and that is the whole point of the
 * function. Between adding to the cart and paying, a paper can be unpublished,
 * repriced, or already bought in another conversation — and a customer charged
 * for any of those has a complaint nobody can answer.
 */
export async function checkout(
    admin: any,
    userId: string,
    phone: string,
    cart: CartItem[]
): Promise<CheckoutResult> {
    if (cart.length === 0) return { ok: false, error: 'Your list is empty.' };

    const ids = cart.map((c) => c.exam_id);

    const { data: papers, error } = await admin
        .from('exams')
        .select('id, title, price_cents, currency, is_published, source')
        .in('id', ids);

    if (error) {
        console.error('Cart checkout could not read papers:', error.message);
        return { ok: false, error: 'Could not check those papers. Try again in a moment.' };
    }

    const dropped: { title: string; reason: string }[] = [];
    const freeExamIds: string[] = [];
    const billable: { exam_id: string; title: string; price_cents: number }[] = [];

    for (const item of cart) {
        const paper = (papers ?? []).find((p: any) => p.id === item.exam_id);

        if (!paper || !paper.is_published || paper.source !== 'catalog') {
            dropped.push({ title: item.title, reason: 'no longer available' });
            continue;
        }

        // Bought since it went in the cart — in the shop, in another chat, or by
        // a subscription that started meanwhile. Charging again would be taking
        // money for something already owned.
        const { data: owned } = await admin.rpc('can_download_paper', {
            p_exam_id: paper.id,
            p_user_id: userId,
        });

        if (owned) {
            freeExamIds.push(paper.id);
            continue;
        }

        // The price from the row, never the one carried in the session.
        const price = Number(paper.price_cents) || 0;
        if (price === 0) {
            freeExamIds.push(paper.id);
            continue;
        }

        billable.push({ exam_id: paper.id, title: paper.title, price_cents: price });
    }

    // Nothing to pay for. A real outcome, not a failure: everything in the list
    // turned out to be free or already theirs.
    if (billable.length === 0) {
        return { ok: true, totalCents: 0, freeExamIds, dropped };
    }

    const total = billable.reduce((sum, item) => sum + item.price_cents, 0);
    const reference = makeReference();
    const normalised = normalisePhone(phone);
    const mpesaReady = Boolean(getMpesaConfig());
    const provider: 'mpesa' | 'manual' = mpesaReady && normalised ? 'mpesa' : 'manual';

    const { data: order, error: orderError } = await admin
        .from('orders')
        .insert({
            reference,
            user_id: userId,
            status: 'pending',
            subtotal_cents: total,
            discount_cents: 0,
            total_cents: total,
            currency: 'KES',
            provider,
            phone: normalised ?? null,
            // The two fields that let the payment callback find its way back to
            // a conversation.
            channel: 'whatsapp',
            wa_phone: phone,
        })
        .select('id, reference, total_cents')
        .single();

    if (orderError) {
        console.error('Cart checkout order insert failed:', orderError.message);
        return { ok: false, error: 'Could not start that order. Try again in a moment.' };
    }

    const { error: itemsError } = await admin.from('order_items').insert(
        billable.map((item) => ({
            order_id: order.id,
            exam_id: item.exam_id,
            title: item.title,
            unit_price_cents: item.price_cents,
        }))
    );

    if (itemsError) {
        // An order with no items would be paid for and deliver nothing, because
        // `confirm_order_payment` builds entitlements from exactly these rows.
        // Better to fail before any money moves.
        console.error('Cart checkout items insert failed:', itemsError.message);
        await admin.from('orders').update({ status: 'failed' }).eq('id', order.id);
        return { ok: false, error: 'Could not start that order. Try again in a moment.' };
    }

    if (provider === 'mpesa' && normalised) {
        try {
            const push = await stkPush({
                phone: normalised,
                amountCents: total,
                reference,
                description:
                    billable.length === 1 ? billable[0].title.slice(0, 60) : `${billable.length} exam papers`,
            });

            await admin.rpc('attach_payment_attempt', {
                p_order_id: order.id,
                p_provider: 'mpesa',
                p_request_id: push.checkoutRequestId,
                p_receipt: null,
                p_phone: normalised,
            });

            return {
                ok: true,
                orderId: order.id,
                reference: order.reference,
                totalCents: total,
                stkSent: true,
                dropped,
                freeExamIds,
            };
        } catch (pushError) {
            // A failed push is not a failed sale — the paybill still works, and
            // the order stands so the reference stays valid.
            console.error(
                'Cart STK push failed:',
                pushError instanceof Error ? pushError.message : pushError
            );
        }
    }

    return {
        ok: true,
        orderId: order.id,
        reference: order.reference,
        totalCents: total,
        stkSent: false,
        dropped,
        freeExamIds,
    };
}
