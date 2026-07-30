import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireAdmin } from '@/utils/auth/guards';

/**
 * GET /api/admin/orders — the payment queue.
 *
 * Buyers who pay to the paybill submit their M-Pesa code; those orders sit in
 * `awaiting_confirmation` until an admin verifies the money arrived. Orders paid
 * through STK push settle themselves via the Daraja callback and only show up
 * here as history.
 */
export async function GET(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { failure } = await requireAdmin(supabase);
        if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

        const status = new URL(req.url).searchParams.get('status') || 'awaiting_confirmation';

        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        let query: any = supabase
            .from('orders')
            .select('*, order_items(id, exam_id, title, unit_price_cents)')
            .order('created_at', { ascending: false })
            .limit(100);

        if (status !== 'all') query = query.eq('status', status);

        const { data, error } = await query;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        const orders = (data || []).map((o: any) => ({ ...o, items: o.order_items, order_items: undefined }));

        const { data: summary } = await supabase.rpc('admin_sales_summary');

        return NextResponse.json({ orders, summary: Array.isArray(summary) ? summary[0] : summary });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * POST /api/admin/orders — confirm or reject a manual payment.
 * { order_id, action: 'confirm' | 'reject', receipt?, reason? }
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { failure } = await requireAdmin(supabase);
        if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

        const body = await req.json();
        if (!body.order_id) return NextResponse.json({ error: 'Missing order_id' }, { status: 400 });

        if (body.action === 'reject') {
            const { error } = await supabase.rpc('admin_reject_order', {
                p_order_id: body.order_id,
                p_reason: body.reason || 'Payment not found',
            });
            if (error) return NextResponse.json({ error: error.message }, { status: 400 });
            return NextResponse.json({ message: 'Order marked as failed' });
        }

        // Confirming grants the buyer their downloads, so it is deliberately the
        // only admin action that touches entitlements.
        const { error } = await supabase.rpc('admin_confirm_order', {
            p_order_id: body.order_id,
            p_receipt: body.receipt || null,
        });
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });

        return NextResponse.json({ message: 'Payment confirmed — the buyer can download now' });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
