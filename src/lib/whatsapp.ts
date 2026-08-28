/**
 * WHATSAPP BUSINESS CLOUD API
 * ----------------------------------------------------------------------------
 * Server-only transport for the paper bot. Mirrors the shape of `lib/mpesa.ts`:
 * every credential comes from the environment, and `getWhatsAppConfig()` returns
 * null when they are absent so the rest of the app carries on without it.
 *
 * Meta fetches documents by URL from its own servers, which is why a paper can
 * be delivered as a signed storage link rather than uploaded — the link only has
 * to survive the few seconds Meta needs to collect it.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { formatByExtension } from '@/lib/uploadFormats';

const GRAPH_VERSION = 'v21.0';

export interface WhatsAppConfig {
    token: string;
    phoneNumberId: string;
    verifyToken: string;
    appSecret: string;
}

export function getWhatsAppConfig(): WhatsAppConfig | null {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
    const appSecret = process.env.WHATSAPP_APP_SECRET;

    if (!token || !phoneNumberId || !verifyToken || !appSecret) return null;

    return { token, phoneNumberId, verifyToken, appSecret };
}

/** Names the variables that are missing, for the health check. Never values. */
export function missingWhatsAppEnv(): string[] {
    return (
        [
            ['WHATSAPP_TOKEN', process.env.WHATSAPP_TOKEN],
            ['WHATSAPP_PHONE_NUMBER_ID', process.env.WHATSAPP_PHONE_NUMBER_ID],
            ['WHATSAPP_VERIFY_TOKEN', process.env.WHATSAPP_VERIFY_TOKEN],
            ['WHATSAPP_APP_SECRET', process.env.WHATSAPP_APP_SECRET],
        ] as const
    )
        .filter(([, value]) => !value)
        .map(([name]) => name);
}

// ============================================================================
// SIGNATURE
// ============================================================================

/**
 * Verifies Meta's `X-Hub-Signature-256` against the raw request body.
 *
 * This is the only thing standing between the webhook and anybody who guesses
 * the URL. The endpoint hands out paid PDFs on request, so an unsigned request
 * is treated as hostile, not as a mistake.
 *
 * The digest must be computed over the exact bytes Meta sent. Re-serialising the
 * parsed JSON will not reproduce them — key order and whitespace differ — so the
 * caller has to pass the raw text.
 */
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
    if (!header || !header.startsWith('sha256=')) return false;

    const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
    const received = header.slice('sha256='.length);

    // Both are fixed-length hex, but compare in constant time anyway: a timing
    // oracle on a signature check is a classic way to forge one.
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(received, 'utf8');
    if (a.length !== b.length) return false;

    return timingSafeEqual(a, b);
}

// ============================================================================
// SENDING
// ============================================================================

async function send(config: WhatsAppConfig, payload: Record<string, unknown>): Promise<void> {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${config.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${config.token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    });

    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`WhatsApp send failed (${res.status}): ${detail.slice(0, 300)}`);
    }
}

export async function sendText(config: WhatsAppConfig, to: string, body: string): Promise<void> {
    await send(config, {
        to,
        type: 'text',
        // Link previews add a large unwanted card to short replies.
        text: { preview_url: false, body: truncate(body, 4096) },
    });
}

/**
 * Sends a PDF. `link` must be publicly reachable over HTTPS — Meta collects it
 * server-side, so a signed storage URL works and expires long before it could
 * be shared usefully.
 */
export async function sendDocument(
    config: WhatsAppConfig,
    to: string,
    link: string,
    filename: string,
    caption?: string
): Promise<void> {
    await send(config, {
        to,
        type: 'document',
        document: {
            link,
            filename: safeFilename(filename),
            ...(caption ? { caption: truncate(caption, 1024) } : {}),
        },
    });
}

export interface ListRow {
    id: string;
    title: string;
    description?: string;
}

/**
 * An interactive list. Used when a query matches several papers, because asking
 * beats guessing when the wrong guess ends in the wrong PDF.
 *
 * Meta's limits are hard: ten rows, 24-character titles, 72-character
 * descriptions. Exceeding any of them rejects the whole message, so they are
 * enforced here rather than trusted to the caller.
 */
export async function sendList(
    config: WhatsAppConfig,
    to: string,
    body: string,
    buttonText: string,
    rows: ListRow[]
): Promise<void> {
    await send(config, {
        to,
        type: 'interactive',
        interactive: {
            type: 'list',
            body: { text: truncate(body, 1024) },
            action: {
                button: truncate(buttonText, 20),
                sections: [
                    {
                        title: 'Papers',
                        rows: rows.slice(0, 10).map((row) => ({
                            id: row.id.slice(0, 200),
                            title: truncate(row.title, 24),
                            ...(row.description ? { description: truncate(row.description, 72) } : {}),
                        })),
                    },
                ],
            },
        },
    });
}

/** Reply buttons, for a plain yes/no. Maximum three, 20 characters each. */
export async function sendButtons(
    config: WhatsAppConfig,
    to: string,
    body: string,
    buttons: { id: string; title: string }[]
): Promise<void> {
    await send(config, {
        to,
        type: 'interactive',
        interactive: {
            type: 'button',
            body: { text: truncate(body, 1024) },
            action: {
                buttons: buttons.slice(0, 3).map((b) => ({
                    type: 'reply',
                    reply: { id: b.id.slice(0, 256), title: truncate(b.title, 20) },
                })),
            },
        },
    });
}

/** Marks the incoming message as read, so the sender sees the blue ticks. */
export async function markRead(config: WhatsAppConfig, messageId: string): Promise<void> {
    await send(config, { status: 'read', message_id: messageId });
}

// ============================================================================
// INBOUND
// ============================================================================

export interface InboundMessage {
    /** Meta's message id. Used to discard retries. */
    id: string;
    /** Sender in international format without a plus, e.g. 254712345678. */
    from: string;
    /** Typed text, or the id of the list row / button they tapped. */
    text: string;
    /** True when this came from tapping an interactive reply rather than typing. */
    isInteractiveReply: boolean;
}

/**
 * Pulls the messages out of a webhook payload.
 *
 * Meta wraps everything in entry[].changes[].value, and the same envelope also
 * carries delivery receipts and read receipts, which must be ignored — treating
 * a "delivered" status as a request would answer messages nobody sent.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function extractMessages(payload: any): InboundMessage[] {
    const out: InboundMessage[] = [];

    for (const entry of payload?.entry ?? []) {
        for (const change of entry?.changes ?? []) {
            for (const message of change?.value?.messages ?? []) {
                const from = message?.from;
                const id = message?.id;
                if (!from || !id) continue;

                if (message.type === 'text') {
                    out.push({ id, from, text: message.text?.body ?? '', isInteractiveReply: false });
                    continue;
                }

                if (message.type === 'interactive') {
                    const reply = message.interactive?.list_reply ?? message.interactive?.button_reply;
                    if (reply?.id) {
                        out.push({ id, from, text: reply.id, isInteractiveReply: true });
                    }
                    continue;
                }

                // Images, audio, location and the rest. Recorded so the sender
                // gets an answer rather than silence.
                out.push({ id, from, text: '', isInteractiveReply: false });
            }
        }
    }

    return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ============================================================================
// HELPERS
// ============================================================================

function truncate(value: string, max: number): string {
    return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/**
 * Keeps the filename readable in the recipient's downloads folder.
 *
 * An extension the shop actually stores is left alone. Forcing `.pdf` onto
 * everything used to be harmless when everything was a PDF; now it would hand a
 * teacher a Word document that WhatsApp shows as a PDF and no app will open.
 */
function safeFilename(name: string): string {
    const cleaned = name
        .replace(/[^\w\s.-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 90)
        .replace(/^-|-$/g, '');

    const base = cleaned || 'exam-paper';
    return formatByExtension(base) ? base : `${base}.pdf`;
}
