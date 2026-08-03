/**
 * THE PAPER BOT
 * ----------------------------------------------------------------------------
 * A whole shop inside a chat: find a paper, add it to a list, pay by M-Pesa,
 * receive the PDF — without leaving WhatsApp.
 *
 * WHAT CHANGED, AND WHY IT MATTERED
 *
 * The bot could always find a paper and send one somebody already owned. What it
 * could not do was sell one: an unowned paper ended at "Reply PLAN to subscribe"
 * or "Buy it on the website", so a customer who wanted a single KES 30 paper was
 * pushed into a browser or upsold a year's access. That is the gap this file now
 * closes.
 *
 * ONE SHOP, NOT TWO
 *
 * Nothing here decides who may have what. `can_download_paper` answers that for
 * the website and for this, so a paper locked in the shop is locked in chat and a
 * subscription unlocks both at once. Checkout writes an ordinary `orders` row
 * with `channel = 'whatsapp'`, so a chat purchase and a web purchase are the same
 * purchase and show the same history in both places.
 *
 * FAST PATH FIRST
 *
 * Somebody who types "form 4 biology 2025" on their first message never sees a
 * menu. The menu exists for people who do not know what to ask for, and the
 * typed path stays the shortest one.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
    getWhatsAppConfig,
    sendButtons,
    sendList,
    sendSectionedList,
    sendText,
    windowIsOpen,
    type WhatsAppConfig,
    type InboundMessage,
} from '@/lib/whatsapp';
import { createAdminClient } from '@/utils/supabase/admin';
import { normalisePhone } from '@/lib/mpesa';
import { formatPrice, examTypeName, LEVELS } from '@/lib/catalog';
import { subjectsForLevel } from '@/lib/resources';
import { durationLabel } from '@/lib/plans';
import { describeQuery, parsePaperQuery } from './paperQuery';
import { findPapersRelaxing, stockedSubjects } from './paperSearch';
import { createPlanOrder } from './planOrders';
import {
    addToCart,
    cartTotal,
    checkout,
    describeCart,
    type CartItem,
} from './whatsappCart';
import { deliverOrder, flushOutbox, sendPaper } from './whatsappDelivery';

// How many messages one number may send per hour. Generous for a person,
// immediately obvious for a loop. Raised from 25 because browsing a menu costs
// several taps and a shopper should not be throttled for using the shop.
const RATE_LIMIT = 40;
const RATE_WINDOW_MS = 60 * 60 * 1000;

const PAPER_COLUMNS =
    'id, title, subject, grade_label, level_slug, exam_type, term_slug, year, time_limit, ' +
    'institution, total_marks, question_count, question_ids, price_cents, currency, ' +
    'has_marking_scheme, pdf_storage_key, pdf_url, marking_scheme_storage_key, ' +
    'marking_scheme_url, is_published, source';

const SITE = process.env.NEXT_PUBLIC_BASE_URL || 'https://exam-set-v8vu.vercel.app';

const HELP = [
    'Tell me the paper you need and I will send the PDF.',
    '',
    'For example:',
    '• form 4 mathematics term 3',
    '• grade 9 integrated science end term 2',
    '• kcse biology past paper 2024',
    '',
    'Or send MENU to browse. STOP to stop messages.',
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

        // The inbound message itself re-opens the 24-hour window, so this is
        // recorded before anything else and is what lets a queued delivery go
        // out below.
        await touchInbound(admin, phone);

        if (session.muted && !/^\s*(start|unstop)\s*$/i.test(message.text)) return;

        // Anything that could not be sent earlier goes now. Cheap when the queue
        // is empty, which is almost always.
        await flushOutbox(config, admin, phone).catch((err) =>
            console.error('Outbox flush failed:', err instanceof Error ? err.message : err)
        );

        // A human has taken this conversation. The bot staying quiet is the
        // whole point — nothing is worse than a bot talking over a real person.
        if (session.needs_human && !isReleaseCommand(message.text)) return;

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

    if (!text) {
        await sendText(config, phone, `I can only read text for now.\n\n${HELP}`);
        return;
    }

    const command = text.toUpperCase();

    // ---- Always available, whatever the conversation is doing ----

    if (command === 'STOP') {
        await setSession(admin, phone, { muted: true });
        await sendText(config, phone, 'Stopped. Send START whenever you want papers again.');
        return;
    }
    if (command === 'START' || command === 'UNSTOP') {
        await setSession(admin, phone, { muted: false, needs_human: false, state: 'idle' });
        await sendMenu(config, phone, 'Welcome back.');
        return;
    }
    if (['MENU', 'HI', 'HELLO', 'HEY', 'HABARI'].includes(command)) {
        await setSession(admin, phone, { state: 'idle', state_data: {} });
        await sendMenu(config, phone);
        return;
    }
    if (command === 'HELP') {
        await sendText(config, phone, HELP);
        return;
    }

    // ---- Interactive replies and typed shortcuts ----

    if (text.startsWith('menu:')) {
        await handleMenuChoice(config, admin, phone, text.slice('menu:'.length), session);
        return;
    }
    if (text.startsWith('level:')) {
        await showSubjects(config, admin, phone, text.slice('level:'.length));
        return;
    }
    if (text.startsWith('subject:')) {
        const [level, ...rest] = text.slice('subject:'.length).split('|');
        await showPapers(config, admin, phone, level, rest.join('|'));
        return;
    }
    if (text.startsWith('paper:')) {
        await showPaper(config, admin, phone, text.slice('paper:'.length), session);
        return;
    }
    if (text.startsWith('add:')) {
        await addPaper(config, admin, phone, text.slice('add:'.length), session);
        return;
    }
    if (text.startsWith('now:')) {
        await buyOne(config, admin, phone, text.slice('now:'.length), session);
        return;
    }
    if (text.startsWith('resend:')) {
        await resendPaper(config, admin, phone, text.slice('resend:'.length));
        return;
    }
    if (text.startsWith('plan:') || command === 'PLAN' || command === 'SUBSCRIBE') {
        const slug = text.startsWith('plan:') ? text.slice('plan:'.length) : null;
        await startSubscription(config, admin, phone, session, slug);
        return;
    }

    if (['CART', 'LIST', 'BASKET'].includes(command)) {
        await showCart(config, admin, phone, session);
        return;
    }
    if (['CHECKOUT', 'PAY', 'BUY', 'CONFIRM'].includes(command)) {
        await startCheckout(config, admin, phone, session);
        return;
    }
    if (command === 'CLEAR' || command === 'EMPTY' || command === 'CANCEL') {
        await setSession(admin, phone, { cart: [], state: 'idle' });
        await sendText(config, phone, 'List cleared. Send MENU to start again.');
        return;
    }
    if (['MY PAPERS', 'MY ORDERS', 'MYPAPERS', 'ORDERS', 'LIBRARY'].includes(command)) {
        await showMyPapers(config, admin, phone, session);
        return;
    }
    if (isHumanRequest(command)) {
        await handOff(config, admin, phone, 'asked for a person');
        return;
    }

    // A six-character link code from the website.
    //
    // Tried in any state, not only after LINK. The account page shows a code and
    // an "Open WhatsApp" button that pre-fills it, so the very common path is a
    // code arriving as the first thing this number ever says — and requiring the
    // word LINK first would reject it.
    //
    // Only a code that matches a live row is treated as one. Anything else falls
    // straight through to the search, so "MATHS1" is still a search for maths
    // paper 1 rather than a failed link attempt. After LINK, though, a
    // six-character message is unambiguously meant to be a code, and silence
    // about a bad one would be worse than saying so.
    if (/^[A-Z0-9]{6}$/.test(command)) {
        const handled = await redeemLinkCode(
            config,
            admin,
            phone,
            command,
            session.state === 'awaiting_link_code'
        );
        if (handled) return;
    }
    if (command === 'LINK') {
        await setSession(admin, phone, { state: 'awaiting_link_code' });
        await sendText(
            config,
            phone,
            [
                'To join this number to your website account:',
                '',
                `1. Open ${SITE}/account and sign in`,
                '2. Tap "Link WhatsApp" for a 6-character code',
                '3. Send me that code',
                '',
                'Your papers will then be in the same place wherever you look.',
            ].join('\n')
        );
        return;
    }

    // Choosing from a list by typing its number.
    const choice = Number(text);
    const candidates: string[] = session.state_data?.candidates ?? session.pending?.candidates ?? [];
    if (Number.isInteger(choice) && choice >= 1 && choice <= candidates.length) {
        await showPaper(config, admin, phone, candidates[choice - 1], session);
        return;
    }

    await search(config, admin, phone, text, session);
}

/** Words people actually use when they want a person. */
function isHumanRequest(command: string): boolean {
    return [
        'HUMAN', 'AGENT', 'SUPPORT', 'TALK TO A PERSON', 'TALK TO HUMAN',
        'CUSTOMER CARE', 'COMPLAIN', 'COMPLAINT', 'REFUND',
    ].includes(command);
}

function isReleaseCommand(text: string): boolean {
    return /^\s*(stop|start|unstop)\s*$/i.test(text);
}

// ============================================================================
// MENU
// ============================================================================

async function sendMenu(config: WhatsAppConfig, phone: string, greeting?: string): Promise<void> {
    await sendSectionedList(
        config,
        phone,
        [
            greeting ?? 'Skulbase Exams 👋',
            'Every paper and marking scheme, Playgroup to Form 4.',
            '',
            'What would you like to do?',
        ].join('\n'),
        'Choose',
        [
            {
                title: 'Find papers',
                rows: [
                    { id: 'menu:browse', title: 'Browse by level', description: 'Playgroup to Form 4' },
                    { id: 'menu:search', title: 'Search', description: 'Type the subject and class' },
                ],
            },
            {
                title: 'Your account',
                rows: [
                    { id: 'menu:papers', title: 'My papers', description: 'Everything you have bought' },
                    { id: 'menu:cart', title: 'My list', description: 'What you are about to buy' },
                ],
            },
            {
                title: 'More',
                rows: [
                    { id: 'menu:set', title: 'Set your own exam', description: 'Build a paper on the website' },
                    { id: 'menu:human', title: 'Talk to a person', description: 'A human will reply' },
                ],
            },
        ]
    );
}

async function handleMenuChoice(
    config: WhatsAppConfig,
    admin: any,
    phone: string,
    choice: string,
    session: any
): Promise<void> {
    switch (choice) {
        case 'browse':
            await showLevels(config, admin, phone);
            return;
        case 'search':
            await sendText(config, phone, HELP);
            return;
        case 'papers':
            await showMyPapers(config, admin, phone, session);
            return;
        case 'cart':
            await showCart(config, admin, phone, session);
            return;
        case 'set':
            await sendText(
                config,
                phone,
                [
                    'Build your own paper from the question bank:',
                    '',
                    `${SITE}/set`,
                    '',
                    'Pick the questions, and it becomes a printable PDF with a marking scheme.',
                ].join('\n')
            );
            return;
        case 'human':
            await handOff(config, admin, phone, 'chose "talk to a person"');
            return;
        default:
            await sendMenu(config, phone);
    }
}

// ============================================================================
// BROWSING
// ============================================================================

async function showLevels(config: WhatsAppConfig, admin: any, phone: string): Promise<void> {
    await setSession(admin, phone, { state: 'browsing_level' });

    // Only levels that actually have stock. Offering an empty shelf and then
    // saying "nothing here" wastes two messages and reads as a broken catalogue.
    const { data: rows } = await admin
        .from('exams')
        .select('level_slug')
        .eq('source', 'catalog')
        .eq('is_published', true)
        .not('level_slug', 'is', null);

    const stocked = new Set((rows ?? []).map((r: any) => r.level_slug));
    const levels = LEVELS.filter((l) => stocked.has(l.slug));

    if (levels.length === 0) {
        await sendText(config, phone, 'Nothing is stocked yet. Try again soon, or send MENU.');
        return;
    }

    await sendList(
        config,
        phone,
        'Which class?',
        'Choose a level',
        levels.map((level) => ({
            id: `level:${level.slug}`,
            title: level.name,
            description: level.short,
        })),
        'Levels'
    );
}

async function showSubjects(
    config: WhatsAppConfig,
    admin: any,
    phone: string,
    levelSlug: string
): Promise<void> {
    await setSession(admin, phone, { state: 'browsing_subject', state_data: { level: levelSlug } });

    const { data: rows } = await admin
        .from('exams')
        .select('subject')
        .eq('source', 'catalog')
        .eq('is_published', true)
        .eq('level_slug', levelSlug)
        .not('subject', 'is', null);

    const stocked = [...new Set((rows ?? []).map((r: any) => r.subject))].filter(Boolean) as string[];

    if (stocked.length === 0) {
        await sendText(config, phone, 'Nothing stocked for that level yet. Send MENU to try another.');
        return;
    }

    // Curriculum order where we know it, so the list reads like a timetable
    // rather than like whatever came back from the database first.
    const curriculum = subjectsForLevel(levelSlug as any).map((s) => s.name);
    const ordered = [
        ...curriculum.filter((name) => stocked.includes(name)),
        ...stocked.filter((name) => !curriculum.includes(name)),
    ];

    await sendList(
        config,
        phone,
        'Which subject?',
        'Choose a subject',
        ordered.slice(0, 10).map((subject) => ({
            id: `subject:${levelSlug}|${subject}`.slice(0, 200),
            title: subject,
        })),
        'Subjects'
    );
}

async function showPapers(
    config: WhatsAppConfig,
    admin: any,
    phone: string,
    levelSlug: string,
    subject: string
): Promise<void> {
    const { data: papers } = await admin
        .from('exams')
        .select(PAPER_COLUMNS)
        .eq('source', 'catalog')
        .eq('is_published', true)
        .eq('level_slug', levelSlug)
        .eq('subject', subject)
        .order('year', { ascending: false, nullsFirst: false })
        .limit(10);

    if (!papers || papers.length === 0) {
        await sendText(config, phone, `Nothing for ${subject} yet. Send MENU to try another.`);
        return;
    }

    await setSession(admin, phone, {
        state: 'browsing_papers',
        state_data: { level: levelSlug, subject, candidates: papers.map((p: any) => p.id) },
    });

    await sendList(
        config,
        phone,
        `${papers.length} ${subject} paper${papers.length === 1 ? '' : 's'}. Pick one.`,
        'Choose a paper',
        papers.map((p: any) => ({
            id: `paper:${p.id}`,
            title: shortTitle(p),
            description: paperFacts(p),
        }))
    );
}

// ============================================================================
// SEARCH
// ============================================================================

async function search(
    config: WhatsAppConfig,
    admin: any,
    phone: string,
    text: string,
    session: any
): Promise<void> {
    const subjects = await stockedSubjects(admin);
    const parsed = parsePaperQuery(text, subjects);

    if (parsed.empty) {
        // Repeated misses mean the bot is not helping. Rather than looping the
        // same message a third time, hand over to somebody who can.
        const misses = Number(session.state_data?.misses ?? 0) + 1;
        if (misses >= 3) {
            await handOff(config, admin, phone, 'three searches I could not understand');
            return;
        }
        await setSession(admin, phone, { state_data: { ...session.state_data, misses } });
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
        },
        10
    );

    if (papers.length === 0) {
        await sendText(
            config,
            phone,
            `I have nothing for ${describeQuery(parsed)} yet.\n\nTry a wider request — just the class and subject — or send MENU to browse.`
        );
        return;
    }

    // Saying what was widened keeps the answer honest: somebody who asked for
    // 2025 should know they are being offered 2024.
    const note = relaxed.length > 0 ? `\n\nNothing exact, so I ignored the ${relaxed.join(' and ')}.` : '';

    if (papers.length === 1) {
        await setSession(admin, phone, { state_data: { candidates: [papers[0].id], misses: 0 } });
        await presentPaper(config, admin, phone, papers[0], note, session);
        return;
    }

    await setSession(admin, phone, {
        state: 'browsing_papers',
        state_data: { candidates: papers.map((p: any) => p.id), misses: 0 },
    });

    await sendList(
        config,
        phone,
        `${papers.length} papers for ${describeQuery(parsed)}.${note}\n\nPick one.`,
        'Choose a paper',
        papers.map((p: any) => ({
            id: `paper:${p.id}`,
            title: shortTitle(p),
            description: paperFacts(p),
        }))
    );
}

// ============================================================================
// ONE PAPER
// ============================================================================

async function loadPaper(admin: any, examId: string): Promise<any | null> {
    const { data } = await admin.from('exams').select(PAPER_COLUMNS).eq('id', examId).maybeSingle();
    if (!data || data.source !== 'catalog' || !data.is_published) return null;
    return data;
}

/** Opens a paper: sends it if they can have it, offers it if they cannot. */
async function showPaper(
    config: WhatsAppConfig,
    admin: any,
    phone: string,
    examId: string,
    session: any
): Promise<void> {
    const paper = await loadPaper(admin, examId);
    if (!paper) {
        await sendText(config, phone, 'I cannot find that paper any more. Send MENU to browse.');
        return;
    }
    await presentPaper(config, admin, phone, paper, '', session);
}

async function presentPaper(
    config: WhatsAppConfig,
    admin: any,
    phone: string,
    paper: any,
    note = '',
    session?: any
): Promise<void> {
    const userId = await findOrCreateUserForPhone(admin, phone, session);
    if (!userId) {
        await sendText(config, phone, 'I could not set up your account. Please try again shortly.');
        return;
    }

    // Free, bought, or covered by a live subscription — no cart, no payment.
    // Free papers must never reach a checkout: charging nothing is still a
    // payment prompt, and a payment prompt for a free paper is a broken shop.
    if (await mayDownload(admin, paper.id, userId)) {
        const free = paper.price_cents === 0;
        await sendText(
            config,
            phone,
            free
                ? `${paper.title} is free. Sending it now…`
                : `You already have ${paper.title}. Sending it again…`
        );
        await sendPaper(config, admin, phone, paper);
        return;
    }

    const cart: CartItem[] = session?.cart ?? [];
    const inCart = cart.some((c) => c.exam_id === paper.id);

    await sendButtons(
        config,
        phone,
        [
            paper.title,
            paperFacts(paper),
            note,
            '',
            `Price: ${formatPrice(paper.price_cents, paper.currency)}`,
            paper.has_marking_scheme ? 'Includes the marking scheme.' : null,
            inCart ? '\nAlready on your list.' : null,
        ]
            .filter(Boolean)
            .join('\n'),
        inCart
            ? [
                  { id: 'CHECKOUT', title: 'Pay now' },
                  { id: 'menu:browse', title: 'Find another' },
              ]
            : [
                  { id: `now:${paper.id}`, title: 'Buy this one' },
                  { id: `add:${paper.id}`, title: 'Add to list' },
                  { id: 'menu:browse', title: 'Find another' },
              ]
    );
}

// ============================================================================
// CART
// ============================================================================

async function addPaper(
    config: WhatsAppConfig,
    admin: any,
    phone: string,
    examId: string,
    session: any
): Promise<void> {
    const paper = await loadPaper(admin, examId);
    if (!paper) {
        await sendText(config, phone, 'I cannot find that paper any more.');
        return;
    }

    const cart = addToCart(session.cart ?? [], {
        exam_id: paper.id,
        title: paper.title,
        price_cents: paper.price_cents,
    });

    await setSession(admin, phone, { cart });

    await sendButtons(
        config,
        phone,
        [`Added: ${paper.title}`, '', describeCart(cart, paper.currency)].join('\n'),
        [
            { id: 'CHECKOUT', title: `Pay ${formatPrice(cartTotal(cart), paper.currency)}` },
            { id: 'menu:browse', title: 'Add another' },
            { id: 'CLEAR', title: 'Start over' },
        ]
    );
}

/** Straight to payment for a single paper, skipping the list. */
async function buyOne(
    config: WhatsAppConfig,
    admin: any,
    phone: string,
    examId: string,
    session: any
): Promise<void> {
    const paper = await loadPaper(admin, examId);
    if (!paper) {
        await sendText(config, phone, 'I cannot find that paper any more.');
        return;
    }

    const cart = addToCart(session.cart ?? [], {
        exam_id: paper.id,
        title: paper.title,
        price_cents: paper.price_cents,
    });

    await setSession(admin, phone, { cart });
    await startCheckout(config, admin, phone, { ...session, cart });
}

async function showCart(config: WhatsAppConfig, admin: any, phone: string, session: any): Promise<void> {
    const cart: CartItem[] = session.cart ?? [];

    if (cart.length === 0) {
        await sendText(config, phone, 'Your list is empty. Send MENU to find papers.');
        return;
    }

    await sendButtons(config, phone, describeCart(cart), [
        { id: 'CHECKOUT', title: `Pay ${formatPrice(cartTotal(cart))}` },
        { id: 'menu:browse', title: 'Add another' },
        { id: 'CLEAR', title: 'Clear list' },
    ]);
}

/**
 * Confirms the exact total, then fires the M-Pesa prompt.
 *
 * The confirmation is not optional politeness. An STK prompt that appears
 * without the amount having been stated first is how a customer learns to
 * distrust the number — and this is somebody's phone, mid-conversation, being
 * asked for a PIN.
 */
async function startCheckout(
    config: WhatsAppConfig,
    admin: any,
    phone: string,
    session: any
): Promise<void> {
    const cart: CartItem[] = session.cart ?? [];

    if (cart.length === 0) {
        await sendText(config, phone, 'Your list is empty. Send MENU to find papers.');
        return;
    }

    // The second tap: the total has already been shown and agreed, so pay.
    if (session.state === 'confirming') {
        await payNow(config, admin, phone, session);
        return;
    }

    await setSession(admin, phone, { state: 'confirming' });

    await sendButtons(
        config,
        phone,
        [describeCart(cart), '', 'Pay by M-Pesa on this number?'].join('\n'),
        [
            { id: 'CONFIRM', title: `Pay ${formatPrice(cartTotal(cart))}` },
            { id: 'menu:browse', title: 'Keep looking' },
            { id: 'CLEAR', title: 'Cancel' },
        ]
    );
}

async function payNow(config: WhatsAppConfig, admin: any, phone: string, session: any): Promise<void> {
    const userId = await findOrCreateUserForPhone(admin, phone, session);
    if (!userId) {
        await sendText(config, phone, 'I could not set up your account. Please try again shortly.');
        return;
    }

    const result = await checkout(admin, userId, phone, session.cart ?? []);

    if (!result.ok) {
        await setSession(admin, phone, { state: 'idle' });
        await sendText(config, phone, result.error ?? 'Could not start that order.');
        return;
    }

    // Papers that turned out to be free or already owned are simply sent — they
    // were never chargeable and holding them behind a payment would be wrong.
    for (const examId of result.freeExamIds ?? []) {
        const paper = await loadPaper(admin, examId);
        if (paper) await sendPaper(config, admin, phone, paper);
    }

    if (result.dropped && result.dropped.length > 0) {
        await sendText(
            config,
            phone,
            `I removed ${result.dropped
                .map((d) => `"${d.title}" (${d.reason})`)
                .join(', ')}. You have not been charged for those.`
        );
    }

    // Everything was free or already theirs.
    if (!result.orderId) {
        await setSession(admin, phone, { cart: [], state: 'idle' });
        await sendText(config, phone, 'That is everything — nothing to pay. Send MENU for more.');
        return;
    }

    await setSession(admin, phone, { state: 'awaiting_payment' });

    if (result.stkSent) {
        await sendText(
            config,
            phone,
            [
                `Check your phone for the M-Pesa prompt for ${formatPrice(result.totalCents ?? 0)} and enter your PIN.`,
                '',
                'Your papers arrive here the moment it goes through.',
            ].join('\n')
        );
        return;
    }

    const paybill = process.env.NEXT_PUBLIC_MPESA_PAYBILL || process.env.NEXT_PUBLIC_MPESA_TILL;
    await sendText(
        config,
        phone,
        [
            paybill
                ? `Pay ${formatPrice(result.totalCents ?? 0)} to paybill ${paybill}`
                : `To pay ${formatPrice(result.totalCents ?? 0)}:`,
            `Account number: ${result.reference}`,
            '',
            'Your papers arrive here as soon as the payment lands.',
        ].join('\n')
    );
}

// ============================================================================
// MY PAPERS
// ============================================================================

/**
 * Everything they have bought, ready to re-send.
 *
 * No charge and no limit beyond the rate limit: the files are already theirs,
 * and a customer who lost a PDF in a busy chat should not have to buy it again
 * or open a browser to find it.
 */
async function showMyPapers(config: WhatsAppConfig, admin: any, phone: string, session: any): Promise<void> {
    const userId = await findOrCreateUserForPhone(admin, phone, session);
    if (!userId) {
        await sendText(config, phone, 'I could not find your account. Send MENU to start again.');
        return;
    }

    const { data: rows } = await admin
        .from('entitlements')
        .select('exam_id, granted_at, exams(id, title, subject, grade_label, year, exam_type, has_marking_scheme)')
        .eq('user_id', userId)
        .order('granted_at', { ascending: false })
        .limit(10);

    const owned = (rows ?? []).filter((r: any) => r.exams);

    if (owned.length === 0) {
        // A live subscription means everything is theirs even with no
        // entitlement rows, and saying "you have nothing" would be wrong.
        const { data: sub } = await admin
            .from('subscriptions')
            .select('status')
            .eq('user_id', userId)
            .eq('status', 'active')
            .maybeSingle();

        if (sub) {
            await sendText(
                config,
                phone,
                'Your subscription is active — every paper on the site is yours. Tell me which one you need.'
            );
            return;
        }

        await sendText(config, phone, 'You have not bought anything yet. Send MENU to find your first paper.');
        return;
    }

    await sendList(
        config,
        phone,
        `You have ${owned.length} paper${owned.length === 1 ? '' : 's'}. Pick one to send again.`,
        'Send again',
        owned.map((row: any) => ({
            id: `resend:${row.exams.id}`,
            title: shortTitle(row.exams),
            description: paperFacts(row.exams),
        })),
        'Your papers'
    );
}

async function resendPaper(config: WhatsAppConfig, admin: any, phone: string, examId: string): Promise<void> {
    const userId = await findOrCreateUserForPhone(admin, phone);
    if (!userId) return;

    // Re-checked rather than trusted. The list came from this account, but a
    // subscription can lapse between the list being sent and a row being tapped,
    // and the gate is the gate.
    if (!(await mayDownload(admin, examId, userId))) {
        await sendText(config, phone, 'That paper is not on your account any more.');
        return;
    }

    const paper = await loadPaper(admin, examId);
    if (!paper) {
        await sendText(config, phone, 'I cannot find that paper any more.');
        return;
    }

    await sendPaper(config, admin, phone, paper);
}

// ============================================================================
// SUBSCRIPTIONS
// ============================================================================

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

    // No plan named: show what is on sale rather than guessing which one they
    // meant and charging for it.
    if (!slug) {
        const { data: plans } = await admin
            .from('subscription_plans')
            .select('slug, name, price_cents, currency, duration_days')
            .eq('is_active', true)
            .order('price_cents');

        if (!plans || plans.length === 0) {
            await sendText(config, phone, 'No subscription is on sale at the moment.');
            return;
        }

        await sendList(
            config,
            phone,
            'Every paper on the site, for one price.',
            'Choose a plan',
            plans.map((p: any) => ({
                id: `plan:${p.slug}`,
                title: `${p.name} ${formatPrice(p.price_cents, p.currency)}`,
                description: `Everything for ${durationLabel(p.duration_days)}`,
            })),
            'Plans'
        );
        return;
    }

    const result = await createPlanOrder(admin, userId, slug, phone, {
        channel: 'whatsapp',
        waPhone: phone,
    });

    if (!result.ok) {
        await sendText(config, phone, result.error ?? 'Could not start that subscription.');
        return;
    }

    await setSession(admin, phone, { state: 'awaiting_payment' });

    if (result.stkSent) {
        await sendText(config, phone, 'Check your phone for the M-Pesa prompt and enter your PIN.');
        return;
    }

    const paybill = process.env.NEXT_PUBLIC_MPESA_PAYBILL || process.env.NEXT_PUBLIC_MPESA_TILL;
    await sendText(
        config,
        phone,
        [
            paybill
                ? `Pay ${formatPrice(result.plan.price_cents, result.plan.currency)} to paybill ${paybill}`
                : 'To pay:',
            `Account number: ${result.order.reference}`,
            '',
            'Everything unlocks here as soon as the payment lands.',
        ].join('\n')
    );
}

// ============================================================================
// HUMAN HANDOFF
// ============================================================================

/**
 * Marks the conversation for a person and stops the bot answering.
 *
 * Going quiet is the feature. A bot that keeps replying while somebody waits for
 * help is worse than one that never offered help at all — and a customer asking
 * about a payment is exactly the person a wrong automated answer costs most.
 */
async function handOff(config: WhatsAppConfig, admin: any, phone: string, reason: string): Promise<void> {
    await setSession(admin, phone, {
        needs_human: true,
        human_since: new Date().toISOString(),
        human_reason: reason,
        state: 'human',
    });

    const contact = process.env.NEXT_PUBLIC_SUPPORT_PHONE || null;

    await sendText(
        config,
        phone,
        [
            'I have passed this to a person — they will reply here.',
            '',
            'I will stop sending automatic replies so nothing talks over them.',
            contact ? `\nIf it is urgent: ${contact}` : '',
            '',
            'Send START if you would rather carry on with me.',
        ]
            .filter(Boolean)
            .join('\n')
    );
}

// ============================================================================
// ACCOUNT LINKING
// ============================================================================

/**
 * Joins this number to a website account.
 *
 * The code proves the person holds both the signed-in browser and the phone.
 * Matching on a typed email was the obvious alternative and is an account
 * takeover with two words of typing — knowing somebody's address proves nothing
 * about owning it.
 *
 * Entitlements earned on the phone-only account move across, so nothing bought
 * over chat is stranded on an account the customer never signs into.
 *
 * Returns true when the message was a link code and has been dealt with. False
 * means "this was not a code" and the caller should carry on routing it — which
 * is how a six-letter search term survives being shaped like a code.
 */
async function redeemLinkCode(
    config: WhatsAppConfig,
    admin: any,
    phone: string,
    code: string,
    announceFailure: boolean
): Promise<boolean> {
    const { data: row } = await admin
        .from('account_link_codes')
        .select('code, user_id, expires_at, used_at')
        .eq('code', code)
        .maybeSingle();

    // Expired, used and never-existed are one answer on purpose: distinguishing
    // them tells somebody guessing codes which guesses were close.
    if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
        if (!announceFailure) return false;
        await sendText(
            config,
            phone,
            'That code is not valid any more. Get a fresh one from your account page and send it within 15 minutes.'
        );
        return true;
    }

    const { data: session } = await admin
        .from('whatsapp_sessions')
        .select('user_id')
        .eq('phone', phone)
        .maybeSingle();

    const phoneUserId = session?.user_id;
    let merged: { moved?: number } | null = null;

    if (phoneUserId && phoneUserId !== row.user_id) {
        // One RPC, one transaction. This used to be a blanket
        // `update entitlements set user_id = …`, which looked right and was
        // measurably wrong: `entitlements` is UNIQUE (user_id, exam_id), so if
        // the website account already owned any one of these papers the whole
        // statement aborted on 23505 and *nothing* moved. The customer got
        // "Linked ✅" while every chat purchase stayed on an account they cannot
        // sign into — and the person most likely to link is exactly the one who
        // has bought in both places. See migration 034.
        const { data, error } = await admin.rpc('merge_whatsapp_account', {
            p_from: phoneUserId,
            p_to: row.user_id,
        });

        if (error) {
            // The code is not burned and the session is not repointed, so the
            // customer can try again rather than being told they are linked
            // while their papers sit somewhere else.
            console.error('Could not merge accounts on link:', error.message);
            await sendText(
                config,
                phone,
                'Something went wrong joining the accounts. Nothing has changed — send LINK to try again.'
            );
            return true;
        }

        merged = data ?? null;
    }

    await admin
        .from('account_link_codes')
        .update({ used_at: new Date().toISOString(), used_by_phone: phone })
        .eq('code', code);

    await setSession(admin, phone, { user_id: row.user_id, state: 'idle' });

    const moved = Number(merged?.moved) || 0;

    await sendText(
        config,
        phone,
        [
            'Linked ✅ This number and your website account are now the same account.',
            moved > 0
                ? `\n${moved} paper${moved === 1 ? '' : 's'} bought here ${moved === 1 ? 'has' : 'have'} moved across — they are in your library on the website too.`
                : '\nYour papers are in both places from now on.',
        ].join('\n')
    );

    return true;
}

// ============================================================================
// IDENTITY
// ============================================================================

/**
 * The account behind a phone number, created on first contact if need be.
 *
 * Entitlements are per user, so the bot needs one to ask `can_download_paper`.
 * Creating it silently means a buyer's papers are waiting in /library if they
 * ever visit the website, rather than living in a parallel universe.
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

    await admin.from('whatsapp_sessions').update({ user_id: created.user.id }).eq('phone', phone);
    return created.user.id;
}

/** The gate. Fails closed: if the check cannot be evaluated, nothing is sent. */
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

    return (
        created ?? {
            phone,
            cart: [],
            state: 'idle',
            state_data: {},
            message_count: 0,
            window_start: new Date().toISOString(),
            muted: false,
            needs_human: false,
        }
    );
}

async function setSession(admin: any, phone: string, patch: Record<string, unknown>): Promise<void> {
    const { error } = await admin
        .from('whatsapp_sessions')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('phone', phone);

    if (error) console.error('Could not update the WhatsApp session:', error.message);
}

/** Records that they wrote, which is what re-opens the 24-hour window. */
async function touchInbound(admin: any, phone: string): Promise<void> {
    await admin
        .from('whatsapp_sessions')
        .update({ last_inbound_at: new Date().toISOString() })
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

/** Fits a list row: Meta truncates titles at 24 characters. */
function shortTitle(paper: any): string {
    const parts = [paper.grade_label, paper.subject].filter(Boolean).join(' ');
    return parts || paper.title;
}

function paperFacts(paper: any): string {
    return [
        paper.exam_type ? examTypeName(paper.exam_type) : null,
        paper.year ? String(paper.year) : null,
        paper.total_marks ? `${paper.total_marks} marks` : null,
        paper.has_marking_scheme ? '+ scheme' : null,
    ]
        .filter(Boolean)
        .join(' · ');
}

// Re-exported so callers that already import from the bot keep one path.
export { deliverOrder, windowIsOpen };
