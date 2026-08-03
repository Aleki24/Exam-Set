import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { deliverOrder } from '@/services/whatsappDelivery';

/**
 * POST /api/mpesa/callback — Daraja STK push result.
 *
 * This is the only place a paid entitlement is created. It runs with the
 * service role because Safaricom's callback carries no user session, and it
 * matches the callback back to an order by CheckoutRequestID rather than
 * trusting anything in the payload about who or what was bought.
 *
 * Safaricom expects a 200 with a ResultCode even for failures, otherwise it
 * retries the callback indefinitely.
 */
export async function POST(req: NextRequest) {
    const ack = NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });

    try {
        const payload = await req.json();
        const stk = payload?.Body?.stkCallback;
        if (!stk) {
            console.warn('M-Pesa callback with no stkCallback body');
            return ack;
        }

        const checkoutRequestId: string | undefined = stk.CheckoutRequestID;
        const resultCode = Number(stk.ResultCode);
        const resultDesc: string = stk.ResultDesc || '';

        if (!checkoutRequestId) {
            console.warn('M-Pesa callback with no CheckoutRequestID');
            return ack;
        }

        const admin = createAdminClient();
        if (!admin) {
            // Without the service key the callback cannot settle the order.
            // Log loudly: this is a misconfiguration, not a buyer error.
            console.error(
                'M-Pesa callback received but SUPABASE_SERVICE_ROLE_KEY is not set — order cannot be marked paid.'
            );
            return ack;
        }

        const { data: order } = await admin
            .from('orders')
            .select('id, status, total_cents, channel, wa_phone, plan_slug')
            .eq('provider_request_id', checkoutRequestId)
            .maybeSingle();

        if (!order) {
            console.warn('M-Pesa callback for unknown CheckoutRequestID:', checkoutRequestId);
            return ack;
        }
        if (order.status === 'paid') return ack; // Safaricom retries; stay idempotent.

        if (resultCode !== 0) {
            await admin.rpc('fail_order_payment', {
                p_order_id: order.id,
                p_reason: resultDesc || `ResultCode ${resultCode}`,
            });
            return ack;
        }

        // Pull the receipt and the amount actually paid out of the metadata.
        const metadata: { Name: string; Value?: string | number }[] = stk.CallbackMetadata?.Item || [];
        const valueOf = (name: string) => metadata.find((i) => i.Name === name)?.Value;
        const receipt = String(valueOf('MpesaReceiptNumber') ?? '');
        const amountPaidCents = Math.round(Number(valueOf('Amount') ?? 0) * 100);

        // Underpayment must never unlock the papers. The STK amount is rounded
        // up to the shilling at push time, so allow that one-shilling headroom.
        if (amountPaidCents + 100 < order.total_cents) {
            await admin.rpc('fail_order_payment', {
                p_order_id: order.id,
                p_reason: `Underpaid: received ${amountPaidCents} of ${order.total_cents} cents`,
            });
            return ack;
        }

        const { error } = await admin.rpc('confirm_order_payment', {
            p_order_id: order.id,
            p_receipt: receipt || null,
            p_payload: payload,
        });
        if (error) {
            console.error('confirm_order_payment failed:', error.message);
            return ack;
        }

        // An order bought over WhatsApp has to be delivered over WhatsApp. The
        // buyer never opened the website and has no reason to go looking in a
        // library they have not seen — from their side they paid and expect the
        // paper to arrive. Awaited rather than fired and forgotten, because the
        // function returns as soon as this handler does.
        //
        // `deliverOrder` reads `order_items`, which is where the truth about what
        // was bought lives. Its predecessor knew only about subscriptions and
        // sent a single paper remembered in the chat session — so a two-paper
        // order delivered one paper and the buyer was short-changed by a bug
        // that looked like a successful sale.
        if (order.channel === 'whatsapp' && order.wa_phone) {
            await deliverOrder(order.id).catch((deliveryError) =>
                // A delivery failure must not un-settle a payment that succeeded.
                console.error(
                    'WhatsApp delivery after payment failed:',
                    deliveryError instanceof Error ? deliveryError.message : deliveryError
                )
            );
        }

        return ack;
    } catch (err) {
        console.error('M-Pesa callback error:', err instanceof Error ? err.message : err);
        return ack;
    }
}
