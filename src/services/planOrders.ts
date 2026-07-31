/**
 * BUYING A SUBSCRIPTION
 * ----------------------------------------------------------------------------
 * Creating a plan order, independent of who is asking.
 *
 * The website calls it with a request-scoped client carrying the buyer's
 * session; the WhatsApp bot calls it with the service role, because a message
 * arriving from Meta has no session to speak of. Both produce the same order, so
 * a subscription bought in chat settles through exactly the same M-Pesa callback
 * and the same `activate_subscription_for_order` as one bought on the site.
 *
 * Pricing is read from `subscription_plans` in here and never accepted from the
 * caller — that is the whole reason this is one function rather than two.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { getMpesaConfig, normalisePhone, stkPush } from '@/lib/mpesa';

export interface PlanOrderResult {
    ok: boolean;
    error?: string;
    order?: any;
    plan?: any;
    /** True when an STK prompt was pushed to the buyer's phone. */
    stkSent?: boolean;
    /** What to tell the buyer next. */
    message?: string;
}

export interface PlanOrderOptions {
    /** Where the order came from. Decides how the paid paper gets delivered. */
    channel?: 'web' | 'whatsapp';
    /** The number to deliver to when the channel is whatsapp. */
    waPhone?: string;
}

export async function createPlanOrder(
    supabase: any,
    userId: string,
    planSlug: string,
    phoneRaw: string,
    options: PlanOrderOptions = {}
): Promise<PlanOrderResult> {
    const { data: plan, error: planError } = await supabase
        .from('subscription_plans')
        .select('slug, name, price_cents, currency, duration_days, is_active')
        .eq('slug', planSlug)
        .maybeSingle();

    if (planError) return { ok: false, error: planError.message };
    if (!plan || !plan.is_active) return { ok: false, error: 'That plan is not available' };

    const total = plan.price_cents;
    const reference = makeReference();
    const mpesaReady = Boolean(getMpesaConfig());
    const phone = phoneRaw ? normalisePhone(phoneRaw) : null;

    if (total > 0 && mpesaReady && phoneRaw && !phone) {
        return { ok: false, error: 'Enter a valid Safaricom number, e.g. 0712345678' };
    }

    const provider: 'mpesa' | 'manual' = mpesaReady && phone ? 'mpesa' : 'manual';

    const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
            reference,
            user_id: userId,
            status: 'pending',
            subtotal_cents: total,
            discount_cents: 0,
            total_cents: total,
            currency: plan.currency || 'KES',
            provider,
            phone: phone ?? null,
            plan_slug: plan.slug,
            channel: options.channel ?? 'web',
            wa_phone: options.waPhone ?? null,
        })
        .select()
        .single();

    if (orderError) {
        console.error('plan order insert failed:', orderError.message);
        return { ok: false, error: orderError.message };
    }

    if (provider === 'mpesa' && phone) {
        try {
            const push = await stkPush({
                phone,
                amountCents: total,
                reference,
                description: `${plan.name} subscription`,
            });

            await supabase.rpc('attach_payment_attempt', {
                p_order_id: order.id,
                p_provider: 'mpesa',
                p_request_id: push.checkoutRequestId,
                p_receipt: null,
                p_phone: phone,
            });

            return {
                ok: true,
                order: { ...order, status: 'awaiting_confirmation' },
                plan,
                stkSent: true,
                message: push.customerMessage,
            };
        } catch (pushError) {
            // A failed push is not a failed sale. The paybill route still works,
            // so the order stands and the buyer is told how to pay manually.
            const message = pushError instanceof Error ? pushError.message : 'M-Pesa request failed';
            console.error('STK push failed:', message);

            return {
                ok: true,
                order: { ...order, provider: 'manual' },
                plan,
                stkSent: false,
                message: `${message}. Pay to the paybill and enter your transaction code instead.`,
            };
        }
    }

    return {
        ok: true,
        order,
        plan,
        stkSent: false,
        message: 'Pay to the paybill shown, then enter your M-Pesa transaction code.',
    };
}

/** Short, human-readable, unguessable enough for an M-Pesa account reference. */
export function makeReference(): string {
    const stamp = Date.now().toString(36).toUpperCase().slice(-5);
    const rand = Math.random().toString(36).toUpperCase().slice(2, 6);
    return `EX${stamp}${rand}`;
}
