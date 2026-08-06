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

const { normalisePhone, mpesaTimestamp } = await jiti.import('../src/lib/mpesa.ts');

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

console.log(failures === 0 ? '\nAll M-Pesa checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
