/**
 * Verification harness for the WhatsApp shop.
 *
 *   node scripts/verify-whatsapp-bot.mjs
 *
 * `verify-whatsapp.mjs` already covers finding a paper from a typed sentence.
 * This covers what happens after that: the cart, the money, the 24-hour window,
 * and the signature on the door.
 *
 * Three properties are worth stating outright, because every check below is
 * ultimately defending one of them.
 *
 *   1. A CART TOTAL IS NEVER WHAT SOMEBODY IS CHARGED. The cart lives in
 *      `whatsapp_sessions`, which is session state; checkout re-reads every
 *      paper from `exams` and rebuilds the total from the row. The arithmetic
 *      here is for what the customer is *shown*, and the checks pin it because a
 *      wrong figure on screen is a broken promise even when the charge is right.
 *
 *   2. THE WINDOW CLOSES EARLY, ON PURPOSE. A send begun at 23h59 can reach Meta
 *      after the window shuts, and a delivery that fails at the boundary is
 *      indistinguishable from one never sent. Five minutes of margin costs a
 *      queued message; its absence costs a paid paper.
 *
 *   3. AN UNSIGNED REQUEST IS HOSTILE. The webhook hands out paid PDFs to
 *      whoever asks. The signature check is the only thing standing in front of
 *      it, so it is regression-tested rather than assumed.
 *
 * No network and no database: every function exercised here is pure, which is
 * why they were written as pure functions in the first place.
 */

import { createHmac } from 'crypto';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
    alias: { '@': new URL('../src', import.meta.url).pathname },
    interopDefault: true,
});

const { cartTotal, addToCart, removeFromCart, describeCart } = await jiti.import(
    '../src/services/whatsappCart.ts'
);

const { windowIsOpen, SERVICE_WINDOW_MS, verifySignature, extractMessages, deliveryTemplateName } =
    await jiti.import('../src/lib/whatsapp.ts');

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
    checks++;
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(
        `  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(54)} ${ok ? JSON.stringify(actual) : `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`
    );
}

function assert(label, condition, detail = '') {
    checks++;
    if (!condition) failures++;
    console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${label.padEnd(54)} ${detail}`);
}

function section(t) {
    console.log(`\n${t}`);
}

const paper = (id, title, priceCents) => ({ exam_id: id, title, price_cents: priceCents });

// ---------------------------------------------------------------------------

section('the cart adds up');
{
    check('an empty cart is nothing, not NaN', cartTotal([]), 0);
    check(
        'three papers',
        cartTotal([paper('a', 'A', 3000), paper('b', 'B', 5000), paper('c', 'C', 2000)]),
        10000
    );

    // A row that lost its price — a paper repriced to null, a hand-edited
    // session — must contribute zero rather than poisoning the whole total. A
    // customer shown "KES NaN" has no idea what they are about to pay.
    check(
        'a missing price counts as zero, not NaN',
        cartTotal([paper('a', 'A', 3000), { exam_id: 'b', title: 'B' }]),
        3000
    );
    check(
        'a price arriving as a string still adds up',
        cartTotal([paper('a', 'A', '3000'), paper('b', 'B', 2000)]),
        5000
    );
}

section('adding the same paper twice is not a second charge');
{
    const once = addToCart([], paper('a', 'Biology P1', 3000));
    const twice = addToCart(once, paper('a', 'Biology P1', 3000));
    check('one row after two adds', twice.length, 1);
    check('and one price', cartTotal(twice), 3000);

    // The dedupe is by id, not title. Two papers can share a title across years,
    // and collapsing those would silently drop one the customer chose.
    const differentIds = addToCart(once, paper('b', 'Biology P1', 3000));
    check('same title, different paper, both kept', differentIds.length, 2);

    // Twenty is the cap. A cart is offered as a numbered list in a chat message,
    // and an unbounded one is a 4096-character limit waiting to truncate.
    let big = [];
    for (let i = 0; i < 25; i++) big = addToCart(big, paper(`p${i}`, `Paper ${i}`, 1000));
    check('capped at twenty', big.length, 20);
    check('and the first twenty are the ones kept', big[0].exam_id, 'p0');
}

section('removing');
{
    const cart = [paper('a', 'A', 3000), paper('b', 'B', 5000)];
    check('removes the one named', removeFromCart(cart, 'a').length, 1);
    check('and leaves the other', removeFromCart(cart, 'a')[0].exam_id, 'b');
    check('removing something absent changes nothing', removeFromCart(cart, 'zzz').length, 2);
    check('the original is untouched', cart.length, 2);
}

section('how the cart reads in a chat');
{
    check('empty says so plainly', describeCart([]), 'Your list is empty.');

    const text = describeCart([paper('a', 'Biology Paper 1', 3000), paper('b', 'Chemistry P2', 5000)]);
    assert('numbers each line', text.includes('1. Biology Paper 1'), text.split('\n')[0]);
    assert('shows each price', text.includes('KES 30'), 'KES 30');
    assert('totals at the end', text.includes('Total:'), 'Total:');
    assert('pluralises honestly', text.includes('2 papers'), '2 papers');
    assert(
        'and does not say "1 papers"',
        describeCart([paper('a', 'A', 3000)]).includes('1 paper') &&
            !describeCart([paper('a', 'A', 3000)]).includes('1 papers'),
        '1 paper'
    );
}

section('the 24-hour service window');
{
    const now = Date.now();
    const ago = (ms) => new Date(now - ms).toISOString();
    const HOUR = 60 * 60 * 1000;
    const MINUTE = 60 * 1000;

    check('a message a minute ago — open', windowIsOpen(ago(MINUTE), now), true);
    check('twelve hours ago — open', windowIsOpen(ago(12 * HOUR), now), true);
    check('twenty-three hours ago — open', windowIsOpen(ago(23 * HOUR), now), true);

    // The margin. Both of these are inside a naive 24-hour comparison and both
    // are refused, which is the entire point of the five minutes.
    check('23h58 — refused, the margin', windowIsOpen(ago(23 * HOUR + 58 * MINUTE), now), false);
    check('exactly 24h — refused', windowIsOpen(ago(SERVICE_WINDOW_MS), now), false);
    check('25 hours — refused', windowIsOpen(ago(25 * HOUR), now), false);

    // Fails closed. A number that has never written, or a corrupt timestamp, is
    // not permission to send — it is the absence of permission.
    check('never written — refused', windowIsOpen(null, now), false);
    check('undefined — refused', windowIsOpen(undefined, now), false);
    check('an unparseable date — refused', windowIsOpen('yesterday-ish', now), false);
    check('an empty string — refused', windowIsOpen('', now), false);

    check('a Date object works too', windowIsOpen(new Date(now - HOUR), now), true);
}

section('templates are absent until the business creates one');
{
    const saved = process.env.WHATSAPP_TEMPLATE_DELIVERY;

    delete process.env.WHATSAPP_TEMPLATE_DELIVERY;
    check('unset reads as null, not ""', deliveryTemplateName(), null);

    process.env.WHATSAPP_TEMPLATE_DELIVERY = '';
    check('blank also reads as null', deliveryTemplateName(), null);

    process.env.WHATSAPP_TEMPLATE_DELIVERY = 'papers_ready';
    check('a configured name comes back', deliveryTemplateName(), 'papers_ready');

    if (saved === undefined) delete process.env.WHATSAPP_TEMPLATE_DELIVERY;
    else process.env.WHATSAPP_TEMPLATE_DELIVERY = saved;
}

section('the signature on the door');
{
    const secret = 'test-app-secret';
    const body = JSON.stringify({ entry: [{ changes: [] }] });
    const sign = (text, key = secret) =>
        `sha256=${createHmac('sha256', key).update(text, 'utf8').digest('hex')}`;

    check('a correct signature passes', verifySignature(body, sign(body), secret), true);
    check('no header at all is refused', verifySignature(body, null, secret), false);
    check('an empty header is refused', verifySignature(body, '', secret), false);
    check('a bare hex digest without the prefix is refused', verifySignature(body, sign(body).slice(7), secret), false);
    check('the wrong secret is refused', verifySignature(body, sign(body, 'not-it'), secret), false);

    // The body is what is signed. A single altered character — the difference
    // between requesting one paper and requesting somebody else's — must fail.
    const tampered = body.replace('entry', 'entrY');
    check('a tampered body is refused', verifySignature(tampered, sign(body), secret), false);

    check('a truncated digest is refused', verifySignature(body, sign(body).slice(0, 40), secret), false);
    check('sha1 is refused', verifySignature(body, `sha1=${'0'.repeat(40)}`, secret), false);
}

section('reading a webhook payload');
{
    const wrap = (message) => ({ entry: [{ changes: [{ value: { messages: [message] } }] }] });

    const typed = extractMessages(
        wrap({ id: 'wamid.1', from: '254712345678', type: 'text', text: { body: 'form 4 biology' } })
    );
    check('a typed message comes through', typed.length, 1);
    check('with its text', typed[0].text, 'form 4 biology');
    check('and is not marked as a tap', typed[0].isInteractiveReply, false);

    const tapped = extractMessages(
        wrap({
            id: 'wamid.2',
            from: '254712345678',
            type: 'interactive',
            interactive: { type: 'list_reply', list_reply: { id: 'paper:abc', title: 'Biology P1' } },
        })
    );
    check('a list tap comes through as its row id', tapped[0].text, 'paper:abc');
    check('and is marked as a tap', tapped[0].isInteractiveReply, true);

    const button = extractMessages(
        wrap({
            id: 'wamid.3',
            from: '254712345678',
            type: 'interactive',
            interactive: { type: 'button_reply', button_reply: { id: 'add:abc', title: 'Add' } },
        })
    );
    check('a button tap too', button[0].text, 'add:abc');

    // Delivery and read receipts arrive in the same envelope. Treating one as a
    // request would answer messages nobody sent — and on a delivery path, send
    // a second copy of a paid paper.
    const statuses = extractMessages({
        entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.1', status: 'delivered' }] } }] }],
    });
    check('a delivery receipt is not a message', statuses.length, 0);

    check('an empty payload is not a crash', extractMessages({}).length, 0);
    check('null is not a crash', extractMessages(null).length, 0);

    // An image or voice note yields an empty text, which is what makes the bot
    // answer "I can only read text" rather than saying nothing at all.
    const image = extractMessages(wrap({ id: 'wamid.4', from: '254712345678', type: 'image' }));
    check('an image still produces a message', image.length, 1);
    check('with empty text, so it gets a reply', image[0].text, '');
}

// ---------------------------------------------------------------------------

console.log(
    `\n${failures === 0 ? 'All' : `${checks - failures}/${checks}`} WhatsApp shop checks passed.`
);
if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
}
