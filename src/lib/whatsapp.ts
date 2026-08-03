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

export interface ListSection {
    title: string;
    rows: ListRow[];
}

/**
 * An interactive list. Used when a query matches several papers, because asking
 * beats guessing when the wrong guess ends in the wrong PDF.
 *
 * Meta's limits are hard and exceeding any of them rejects the whole message —
 * not the offending row, the message — so they are enforced here rather than
 * trusted to the caller. Ten rows in total across all sections, 24-character
 * titles, 72-character descriptions, 20-character button.
 *
 * The ten-row ceiling counts the whole list, not each section, which is the
 * limit people trip over: two sections of eight is not sixteen rows, it is a
 * rejected message and a customer staring at nothing.
 */
export async function sendList(
    config: WhatsAppConfig,
    to: string,
    body: string,
    buttonText: string,
    rows: ListRow[],
    sectionTitle = 'Papers'
): Promise<void> {
    await sendSectionedList(config, to, body, buttonText, [{ title: sectionTitle, rows }]);
}

/** The same, grouped — a level list with its grades under headings, say. */
export async function sendSectionedList(
    config: WhatsAppConfig,
    to: string,
    body: string,
    buttonText: string,
    sections: ListSection[]
): Promise<void> {
    // Budget spent in order, so the first section keeps its rows and a trailing
    // one is what gets trimmed. Truncating the top of a list would drop exactly
    // the options a customer is most likely to want.
    let budget = 10;
    const trimmed: { title: string; rows: ListRow[] }[] = [];

    for (const section of sections) {
        if (budget <= 0) break;
        const take = section.rows.slice(0, budget);
        if (take.length === 0) continue;
        budget -= take.length;
        trimmed.push({ title: truncate(section.title, 24), rows: take });
    }

    if (trimmed.length === 0) {
        // Nothing to choose from. Sending an empty list is rejected by Meta, and
        // a caller that got here wanted to say something — so say it plainly.
        await sendText(config, to, body);
        return;
    }

    await send(config, {
        to,
        type: 'interactive',
        interactive: {
            type: 'list',
            body: { text: truncate(body, 1024) },
            action: {
                button: truncate(buttonText, 20),
                sections: trimmed.map((section) => ({
                    title: section.title,
                    rows: section.rows.map((row) => ({
                        id: row.id.slice(0, 200),
                        title: truncate(row.title, 24),
                        ...(row.description ? { description: truncate(row.description, 72) } : {}),
                    })),
                })),
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
// THE 24-HOUR WINDOW
// ============================================================================

/**
 * WhatsApp permits a free-form message only within 24 hours of the customer's
 * last one. Outside that, Meta accepts nothing but a pre-approved template.
 *
 * This is not a nicety that can be ignored and retried. A send outside the
 * window is rejected by the API, and if that send was a paid paper firing from
 * a payment callback, the customer has been charged and receives nothing — with
 * the failure buried in a log nobody reads.
 *
 * So every proactive send asks this first, and anything it refuses goes to
 * `whatsapp_outbox` instead of being attempted and lost.
 */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a free-form reply is allowed right now.
 *
 * A margin is subtracted rather than comparing exactly. A send that begins at
 * 23 hours 59 minutes may well arrive at Meta after the window shuts — the
 * request takes time, the callback that triggered it took time — and a delivery
 * that fails at the boundary is indistinguishable to the customer from one that
 * was never sent. Five minutes of caution costs a queued message; the absence of
 * it costs a paid paper.
 */
export function windowIsOpen(lastInboundAt?: string | Date | null, now = Date.now()): boolean {
    if (!lastInboundAt) return false;

    const last = lastInboundAt instanceof Date ? lastInboundAt.getTime() : Date.parse(lastInboundAt);
    if (!Number.isFinite(last)) return false;

    const MARGIN_MS = 5 * 60 * 1000;
    return now - last < SERVICE_WINDOW_MS - MARGIN_MS;
}

/**
 * Sends a pre-approved template.
 *
 * The only thing Meta accepts outside the service window. Templates are created
 * and approved by the business in Meta Business Manager — they cannot be
 * declared from code — so this takes a name and positional body parameters and
 * fails loudly if the name has not been configured.
 *
 * Until templates exist, `templateName` is undefined everywhere and the outbox
 * carries the message instead. That is deliberate: a queued delivery that
 * arrives when the customer next writes is honest, while a silently dropped one
 * is a customer who paid for nothing.
 */
export async function sendTemplate(
    config: WhatsAppConfig,
    to: string,
    templateName: string,
    bodyParams: string[] = [],
    languageCode = 'en'
): Promise<void> {
    await send(config, {
        to,
        type: 'template',
        template: {
            name: templateName,
            language: { code: languageCode },
            ...(bodyParams.length > 0
                ? {
                      components: [
                          {
                              type: 'body',
                              parameters: bodyParams.map((text) => ({
                                  type: 'text',
                                  text: truncate(text, 1024),
                              })),
                          },
                      ],
                  }
                : {}),
        },
    });
}

/**
 * The template that tells somebody their papers are ready, if one is configured.
 *
 * Returns null when it is not, which is the state on day one and the reason the
 * outbox exists.
 */
export function deliveryTemplateName(): string | null {
    return process.env.WHATSAPP_TEMPLATE_DELIVERY || null;
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

/** Keeps the filename readable in the recipient's downloads folder. */
function safeFilename(name: string): string {
    const cleaned = name
        .replace(/[^\w\s.-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 90)
        .replace(/^-|-$/g, '');

    const base = cleaned || 'exam-paper';
    return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}
