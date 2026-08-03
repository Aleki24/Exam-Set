/**
 * DELIVERING PAID PAPERS OVER WHATSAPP — server only
 * ----------------------------------------------------------------------------
 * Everything that sends a file after money has moved, plus the queue that keeps
 * a delivery alive when WhatsApp will not accept it yet.
 *
 * WHY THERE IS A QUEUE AT ALL
 *
 * WhatsApp accepts a free-form message only within 24 hours of the customer's
 * last one. Outside that, Meta rejects the send outright.
 *
 * Almost every purchase completes in seconds, well inside the window. But an
 * STK prompt left unanswered and paid the next morning, or a paybill payment
 * made hours later, confirms outside it — and a rejected send inside a payment
 * callback is a customer who has been charged, received nothing, and whose
 * failure is a line in a log nobody reads.
 *
 * So a delivery that cannot be sent is written to `whatsapp_outbox` and flushed
 * the moment that number messages again, which re-opens the window. Nothing is
 * attempted-and-lost. The alternative — a pre-approved template — needs the
 * business to create it in Meta Business Manager, so the hook is here and unused
 * until `WHATSAPP_TEMPLATE_DELIVERY` names one.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
    deliveryTemplateName,
    getWhatsAppConfig,
    sendDocument,
    sendTemplate,
    sendText,
    windowIsOpen,
    type WhatsAppConfig,
} from '@/lib/whatsapp';
import { createAdminClient } from '@/utils/supabase/admin';
import { signedDownloadUrl, storageUnavailableReason } from '@/utils/storage';
import { ensurePaperFile, paperFilename } from './paperFiles';
import { formatPrice } from '@/lib/catalog';

const PAPER_COLUMNS =
    'id, title, subject, grade_label, exam_type, term_slug, year, time_limit, institution, ' +
    'total_marks, question_count, question_ids, price_cents, currency, has_marking_scheme, ' +
    'pdf_storage_key, pdf_url, marking_scheme_storage_key, marking_scheme_url, is_published, source';

/**
 * A URL Meta can fetch.
 *
 * Meta collects the document from its own servers and cannot authenticate, so
 * the file has to be reachable by a plain HTTPS GET for a few seconds. A signed
 * storage link is exactly that, and it dies fifteen minutes later — long before
 * it could be forwarded usefully.
 *
 * Papers built in the setter have no file until one is rendered, so this goes
 * through the same `ensurePaperFile` path the website uses. The bot must not be
 * the reason a paper is undeliverable, and must not grow a second answer to
 * "where is the file".
 */
export async function deliverableUrl(
    admin: any,
    paper: any,
    asset: 'paper' | 'scheme'
): Promise<string | null> {
    const file = await ensurePaperFile(admin, paper, asset);

    if (file.directUrl) return file.directUrl;

    if (file.storageKey) {
        if (storageUnavailableReason()) {
            console.error('WhatsApp delivery blocked:', storageUnavailableReason());
            return null;
        }
        return signedDownloadUrl(file.storageKey, 900);
    }

    if (file.buffer) {
        console.error('Cannot deliver over WhatsApp without storage — Meta fetches the file by URL.');
        return null;
    }

    console.error('Paper has no deliverable file:', paper?.id, file.error);
    return null;
}

/**
 * Sends one paper, and its marking scheme when there is one.
 *
 * Returns false when nothing could be sent, so a caller counting successes is
 * not misled into telling somebody their papers have arrived.
 *
 * `alreadyPaid` decides only what the apology says, and it matters more than it
 * looks. The same failure means two different things: on a free paper or a
 * re-download, "nothing has been charged" is reassurance; on a paper somebody
 * just paid for it is false, and being told your money is safe when it has
 * already left your account is worse than being told nothing.
 */
export async function sendPaper(
    config: WhatsAppConfig,
    admin: any,
    phone: string,
    paper: any,
    alreadyPaid = false
): Promise<boolean> {
    const paperUrl = await deliverableUrl(admin, paper, 'paper');

    if (!paperUrl) {
        await sendText(
            config,
            phone,
            alreadyPaid
                ? `I could not attach "${paper.title}" yet. It is paid for and yours — I will send it as soon as I can.`
                : `I could not attach "${paper.title}". Nothing has been charged for it — reply MENU and I will help.`
        ).catch(() => {});
        return false;
    }

    await sendDocument(config, phone, paperUrl, paperFilename(paper, 'paper'), paper.title);

    if (paper.has_marking_scheme) {
        const schemeUrl = await deliverableUrl(admin, paper, 'scheme');
        if (schemeUrl) {
            await sendDocument(
                config,
                phone,
                schemeUrl,
                paperFilename(paper, 'scheme'),
                `Marking scheme — ${paper.title}`
            );
        }
    }

    // Counting a download must never be the reason a delivery fails.
    const { error } = await admin.rpc('increment_paper_download', { p_exam_id: paper.id });
    if (error) console.warn('download counter failed:', error.message);

    return true;
}

// ============================================================================
// THE OUTBOX
// ============================================================================

export async function queueDocument(
    admin: any,
    phone: string,
    examId: string,
    asset: 'paper' | 'scheme',
    orderId?: string | null
): Promise<void> {
    const { error } = await admin.from('whatsapp_outbox').insert({
        phone,
        kind: 'document',
        exam_id: examId,
        asset,
        order_id: orderId ?? null,
    });
    if (error) console.error('Could not queue a WhatsApp document:', error.message);
}

export async function queueText(
    admin: any,
    phone: string,
    body: string,
    orderId?: string | null
): Promise<void> {
    const { error } = await admin.from('whatsapp_outbox').insert({
        phone,
        kind: 'text',
        body,
        order_id: orderId ?? null,
    });
    if (error) console.error('Could not queue a WhatsApp message:', error.message);
}

/**
 * Sends everything waiting for one number.
 *
 * Called on every inbound message, because an inbound message is precisely what
 * re-opens the window. Cheap when the queue is empty, which is almost always.
 *
 * Failures leave the row unsent with the error recorded and the attempt counted,
 * so a paper that cannot be built does not vanish and does not retry for ever.
 */
export async function flushOutbox(config: WhatsAppConfig, admin: any, phone: string): Promise<number> {
    const { data: pending, error } = await admin
        .from('whatsapp_outbox')
        .select('id, kind, body, exam_id, asset, attempts')
        .eq('phone', phone)
        .is('sent_at', null)
        .lt('attempts', 5)
        .order('created_at', { ascending: true })
        .limit(20);

    if (error) {
        console.error('Could not read the WhatsApp outbox:', error.message);
        return 0;
    }
    if (!pending || pending.length === 0) return 0;

    let sent = 0;

    for (const row of pending) {
        try {
            if (row.kind === 'text') {
                await sendText(config, phone, row.body ?? '');
            } else {
                const { data: paper } = await admin
                    .from('exams')
                    .select(PAPER_COLUMNS)
                    .eq('id', row.exam_id)
                    .maybeSingle();

                if (!paper) throw new Error('paper no longer exists');

                const url = await deliverableUrl(admin, paper, row.asset ?? 'paper');
                if (!url) throw new Error('no deliverable file');

                await sendDocument(
                    config,
                    phone,
                    url,
                    paperFilename(paper, row.asset ?? 'paper'),
                    row.asset === 'scheme' ? `Marking scheme — ${paper.title}` : paper.title
                );
            }

            await admin
                .from('whatsapp_outbox')
                .update({ sent_at: new Date().toISOString() })
                .eq('id', row.id);
            sent++;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error('Outbox delivery failed:', message);
            await admin
                .from('whatsapp_outbox')
                .update({ attempts: (row.attempts ?? 0) + 1, last_error: message.slice(0, 500) })
                .eq('id', row.id);
        }
    }

    return sent;
}

// ============================================================================
// AFTER PAYMENT
// ============================================================================

/**
 * Delivers everything a paid order bought.
 *
 * Replaces the old `deliverAfterPayment`, which only understood subscriptions:
 * it sent one paper remembered in the session and nothing else, so a two-paper
 * order delivered one paper. This reads `order_items`, which is where the truth
 * about what was bought actually lives.
 *
 * Safe to call twice. Meta and Safaricom both retry, and the M-Pesa callback is
 * the one path where a duplicate means sending a second copy of something
 * already sent — so a delivery already recorded is skipped rather than repeated.
 */
export async function deliverOrder(orderId: string): Promise<void> {
    const config = getWhatsAppConfig();
    const admin = createAdminClient();
    if (!config || !admin) return;

    try {
        const { data: order } = await admin
            .from('orders')
            .select('id, reference, wa_phone, channel, total_cents, currency, plan_slug, status')
            .eq('id', orderId)
            .maybeSingle();

        if (!order || order.channel !== 'whatsapp' || !order.wa_phone) return;
        if (order.status !== 'paid') {
            console.warn(`deliverOrder called for order ${orderId} in status ${order.status}`);
            return;
        }

        const phone = order.wa_phone;

        // THE LOCK.
        //
        // Exactly one caller gets true. This used to be two heuristics — a
        // marker on the session and a count of outbox rows — and both were a
        // read followed by a write, which is precisely the shape that two
        // concurrent Safaricom retries slip through. Checking harder does not
        // make a check atomic; a primary key does. See migration 035.
        const { data: claimed, error: claimError } = await admin.rpc('claim_order_delivery', {
            p_order_id: orderId,
            p_phone: phone,
        });

        if (claimError) {
            // Fail closed. An unclaimable delivery is retried by Safaricom;
            // sending without the claim risks a second copy of every paper.
            console.error('Could not claim a delivery:', claimError.message);
            return;
        }
        if (!claimed) return;

        const { data: session } = await admin
            .from('whatsapp_sessions')
            .select('last_inbound_at')
            .eq('phone', phone)
            .maybeSingle();

        const open = windowIsOpen(session?.last_inbound_at);

        const { data: items } = await admin
            .from('order_items')
            .select('exam_id, title')
            .eq('order_id', orderId);

        const receipt = [
            `Paid — ${formatPrice(order.total_cents, order.currency || 'KES')}.`,
            `Reference ${order.reference}.`,
        ].join(' ');

        // A subscription order carries no items; a paper order carries one per
        // paper. Both are ordinary orders, which is why one function handles them.
        if (order.plan_slug && (!items || items.length === 0)) {
            const message = `${receipt}\n\nYour subscription is active — every paper on the site is yours. Send me what you need.`;
            if (open) await sendText(config, phone, message);
            else await queueText(admin, phone, message, orderId);
            await markDelivered(admin, phone, orderId, 0);
            return;
        }

        if (!items || items.length === 0) {
            // Nothing to send and nothing to subscribe to. The claim is handed
            // back rather than completed: this order is broken, and holding the
            // lock would stop a fixed one from ever being delivered.
            console.error(`Paid order ${orderId} has no items and no plan.`);
            await admin.rpc('release_order_delivery', { p_order_id: orderId });
            return;
        }

        if (!open) {
            // Outside the window. Everything is queued, in order, and the
            // customer gets it the moment they write again.
            await queueText(
                admin,
                phone,
                `${receipt}\n\nYour papers are ready — here they are.`,
                orderId
            );
            for (const item of items) {
                await queueDocument(admin, phone, item.exam_id, 'paper', orderId);
            }

            const template = deliveryTemplateName();
            if (template) {
                // A template is the only thing Meta accepts out here. Failure is
                // logged and swallowed: the outbox already holds the papers, so
                // a template that does not send costs a nudge, not the delivery.
                await sendTemplate(config, phone, template, [order.reference]).catch((err) =>
                    console.error('Delivery template failed:', err instanceof Error ? err.message : err)
                );
            }

            await markDelivered(admin, phone, orderId, items.length);
            return;
        }

        await sendText(
            config,
            phone,
            `${receipt}\n\nSending ${items.length} paper${items.length === 1 ? '' : 's'} now…`
        );

        let delivered = 0;
        for (const item of items) {
            const { data: paper } = await admin
                .from('exams')
                .select(PAPER_COLUMNS)
                .eq('id', item.exam_id)
                .maybeSingle();

            if (!paper) continue;
            if (await sendPaper(config, admin, phone, paper, true)) delivered++;
        }

        // Only claimed when something actually arrived. Saying "sent" after
        // sending nothing is the one message that would destroy trust outright.
        if (delivered > 0) {
            await sendText(
                config,
                phone,
                delivered === items.length
                    ? 'Your papers have been sent ✅\n\nThey are also in your library on the website. Send MENU for anything else.'
                    : `Sent ${delivered} of ${items.length}. I am looking into the rest — nothing extra has been charged.`
            );
        }

        if (delivered === 0) {
            // Charged, and nothing arrived. Queueing the papers turns a dead end
            // into a delayed delivery — the outbox flushes on their next message
            // — and the claim is released so a callback retry can try again
            // sooner. The customer is told the truth in the meantime.
            for (const item of items) {
                await queueDocument(admin, phone, item.exam_id, 'paper', orderId);
            }
            await sendText(
                config,
                phone,
                'Your payment went through, but I could not attach the files just yet. They are queued and I will send them shortly — reply HELP if nothing arrives.'
            ).catch(() => {});
            await admin.rpc('release_order_delivery', { p_order_id: orderId });
            return;
        }

        await markDelivered(admin, phone, orderId, delivered);
    } catch (err) {
        console.error('deliverOrder failed:', err instanceof Error ? err.message : err);
        // Hand the claim back. A delivery that threw halfway is worth retrying,
        // and holding the lock for ten minutes delays a paid customer for no
        // reason. Sending twice is a nuisance; sending never is a refund.
        await createAdminClient()
            ?.rpc('release_order_delivery', { p_order_id: orderId })
            .then(undefined, () => {});
    }
}

/**
 * Closes the claim, clears the cart the order came from, and puts the
 * conversation back at the top.
 */
async function markDelivered(
    admin: any,
    phone: string,
    orderId: string,
    papersSent: number
): Promise<void> {
    await admin.rpc('complete_order_delivery', { p_order_id: orderId, p_papers: papersSent });

    await admin
        .from('whatsapp_sessions')
        .update({
            cart: [],
            state: 'idle',
            state_data: {},
            updated_at: new Date().toISOString(),
        })
        .eq('phone', phone);
}
