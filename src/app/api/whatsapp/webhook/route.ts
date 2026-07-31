import { NextRequest, NextResponse } from 'next/server';
import { extractMessages, getWhatsAppConfig, verifySignature } from '@/lib/whatsapp';
import { createAdminClient } from '@/utils/supabase/admin';
import { handleMessage } from '@/services/whatsappBot';

/**
 * WhatsApp webhook.
 *
 * This is a public endpoint that hands out paid PDFs on request, so it is
 * treated as hostile until proven otherwise: no signature, no service. Meta
 * signs every delivery with the app secret, and that check is the only thing
 * between the paper catalogue and anyone who guesses the URL.
 *
 * Meta retries until it receives a 200 and will redeliver messages it has
 * already sent, so every message id is recorded before it is acted on. Without
 * that, one slow reply becomes two copies of a paid paper — or two M-Pesa
 * prompts for the same subscription.
 */

export const dynamic = 'force-dynamic';

/**
 * GET — the subscription handshake. Meta calls this once when the webhook is
 * configured and expects the challenge echoed back as plain text.
 */
export async function GET(req: NextRequest) {
    const config = getWhatsAppConfig();
    if (!config) return NextResponse.json({ error: 'WhatsApp is not configured' }, { status: 503 });

    const params = req.nextUrl.searchParams;
    const mode = params.get('hub.mode');
    const token = params.get('hub.verify_token');
    const challenge = params.get('hub.challenge');

    if (mode === 'subscribe' && token === config.verifyToken && challenge) {
        return new NextResponse(challenge, {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
        });
    }

    return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

export async function POST(req: NextRequest) {
    const config = getWhatsAppConfig();
    if (!config) {
        console.error('WhatsApp webhook called but the bot is not configured.');
        // 200 so Meta does not retry a request that can never succeed.
        return NextResponse.json({ ok: true });
    }

    // The signature covers the exact bytes Meta sent. Parsing first and
    // re-serialising would produce a different digest and reject every request.
    const raw = await req.text();

    if (!verifySignature(raw, req.headers.get('x-hub-signature-256'), config.appSecret)) {
        console.warn('WhatsApp webhook: rejected a request with a bad signature');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    let payload: unknown;
    try {
        payload = JSON.parse(raw);
    } catch {
        return NextResponse.json({ error: 'Malformed payload' }, { status: 400 });
    }

    const messages = extractMessages(payload);
    if (messages.length === 0) {
        // Delivery and read receipts arrive on this same webhook. Acknowledge
        // and do nothing — answering them would reply to messages nobody sent.
        return NextResponse.json({ ok: true });
    }

    const admin = createAdminClient();
    if (!admin) {
        console.error('WhatsApp webhook received but SUPABASE_SERVICE_ROLE_KEY is not set.');
        return NextResponse.json({ ok: true });
    }

    for (const message of messages) {
        // Claim the message id first. The primary key makes this atomic, so a
        // duplicate delivery loses the race and is dropped rather than answered
        // twice.
        const { error } = await admin
            .from('whatsapp_messages')
            .insert({ message_id: message.id, phone: message.from });

        if (error) {
            // 23505 is unique_violation: already handled.
            if (error.code !== '23505') {
                console.error('Could not record a WhatsApp message id:', error.message);
            }
            continue;
        }

        await handleMessage(message);
    }

    return NextResponse.json({ ok: true });
}
