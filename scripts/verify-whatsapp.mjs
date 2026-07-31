/**
 * Verification harness for the WhatsApp transport.
 *
 *   node scripts/verify-whatsapp.mjs
 *
 * Two things are worth being certain about before this endpoint is public:
 *
 *   1. The signature check. It is the only thing standing between the paper
 *      catalogue and anyone who finds the webhook URL, so it is tested for what
 *      it rejects rather than only for what it accepts.
 *   2. Message extraction. Meta delivers status receipts on the same webhook as
 *      real messages, and answering a receipt would mean replying to a message
 *      nobody sent.
 *
 * No network: everything here is local.
 */

import { createHmac } from 'crypto';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
    alias: { '@': new URL('../src', import.meta.url).pathname },
    interopDefault: true,
});

const { verifySignature, extractMessages } = await jiti.import('../src/lib/whatsapp.ts');

const SECRET = 'test-app-secret';

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
    checks++;
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(46)} ${ok ? actual : `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`);
}

function section(title) {
    console.log(`\n${title}`);
}

function sign(body, secret = SECRET) {
    return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}

// ---------------------------------------------------------------------------

section('Signature verification');
{
    const body = JSON.stringify({ entry: [{ id: '1' }] });

    check('a correctly signed body passes', verifySignature(body, sign(body), SECRET), true);
    check('a tampered body fails', verifySignature(body + ' ', sign(body), SECRET), false);
    check('the wrong secret fails', verifySignature(body, sign(body, 'other-secret'), SECRET), false);
    check('a missing header fails', verifySignature(body, null, SECRET), false);
    check('an empty header fails', verifySignature(body, '', SECRET), false);
    check('an unprefixed digest fails', verifySignature(body, sign(body).slice(7), SECRET), false);
    check('sha1 prefix fails', verifySignature(body, 'sha1=abc', SECRET), false);
    check('a truncated digest fails', verifySignature(body, sign(body).slice(0, 20), SECRET), false);
    check('garbage fails', verifySignature(body, 'sha256=not-hex-at-all', SECRET), false);

    // Byte-for-byte. Meta sends compact JSON; a body that has been parsed and
    // re-serialised loses the original whitespace and no longer matches its own
    // signature. This is exactly why the route hashes the raw text rather than
    // parsing first, and the assertion pins that behaviour down.
    const original = `{"entry": [{"id": "1"}]}`;
    const reserialised = JSON.stringify(JSON.parse(original));
    check('whitespace differences are caught', reserialised === original, false);
    check('re-serialised body fails its signature', verifySignature(reserialised, sign(original), SECRET), false);
}

section('Extracting real messages');
{
    const payload = {
        entry: [
            {
                changes: [
                    {
                        value: {
                            messages: [
                                { id: 'wamid.1', from: '254712345678', type: 'text', text: { body: 'form 4 maths' } },
                            ],
                        },
                    },
                ],
            },
        ],
    };

    const messages = extractMessages(payload);
    check('one message found', messages.length, 1);
    check('sender', messages[0].from, '254712345678');
    check('text', messages[0].text, 'form 4 maths');
    check('not an interactive reply', messages[0].isInteractiveReply, false);
}

section('Status receipts are not messages');
{
    const payload = {
        entry: [
            {
                changes: [
                    {
                        value: {
                            statuses: [{ id: 'wamid.1', status: 'delivered', recipient_id: '254712345678' }],
                        },
                    },
                ],
            },
        ],
    };

    check('receipts produce nothing', extractMessages(payload).length, 0);
}

section('Interactive replies carry the row id');
{
    const payload = {
        entry: [
            {
                changes: [
                    {
                        value: {
                            messages: [
                                {
                                    id: 'wamid.2',
                                    from: '254712345678',
                                    type: 'interactive',
                                    interactive: {
                                        type: 'list_reply',
                                        list_reply: { id: 'paper:abc-123', title: 'Form 4 Maths' },
                                    },
                                },
                            ],
                        },
                    },
                ],
            },
        ],
    };

    const messages = extractMessages(payload);
    check('row id becomes the text', messages[0].text, 'paper:abc-123');
    check('flagged as interactive', messages[0].isInteractiveReply, true);
}

section('Unsupported media still gets a turn');
{
    const payload = {
        entry: [
            {
                changes: [
                    {
                        value: {
                            messages: [{ id: 'wamid.3', from: '254712345678', type: 'image', image: { id: 'x' } }],
                        },
                    },
                ],
            },
        ],
    };

    const messages = extractMessages(payload);
    check('recorded so the sender is answered', messages.length, 1);
    check('with empty text', messages[0].text, '');
}

section('Malformed payloads do not throw');
{
    check('empty object', extractMessages({}).length, 0);
    check('null', extractMessages(null).length, 0);
    check('entry without changes', extractMessages({ entry: [{}] }).length, 0);
    check('message missing an id', extractMessages({ entry: [{ changes: [{ value: { messages: [{ from: '1' }] } }] }] }).length, 0);
}

// ---------------------------------------------------------------------------

console.log(`\n${failures === 0 ? 'All' : `${checks - failures}/${checks}`} WhatsApp transport checks passed.`);
if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
}
