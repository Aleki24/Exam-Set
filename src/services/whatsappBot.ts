/**
 * THE PAPER BOT
 * ----------------------------------------------------------------------------
 * "form 4 mathematics term 3" in, a PDF out.
 *
 * The whole point is that a teacher never has to browse, register or check out.
 * So the conversation holds as little state as it can get away with, and every
 * reply is either a paper, a short list to choose from, or one clear next step.
 *
 * Access is not decided here. `can_download_paper` in the database answers that
 * for the website and for this, so a paper that is locked in the shop is locked
 * in chat, and a subscription unlocks both at once.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
    getWhatsAppConfig,
    sendDocument,
    sendList,
    sendText,
    type WhatsAppConfig,
    type InboundMessage,
} from '@/lib/whatsapp';
import { createAdminClient } from '@/utils/supabase/admin';
import { normalisePhone } from '@/lib/mpesa';
import { formatPrice, examTypeName } from '@/lib/catalog';
import { stockedSets } from '@/lib/examSets';
import { durationLabel } from '@/lib/plans';
import { signedDownloadUrl, storageUnavailableReason } from '@/utils/storage';
import { ensurePaperFile, paperFilename } from './paperFiles';
import { describeQuery, parsePaperQuery } from './paperQuery';
import { findPapersRelaxing, stockedSubjects } from './paperSearch';
import { createPlanOrder } from './planOrders';

// How many messages one number may send per hour. Generous for a person,
// immediately obvious for a loop.
const RATE_LIMIT = 25;
const RATE_WINDOW_MS = 60 * 60 * 1000;

const HELP = [
    'Send me the paper you need and I will send the PDF.',
    '',
    'For example:',
    '• form 4 mathematics term 3',
    '• grade 9 integrated science end term 2',
    '• kcse biology past paper 2024',
    '',
    'Reply STOP at any time to stop messages.',
].join('\n');

// ============================================================================
// ENTRY POINT
// ============================================================================

/**
 * Handles one inbound message. Never throws: a webhook that fails loudly gets
 * retried by Meta, and a retry on a delivery path means a second copy of a paid
 * paper.
 */
export async function handleMessage(message: InboundMessage): Promise<void> {
    const config = getWhatsAppConfig();
    const admin = createAdminClient();

    if (!config || !admin) {
        console.error('WhatsApp message received but the bot is not configured.');
        return;
    }

    const phone = normalisePhone(message.from) ?? message.from;

    try {
        const session = await loadSession(admin, phone);

        if (session.muted && !/^\s*(start|unstop)\s*$/i.test(message.text)) return;

        if (await isRateLimited(admin, phone, session)) {
            await sendText(config, phone, 'That is a lot of messages at once. Try again in a little while.');
            return;
        }

        await route(config, admin, phone, message, session);
    } catch (err) {
        console.error('WhatsApp handler failed:', err instanceof Error ? err.message : err);
        // Silence is the worst outcome — it looks like the service is dead.
        await sendText(
            config,
            phone,
            'Something went wrong on our side. Please try again in a moment.'
        ).catch(() => {});
    }
}

// ============================================================================
// ROUTING
// ============================================================================

async function route(
    config: WhatsAppConfig,
    admin: any,
    phone: string,
    message: InboundMessage,
    session: any
): Promise<void> {
    const text = (message.text || '').trim();

    // A message with no text at all — an image, a voice note, a sticker.
    if (!text) {
        await sendText(config, phone, `I can only read text for now.\n\n${HELP}`);
        return;
    }

    const command = text.toUpperCase();

    if (command === 'STOP') {
        await admin.from('whatsapp_sessions').update({ muted: true, updated_at: new Date().toISOString() }).eq('phone', phone);
        await sendText(config, phone, 'Stopped. Send START whenever you want papers again.');
        return;
    }
    if (command === 'START' || command === 'UNSTOP') {
        await admin.from('whatsapp_sessions').update({ muted: false, updated_at: new Date().toISOString() }).eq('phone', phone);
        await sendText(config, phone, `Welcome back.\n\n${HELP}`);
        return;
    }
    if (command === 'HELP' || command === 'HI' || command === 'HELLO' || command === 'MENU') {
        await sendText(config, phone, HELP);
        return;
    }

    // Tapping a row in a list sends back the row id we set: "paper:<uuid>".
    if (text.startsWith('paper:')) {
        await deliverOrOffer(config, admin, phone, text.slice('paper:'.length), session);
        return;
    }

    // Choosing from a numbered list by typing the number.
    const choice = Number(text);
    const candidates: string[] = session.pending?.candidates ?? [];
    if (Number.isInteger(choice) && choice >= 1 && choice <= candidates.length) {
        await deliverOrOffer(config, admin, phone, candidates[choice - 1], session);
        return;
    }

    if (command === 'PLAN' || command === 'SUBSCRIBE' || text.startsWith('plan:')) {
        const slug = text.startsWith('plan:') ? text.slice('plan:'.length) : null;
        await startSubscription(config, admin, phone, session, slug);
        return;
    }

    await search(config, admin, phone, text);
}

// ============================================================================
// SEARCH
// ============================================================================

async function search(config: WhatsAppConfig, admin: any, phone: string, text: string): Promise<void> {
    const [subjects, sets] = await Promise.all([stockedSubjects(admin), stockedSets(admin)]);
    // The sets are what let "kabras mock end term 2" mean a school's sitting
    // rather than a mock, a term and a discarded word.
    const parsed = parsePaperQuery(text, subjects, sets);

    if (parsed.empty) {
        await sendText(config, phone, `I did not catch which paper you need.\n\n${HELP}`);
        return;
    }

    const { papers, relaxed } = await findPapersRelaxing(
        admin,
        {
            grade: parsed.grade,
            level: parsed.grade ? undefined : parsed.level,
            subject: parsed.subject,
            examType: parsed.examType,
            term: parsed.term,
            year: parsed.year,
            // Never relaxed away — see the comment on findPapersRelaxing.
            // Somebody who named a school and gets another school's paper has
            // been answered wrongly, not approximately.
            setIds: parsed.setIds,
        },
        10
    );

    if (papers.length === 0) {
        await sendText(
            config,
            phone,
            `I have nothing for ${describeQuery(parsed)} yet.\n\nTry a wider request — just the grade and subject, for example.`
        );
        return;
    }

    // Saying what was widened keeps the answer honest: somebody who asked for
    // 2025 should know they are being offered 2024.
    const note = relaxed.length > 0 ? `\n\nNothing exact, so I ignored the ${relaxed.join(' and ')}.` : '';

    if (papers.length === 1) {
        await rememberCandidates(admin, phone, [papers[0].id]);
        await offerPaper(config, admin, phone, papers[0], note);
        return;
    }

    await rememberCandidates(admin, phone, papers.map((p: any) => p.id));

    await sendList(
        config,
        phone,
        `${papers.length} papers for ${describeQuery(parsed)}.${note}\n\nPick one and I will send the PDF.`,
        'Choose a paper',
        papers.map((p: any) => ({
            id: `paper:${p.id}`,
            title: shortTitle(p),
            description: paperFacts(p),
        }))
    );
}

// ============================================================================
// DELIVERY
// ============================================================================

/** Sends the paper when they may have it, and offers a plan when they may not. */
async function deliverOrOffer(
    config: WhatsAppConfig,
    admin: any,
    phone: string,
    examId: string,
    session: any
): Promise<void> {
    const { data: paper } = await admin
        .from('exams')
        .select('id, title, subject, grade_label, exam_type, term_slug, year, time_limit, institution, total_marks, question_count, question_ids, price_cents, currency, has_marking_scheme, pdf_storage_key, pdf_url, marking_scheme_storage_key, marking_scheme_url, is_published, source')
        .eq('id', examId)
        .maybeSingle();

    if (!paper || paper.source !== 'catalog' || !paper.is_published) {
        await sendText(config, phone, 'I cannot find that paper any more. Send me the grade and subject again.');
        return;
    }

    const userId = await findOrCreateUserForPhone(admin, phone, session);
    if (!userId) {
        await sendText(config, phone, 'I could not set up your account. Please try again shortly.');
        return;
    }

    if (await mayDownload(admin, paper.id, userId)) {
        await sendPaper(config, admin, phone, paper);
        return;
    }

    await offerPaper(config, admin, phone, paper, '', { examId: paper.id });
}

/**
 * Actually sends the files.
 *
 * Meta fetches the link from its own servers, so a signed URL works and dies
 * fifteen minutes later — long before it could be forwarded usefully.
 */
async function sendPaper(config: WhatsAppConfig, admin: any, phone: string, paper: any): Promise<void> {
    const paperUrl = await deliverableUrl(admin, paper, 'paper');

    if (!paperUrl) {
        await sendText(
            config,
            phone,
            'That paper is not available as a file yet. I have flagged it — please try another.'
        );
        return;
    }

    await sendDocument(config, phone, paperUrl, paperFilename(paper, 'paper'), paper.title);

    if (paper.has_marking_scheme) {
        const schemeUrl = await deliverableUrl(admin, paper, 'scheme');
        if (schemeUrl) {
            await sendDocument(config, phone, schemeUrl, paperFilename(paper, 'scheme'), 'Marking scheme');
        }
    }

    // Counting downloads must never be the reason a delivery fails.
    const { error } = await admin.rpc('increment_paper_download', { p_exam_id: paper.id });
    if (error) console.warn('download counter failed:', error.message);
}

/**
 * A URL Meta can fetch.
 *
 * Papers built in the setter have no file until one is rendered, so this goes
 * through the same generate-and-store path the website uses — the bot must not
 * be the reason a paper is undeliverable, and it must not grow a second answer
 * to "where is the file".
 *
 * Streaming is not an option here: Meta collects the document from its own
 * servers and cannot authenticate, so without storage there is no link to give
 * it.
 */
async function deliverableUrl(admin: any, paper: any, asset: 'paper' | 'scheme'): Promise<string | null> {
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
        console.error('Cannot deliver over WhatsApp without storage configured — Meta fetches the file by URL.');
        return null;
    }

    console.error('Paper has no deliverable file:', paper.id, file.error);
    return null;
}

/**
 * The gate. Fails closed: if the check cannot be evaluated, nothing is sent.
 */
async function mayDownload(admin: any, examId: string, userId: string): Promise<boolean> {
    const { data, error } = await admin.rpc('can_download_paper', {
        p_exam_id: examId,
        p_user_id: userId,
    });

    if (error) {
        console.error('can_download_paper failed:', error.message);
        return false;
    }
    return Boolean(data);
}

// ============================================================================
// SELLING
// ============================================================================

/** Shows a paper they cannot yet open, and the plan that would open it. */
async function offerPaper(
    config: WhatsAppConfig,
    admin: any,
    phone: string,
    paper: any,
    note = '',
    pendingExtra: Record<string, unknown> = {}
): Promise<void> {
    const userId = await findOrCreateUserForPhone(admin, phone);

    // Free, owned, or covered by a live subscription — just send it.
    if (userId && (await mayDownload(admin, paper.id, userId))) {
        await sendPaper(config, admin, phone, paper);
        return;
    }

    const { data: plans } = await admin
        .from('subscription_plans')
        .select('slug, name, price_cents, currency, duration_days')
        .eq('is_active', true)
        .order('price_cents')
        .limit(1);

    const plan = plans?.[0];

    await rememberPending(admin, phone, { examId: paper.id, ...pendingExtra });

    if (!plan) {
        await sendText(
            config,
            phone,
            `${paper.title}\n${paperFacts(paper)}${note}\n\nThis one is ${formatPrice(paper.price_cents, paper.currency)}. Buy it on the website to download.`
        );
        return;
    }

    await sendText(
        config,
        phone,
        [
            paper.title,
            paperFacts(paper),
            note,
            '',
            `That paper is ${formatPrice(paper.price_cents, paper.currency)} on its own.`,
            `${formatPrice(plan.price_cents, plan.currency)} gets you every paper on the site for ${durationLabel(plan.duration_days)} — including this one.`,
            '',
            'Reply PLAN to subscribe by M-Pesa.',
        ]
            .filter(Boolean)
            .join('\n')
    );
}

/** Creates the order and pushes the M-Pesa prompt to the same number. */
async function startSubscription(
    config: WhatsAppConfig,
    admin: any,
    phone: string,
    session: any,
    slug: string | null
): Promise<void> {
    const userId = await findOrCreateUserForPhone(admin, phone, session);
    if (!userId) {
        await sendText(config, phone, 'I could not set up your account. Please try again shortly.');
        return;
    }

    let planSlug = slug;
    if (!planSlug) {
        const { data: plans } = await admin
            .from('subscription_plans')
            .select('slug')
            .eq('is_active', true)
            .order('price_cents')
            .limit(1);
        planSlug = plans?.[0]?.slug ?? null;
    }

    if (!planSlug) {
        await sendText(config, phone, 'No subscription is on sale at the moment.');
        return;
    }

    const result = await createPlanOrder(admin, userId, planSlug, phone, {
        channel: 'whatsapp',
        waPhone: phone,
    });

    if (!result.ok) {
        await sendText(config, phone, result.error ?? 'Could not start that subscription.');
        return;
    }

    if (result.stkSent) {
        await sendText(config, phone, 'Check your phone for the M-Pesa prompt and enter your PIN.');
        return;
    }

    // No Daraja credentials, or the push failed. The paybill still works.
    const paybill = process.env.NEXT_PUBLIC_MPESA_PAYBILL || process.env.NEXT_PUBLIC_MPESA_TILL;
    await sendText(
        config,
        phone,
        [
            paybill ? `Pay ${formatPrice(result.plan.price_cents, result.plan.currency)} to paybill ${paybill}` : 'To pay:',
            `Account number: ${result.order.reference}`,
            '',
            'Send me the M-Pesa code once you have paid and I will unlock your papers.',
        ].join('\n')
    );
}

/**
 * Called by the M-Pesa callback once a WhatsApp order is paid: confirms the
 * subscription and sends the paper they were waiting for.
 */
export async function deliverAfterPayment(phone: string, planName?: string): Promise<void> {
    const config = getWhatsAppConfig();
    const admin = createAdminClient();
    if (!config || !admin) return;

    try {
        const session = await loadSession(admin, phone);
        const examId: string | undefined = session.pending?.examId;

        await sendText(
            config,
            phone,
            planName ? `Payment received. ${planName} is active — every paper on the site is yours.` : 'Payment received.'
        );

        if (!examId) return;

        const { data: paper } = await admin
            .from('exams')
            .select('id, title, has_marking_scheme, pdf_storage_key, pdf_url, marking_scheme_storage_key, marking_scheme_url, subject, grade_label, exam_type, term_slug, year, time_limit, institution, total_marks, question_count, question_ids')
            .eq('id', examId)
            .maybeSingle();

        if (paper) await sendPaper(config, admin, phone, paper);

        await admin
            .from('whatsapp_sessions')
            .update({ pending: null, updated_at: new Date().toISOString() })
            .eq('phone', phone);
    } catch (err) {
        console.error('deliverAfterPayment failed:', err instanceof Error ? err.message : err);
    }
}

// ============================================================================
// IDENTITY
// ============================================================================

/**
 * The account behind a phone number, created on first contact if need be.
 *
 * Entitlements are per user, so the bot needs one to ask `can_download_paper`.
 * Creating it silently means a buyer's papers are waiting for them in /library
 * if they ever visit the website, rather than living in a parallel universe.
 */
async function findOrCreateUserForPhone(admin: any, phone: string, session?: any): Promise<string | null> {
    if (session?.user_id) return session.user_id;

    const { data: existing } = await admin
        .from('profiles')
        .select('id')
        .eq('phone', phone)
        .maybeSingle();

    if (existing?.id) {
        await admin.from('whatsapp_sessions').update({ user_id: existing.id }).eq('phone', phone);
        return existing.id;
    }

    const { data: created, error } = await admin.auth.admin.createUser({
        phone,
        phone_confirm: true,
        user_metadata: { source: 'whatsapp' },
    });

    if (error || !created?.user) {
        console.error('Could not create an account for a WhatsApp number:', error?.message);
        return null;
    }

    // The signup trigger writes the profile, phone included since migration 020.
    await admin.from('whatsapp_sessions').update({ user_id: created.user.id }).eq('phone', phone);
    return created.user.id;
}

// ============================================================================
// SESSION
// ============================================================================

async function loadSession(admin: any, phone: string): Promise<any> {
    const { data } = await admin.from('whatsapp_sessions').select('*').eq('phone', phone).maybeSingle();
    if (data) return data;

    const { data: created } = await admin
        .from('whatsapp_sessions')
        .insert({ phone })
        .select()
        .single();

    return created ?? { phone, pending: null, message_count: 0, window_start: new Date().toISOString(), muted: false };
}

async function rememberCandidates(admin: any, phone: string, ids: string[]): Promise<void> {
    await admin
        .from('whatsapp_sessions')
        .update({ pending: { candidates: ids }, updated_at: new Date().toISOString() })
        .eq('phone', phone);
}

async function rememberPending(admin: any, phone: string, pending: Record<string, unknown>): Promise<void> {
    await admin
        .from('whatsapp_sessions')
        .update({ pending, updated_at: new Date().toISOString() })
        .eq('phone', phone);
}

async function isRateLimited(admin: any, phone: string, session: any): Promise<boolean> {
    const windowStart = new Date(session.window_start ?? Date.now()).getTime();
    const expired = Date.now() - windowStart > RATE_WINDOW_MS;

    if (expired) {
        await admin
            .from('whatsapp_sessions')
            .update({ message_count: 1, window_start: new Date().toISOString() })
            .eq('phone', phone);
        return false;
    }

    const count = (session.message_count ?? 0) + 1;
    await admin.from('whatsapp_sessions').update({ message_count: count }).eq('phone', phone);

    return count > RATE_LIMIT;
}

// ============================================================================
// PRESENTATION
// ============================================================================

/**
 * Fits a list row: Meta truncates titles at 24 characters.
 *
 * The paper number is included because a sitting is where two rows most easily
 * become indistinguishable — "Form 4 Mathematics" twice, one of them Paper 1
 * and one of them Paper 2, with nothing on screen to tell them apart and a PDF
 * arriving either way.
 */
export function shortTitle(paper: any): string {
    const head = [paper.grade_label, paper.subject].filter(Boolean).join(' ') || paper.title || '';
    const suffix = paperNumberLabel(paper.paper_number);
    if (!suffix) return head;

    /*
     * The paper number is trimmed last, never first.
     *
     * Meta cuts a list title at 24 characters, and "Form 4 Integrated Science
     * P1" is 28 — so appending the number naively loses the number and leaves
     * two rows reading "Form 4 Integrated Scien…", which is the exact problem
     * the number was added to solve. Shortening the subject instead keeps the
     * one character pair that tells the rows apart.
     */
    const room = LIST_TITLE_LIMIT - suffix.length - 1;
    const fitted = head.length > room ? `${head.slice(0, room - 1).trimEnd()}…` : head;
    return `${fitted} ${suffix}`;
}

/** Meta's limit for a list row title. Enforced in lib/whatsapp.ts too. */
const LIST_TITLE_LIMIT = 24;

/** "Paper 1" -> "P1", so it survives the 24-character title limit. */
function paperNumberLabel(value?: string | null): string | null {
    if (!value) return null;
    const digits = /(\d+)/.exec(value)?.[1];
    return digits ? `P${digits}` : value.slice(0, 4);
}

export function paperFacts(paper: any): string {
    return [
        // The sitting first: in a list of one school's mock it is the only
        // thing that distinguishes these papers from any other school's, and
        // the description line is where there is room to say it.
        paper.exam_sets?.name ?? (paper.exam_type ? examTypeName(paper.exam_type) : null),
        paper.year ? String(paper.year) : null,
        paper.total_marks ? `${paper.total_marks} marks` : null,
        paper.has_marking_scheme ? '+ scheme' : null,
    ]
        .filter(Boolean)
        .join(' · ');
}
