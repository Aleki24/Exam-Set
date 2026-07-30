import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * GET /api/orders/:id — order status, polled by the checkout page while the
 * buyer completes the M-Pesa prompt on their phone.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const supabase = await createClient();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

        const { data, error } = await supabase
            .from('orders')
            .select('*, order_items(*)')
            .eq('id', id)
            .eq('user_id', auth.user.id)
            .maybeSingle();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        if (!data) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

        return NextResponse.json({
            order: { ...data, items: data.order_items, order_items: undefined },
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * POST /api/orders/:id — the buyer reports how they paid.
 *
 * Two shapes:
 *   { action: 'manual', receipt: 'SGH4X9ZQ12' }  paid to the paybill by hand
 *   { action: 'retry-stk', phone: '0712345678' } send the prompt again
 *
 * Neither grants anything. Both only move the order to
 * `awaiting_confirmation`; the money is verified out of band.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const supabase = await createClient();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

        const body = await req.json();
        const action = body.action === 'retry-stk' ? 'retry-stk' : 'manual';

        const { data: order } = await supabase
            .from('orders')
            .select('id, reference, total_cents, status')
            .eq('id', id)
            .eq('user_id', auth.user.id)
            .maybeSingle();

        if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        if (order.status === 'paid') {
            return NextResponse.json({ order, message: 'This order is already paid.' });
        }

        if (action === 'retry-stk') {
            const { normalisePhone, stkPush, getMpesaConfig } = await import('@/lib/mpesa');
            if (!getMpesaConfig()) {
                return NextResponse.json({ error: 'M-Pesa express is not configured' }, { status: 400 });
            }
            const phone = normalisePhone(body.phone || '');
            if (!phone) {
                return NextResponse.json({ error: 'Enter a valid Safaricom number' }, { status: 400 });
            }
            const push = await stkPush({
                phone,
                amountCents: order.total_cents,
                reference: order.reference,
                description: 'Exam papers',
            });
            const { error } = await supabase.rpc('attach_payment_attempt', {
                p_order_id: id,
                p_provider: 'mpesa',
                p_request_id: push.checkoutRequestId,
                p_receipt: null,
                p_phone: phone,
            });
            if (error) return NextResponse.json({ error: error.message }, { status: 400 });
            return NextResponse.json({ message: push.customerMessage });
        }

        // Manual: store the code the buyer typed and wait for confirmation.
        const receipt = String(body.receipt || '')
            .trim()
            .toUpperCase();
        if (!/^[A-Z0-9]{8,15}$/.test(receipt)) {
            return NextResponse.json(
                { error: 'That does not look like an M-Pesa code. It is 10 characters, e.g. SGH4X9ZQ12.' },
                { status: 400 }
            );
        }

        const { error } = await supabase.rpc('attach_payment_attempt', {
            p_order_id: id,
            p_provider: 'manual',
            p_request_id: null,
            p_receipt: receipt,
            p_phone: null,
        });
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });

        return NextResponse.json({
            message:
                'Thanks — we have your code. Your papers unlock as soon as the payment is verified, usually within a few minutes.',
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        console.error('POST /api/orders/[id] error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
