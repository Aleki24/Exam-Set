import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { requireAdmin } from '@/utils/auth/guards';
import { getWhatsAppConfig, sendText, windowIsOpen } from '@/lib/whatsapp';
import { cartTotal, type CartItem } from '@/services/whatsappCart';

/**
 * CONVERSATIONS WAITING FOR A PERSON
 * ----------------------------------------------------------------------------
 * GET  /api/admin/whatsapp   the queue
 * POST /api/admin/whatsapp   reply, or hand the conversation back to the bot
 *
 * When somebody asks for a human the bot flags the session and goes quiet. That
 * silence is the correct behaviour — nothing is worse than a bot talking over a
 * real conversation — but it is only defensible if a person actually sees the
 * flag. Without this route, "talk to a person" means "be ignored".
 *
 * TWO CLIENTS, ON PURPOSE
 *
 * `requireAdmin` runs against the caller's own session, so the permission check
 * is made against a real signed-in user under row level security. The reads then
 * use the service role, because `whatsapp_sessions` has RLS enabled with no
 * policies — deliberately, so no browser holding the publishable key can read
 * somebody's conversation. Checking first and escalating second is the order
 * that matters; escalating first would make the check decorative.
 *
 * WHAT IS NOT HERE
 *
 * Message history. Migration 020 stores message ids for idempotency and no
 * content at all, and that was a decision rather than an omission — a second
 * copy of people's messages is a liability with no use. So staff see who is
 * waiting, why, and for how long, and hold the actual conversation in WhatsApp.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET() {
    const supabase = await createClient();
    const { failure } = await requireAdmin(supabase);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 });

    const { data, error } = await admin
        .from('whatsapp_sessions')
        .select('phone, user_id, needs_human, human_since, human_reason, last_inbound_at, cart, state, muted')
        .eq('needs_human', true)
        // Longest wait first. A queue sorted by newest is a queue where the
        // person who has waited all morning is never reached.
        .order('human_since', { ascending: true })
        .limit(100);

    if (error) {
        console.error('GET /api/admin/whatsapp failed:', error.message);
        return NextResponse.json({ error: 'Could not load the queue' }, { status: 500 });
    }

    const conversations = (data ?? []).map((row: any) => {
        const cart: CartItem[] = Array.isArray(row.cart) ? row.cart : [];
        return {
            phone: row.phone,
            userId: row.user_id,
            since: row.human_since,
            reason: row.human_reason,
            lastInboundAt: row.last_inbound_at,
            state: row.state,
            muted: row.muted,
            cartCount: cart.length,
            cartTotalCents: cartTotal(cart),
            // Whether a free-form reply is even permitted. Staff need to know
            // before typing, not after Meta rejects it.
            canReply: windowIsOpen(row.last_inbound_at),
        };
    });

    return NextResponse.json({ conversations });
}

/**
 * POST { phone, action: 'reply' | 'resolve', body? }
 *
 * `resolve` puts the conversation back with the bot and tells the customer so —
 * a bot that silently starts answering again after a person was involved is
 * confusing, and a bot that never resumes is a number that stopped working.
 */
export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const { failure } = await requireAdmin(supabase);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 });

    const config = getWhatsAppConfig();

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 });
    }

    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const action = body.action;

    if (!phone) return NextResponse.json({ error: 'Missing phone' }, { status: 400 });
    if (action !== 'reply' && action !== 'resolve') {
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    const { data: session } = await admin
        .from('whatsapp_sessions')
        .select('phone, last_inbound_at, muted')
        .eq('phone', phone)
        .maybeSingle();

    if (!session) return NextResponse.json({ error: 'No such conversation' }, { status: 404 });

    if (action === 'reply') {
        const text = typeof body.body === 'string' ? body.body.trim() : '';
        if (!text) return NextResponse.json({ error: 'Write something to send' }, { status: 400 });
        if (text.length > 3000) {
            return NextResponse.json({ error: 'That is too long for one message' }, { status: 400 });
        }
        if (!config) {
            return NextResponse.json({ error: 'WhatsApp is not configured' }, { status: 503 });
        }
        if (session.muted) {
            // They sent STOP. Sending anyway would be exactly what STOP is for.
            return NextResponse.json(
                { error: 'This number asked us to stop messaging them.' },
                { status: 409 }
            );
        }
        if (!windowIsOpen(session.last_inbound_at)) {
            return NextResponse.json(
                {
                    error:
                        'It is more than 24 hours since they last wrote, so WhatsApp will not accept a reply. Call them instead.',
                },
                { status: 409 }
            );
        }

        try {
            await sendText(config, phone, text);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Send failed';
            console.error('Admin WhatsApp reply failed:', message);
            return NextResponse.json({ error: message }, { status: 502 });
        }

        // Still flagged. Answering a question is not the same as the
        // conversation being finished, and clearing the flag on the first reply
        // is how a half-handled customer disappears off the queue.
        return NextResponse.json({ ok: true });
    }

    const { error } = await admin
        .from('whatsapp_sessions')
        .update({
            needs_human: false,
            human_since: null,
            human_reason: null,
            state: 'idle',
            state_data: {},
            updated_at: new Date().toISOString(),
        })
        .eq('phone', phone);

    if (error) {
        console.error('Could not resolve a WhatsApp handoff:', error.message);
        return NextResponse.json({ error: 'Could not update that conversation' }, { status: 500 });
    }

    if (config && !session.muted && windowIsOpen(session.last_inbound_at)) {
        await sendText(
            config,
            phone,
            'I am back — send MENU for papers, or ask for a person again any time.'
        ).catch(() => {});
    }

    return NextResponse.json({ ok: true });
}
