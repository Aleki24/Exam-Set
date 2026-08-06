/**
 * Verification harness for the M-Pesa helpers.
 *
 *   node scripts/verify-mpesa.mjs
 *
 * Only the pure parts: phone normalisation and the Daraja timestamp. Nothing
 * here talks to Safaricom, so it runs anywhere and needs no credentials.
 *
 * These are small functions that fail expensively. A number Daraja rejects is a
 * sale that does not happen, and a timestamp in the wrong timezone invalidates
 * the password every request is signed with.
 */

import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
    alias: { '@': new URL('../src', import.meta.url).pathname },
    interopDefault: true,
});

const { normalisePhone, mpesaTimestamp, stkPayload, collectionMode } = await jiti.import('../src/lib/mpesa.ts');

/** A configured deployment, minus the credentials none of these checks need. */
const BASE = {
    consumerKey: 'k',
    consumerSecret: 's',
    shortcode: '400200',
    passkey: 'p',
    callbackUrl: 'https://exam-set.vercel.app/api/mpesa/callback',
    env: 'sandbox',
};

let failures = 0;
function check(name, condition, detail = '') {
    if (condition) {
        console.log(`  ok   ${name}`);
    } else {
        failures++;
        console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    }
}
function section(title) {
    console.log(`\n${title}`);
}

section('Accepts every way a Kenyan writes their own number');
{
    const wanted = '254712345678';
    for (const input of [
        '0712345678',
        '254712345678',
        '+254712345678',
        '712345678',
        '0712 345 678',
        '+254 712 345 678',
        '0712-345-678',
    ]) {
        check(`${input} → ${wanted}`, normalisePhone(input) === wanted, String(normalisePhone(input)));
    }

    // Safaricom's 01x range is as real as 07x and was worth getting right.
    check('0110000000 is accepted', normalisePhone('0110000000') === '254110000000', String(normalisePhone('0110000000')));
}

section('Rejects what Daraja would reject');
{
    for (const bad of ['', '07123456', '07123456789', '0812345678', '254812345678', 'not a phone', '+1 555 0100']) {
        check(`${bad || '(empty)'} is refused`, normalisePhone(bad) === null, String(normalisePhone(bad)));
    }
}

section('Stamps the time in East Africa, whatever the server thinks');
{
    // The password Daraja checks is built from this timestamp. A server running
    // in UTC — which every deployment of this app does — would sign with a time
    // three hours behind Nairobi if this used local time.
    const stamp = mpesaTimestamp(new Date('2026-08-06T21:30:15Z'));
    check('formatted YYYYMMDDHHmmss', /^\d{14}$/.test(stamp), stamp);
    check('shifted to UTC+3', stamp === '20260807003015', stamp);

    const midnight = mpesaTimestamp(new Date('2026-01-31T22:00:00Z'));
    check('rolls the date over correctly', midnight === '20260201010000', midnight);

    check('zero-pads single digits', mpesaTimestamp(new Date('2026-03-05T01:02:03Z')) === '20260305040203');
}

section('Knows which way it is collecting');
{
    check('no till means paybill', collectionMode({ ...BASE, till: undefined }) === 'paybill');
    check('a till means buy goods', collectionMode({ ...BASE, till: '7616114' }) === 'buy-goods');
}

section('Builds a paybill request when no till is configured');
{
    const payload = stkPayload(
        { ...BASE, till: undefined },
        { phone: '254712345678', amount: 50, timestamp: '20260806120000', password: 'pw', reference: 'REF1', description: 'One paper' }
    );
    check('transaction type', payload.TransactionType === 'CustomerPayBillOnline', String(payload.TransactionType));
    check('paid to the paybill', payload.PartyB === '400200', String(payload.PartyB));
    check('authenticated as the same shortcode', payload.BusinessShortCode === '400200');
}

section('Builds a Buy Goods request when a till is configured');
{
    const payload = stkPayload(
        { ...BASE, till: '7616114' },
        { phone: '254712345678', amount: 50, timestamp: '20260806120000', password: 'pw', reference: 'REF1', description: 'One paper' }
    );
    check('transaction type switches', payload.TransactionType === 'CustomerBuyGoodsOnline', String(payload.TransactionType));
    check('paid to the till', payload.PartyB === '7616114', String(payload.PartyB));

    // The store number and the number on the counter are usually different, and
    // the password was signed with the store number — so this must not follow
    // PartyB across.
    check('still authenticated as the store number', payload.BusinessShortCode === '400200', String(payload.BusinessShortCode));
}

section('Keeps the parts Daraja is strict about');
{
    const payload = stkPayload(BASE, {
        phone: '254712345678',
        amount: 50,
        timestamp: '20260806120000',
        password: 'pw',
        reference: 'A-VERY-LONG-ORDER-REFERENCE-INDEED',
        description: 'x'.repeat(200),
    });
    check('reference truncated to 12', String(payload.AccountReference).length === 12, String(payload.AccountReference));
    check('description truncated to 60', String(payload.TransactionDesc).length === 60);
    check('payer and payee phone agree', payload.PartyA === payload.PhoneNumber);
    check('callback carries the public URL', payload.CallBackURL === BASE.callbackUrl);
}

console.log(failures === 0 ? '\nAll M-Pesa checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
