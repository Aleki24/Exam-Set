/**
 * M-PESA DARAJA (STK PUSH)
 * ----------------------------------------------------------------------------
 * Server-only helper for Lipa na M-Pesa Online.
 *
 * Every credential comes from the environment. When they are absent the
 * platform falls back to manual confirmation (buyer pays to the paybill and
 * submits the transaction code), so checkout still works in development and
 * for anyone not yet onboarded to Daraja.
 */

export interface MpesaConfig {
    consumerKey: string;
    consumerSecret: string;
    /**
     * The shortcode Daraja authenticates the request as, and the one the
     * password is built from.
     *
     * On a paybill this is the paybill number. On a till it is the store or
     * head-office number, which is NOT the number written on the shop counter —
     * that one is `till` below, and they are frequently different.
     */
    shortcode: string;
    /**
     * Set only when collecting through Buy Goods.
     *
     * Its presence is what switches the request from CustomerPayBillOnline to
     * CustomerBuyGoodsOnline, because the two are not interchangeable: send a
     * till a paybill request and Daraja rejects it, and the sale simply does not
     * happen.
     */
    till?: string;
    passkey: string;
    callbackUrl: string;
    env: 'sandbox' | 'production';
}

export function getMpesaConfig(): MpesaConfig | null {
    const consumerKey = process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    const shortcode = process.env.MPESA_SHORTCODE;
    const passkey = process.env.MPESA_PASSKEY;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

    if (!consumerKey || !consumerSecret || !shortcode || !passkey || !baseUrl) return null;

    const till = (process.env.MPESA_TILL || '').trim();

    return {
        consumerKey,
        consumerSecret,
        shortcode,
        till: till || undefined,
        passkey,
        callbackUrl: `${baseUrl.replace(/\/$/, '')}/api/mpesa/callback`,
        env: process.env.MPESA_ENV === 'production' ? 'production' : 'sandbox',
    };
}

/** Whether this deployment collects through a till or a paybill. */
export function collectionMode(config: MpesaConfig): 'buy-goods' | 'paybill' {
    return config.till ? 'buy-goods' : 'paybill';
}

/**
 * The body of an STK push, built and kept separate so it can be checked without
 * calling Safaricom.
 *
 * The two shapes differ in exactly two fields, and getting either wrong fails
 * the payment rather than degrading it:
 *
 *   paybill    TransactionType CustomerPayBillOnline,  PartyB = the paybill
 *   buy goods  TransactionType CustomerBuyGoodsOnline, PartyB = the till
 *
 * `BusinessShortCode` stays the authenticating shortcode either way, because it
 * is what the password was signed with.
 */
export function stkPayload(
    config: MpesaConfig,
    opts: {
        phone: string;
        amount: number;
        timestamp: string;
        password: string;
        reference: string;
        description: string;
    }
): Record<string, string | number> {
    const buyGoods = collectionMode(config) === 'buy-goods';

    return {
        BusinessShortCode: config.shortcode,
        Password: opts.password,
        Timestamp: opts.timestamp,
        TransactionType: buyGoods ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline',
        Amount: opts.amount,
        PartyA: opts.phone,
        PartyB: buyGoods ? config.till! : config.shortcode,
        PhoneNumber: opts.phone,
        CallBackURL: config.callbackUrl,
        AccountReference: opts.reference.slice(0, 12),
        TransactionDesc: opts.description.slice(0, 60),
    };
}

/** Public payment details shown on the checkout page for manual payment. */
export function manualPaymentDetails() {
    return {
        paybill: process.env.NEXT_PUBLIC_MPESA_PAYBILL || '',
        tillNumber: process.env.NEXT_PUBLIC_MPESA_TILL || '',
        accountName: process.env.NEXT_PUBLIC_PAYMENT_ACCOUNT_NAME || '',
        instructions:
            process.env.NEXT_PUBLIC_PAYMENT_INSTRUCTIONS ||
            'Pay via M-Pesa, then paste the transaction code below to unlock your downloads.',
    };
}

function apiBase(env: MpesaConfig['env']): string {
    return env === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
}

/** Daraja timestamps are YYYYMMDDHHmmss in East Africa Time. */
export function mpesaTimestamp(date = new Date()): string {
    const eat = new Date(date.getTime() + 3 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
        eat.getUTCFullYear().toString() +
        pad(eat.getUTCMonth() + 1) +
        pad(eat.getUTCDate()) +
        pad(eat.getUTCHours()) +
        pad(eat.getUTCMinutes()) +
        pad(eat.getUTCSeconds())
    );
}

/** 2547XXXXXXXX — Daraja rejects anything else. */
export function normalisePhone(input: string): string | null {
    const digits = input.replace(/\D/g, '');
    if (/^254[17]\d{8}$/.test(digits)) return digits;
    if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
    if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
    return null;
}

async function getAccessToken(config: MpesaConfig): Promise<string> {
    const credentials = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString('base64');
    const res = await fetch(`${apiBase(config.env)}/oauth/v1/generate?grant_type=client_credentials`, {
        headers: { Authorization: `Basic ${credentials}` },
        cache: 'no-store',
    });
    if (!res.ok) throw new Error(`M-Pesa auth failed (${res.status})`);
    const body = (await res.json()) as { access_token?: string };
    if (!body.access_token) throw new Error('M-Pesa auth returned no token');
    return body.access_token;
}

export interface StkQueryResult {
    /** 0 means the customer completed the payment. */
    resultCode: number;
    resultDesc: string;
}

/**
 * Asks Safaricom what actually happened to a checkout request.
 *
 * WHY THE CALLBACK IS NOT ENOUGH
 *
 * Daraja posts its result to a URL that cannot require a session — Safaricom
 * carries no credentials — so `/api/mpesa/callback` has to accept anonymous
 * POSTs, and it settles orders with the service role. Meanwhile checkout hands
 * the buyer their own `CheckoutRequestID` in the response. Between those two
 * facts sat a complete bypass of the paywall: start a real checkout, decline the
 * prompt on the phone, then post a hand-written success to the callback and
 * collect the papers without paying.
 *
 * Nothing in the payload can close that, because anything Safaricom sends, a
 * buyer can also send. The only thing that cannot be forged is Safaricom's own
 * answer, so the callback is now a hint that a payment may have happened, and
 * this is what decides whether it did.
 */
export async function stkQuery(checkoutRequestId: string): Promise<StkQueryResult> {
    const config = getMpesaConfig();
    if (!config) throw new Error('M-Pesa is not configured');

    const timestamp = mpesaTimestamp();
    const password = Buffer.from(`${config.shortcode}${config.passkey}${timestamp}`).toString('base64');
    const token = await getAccessToken(config);

    const res = await fetch(`${apiBase(config.env)}/mpesa/stkpushquery/v1/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            BusinessShortCode: config.shortcode,
            Password: password,
            Timestamp: timestamp,
            CheckoutRequestID: checkoutRequestId,
        }),
        cache: 'no-store',
    });

    const body = (await res.json()) as Record<string, string>;
    if (!res.ok) {
        throw new Error(body.errorMessage || body.ResponseDescription || `M-Pesa query failed (${res.status})`);
    }
    if (body.ResultCode === undefined) {
        throw new Error('M-Pesa query returned no result code');
    }

    return { resultCode: Number(body.ResultCode), resultDesc: String(body.ResultDesc || '') };
}

export interface StkPushResult {
    checkoutRequestId: string;
    merchantRequestId: string;
    customerMessage: string;
}

/**
 * Sends the payment prompt to the buyer's phone.
 * `amount` is in whole shillings — Daraja does not accept cents.
 */
export async function stkPush(opts: {
    phone: string;
    amountCents: number;
    reference: string;
    description: string;
}): Promise<StkPushResult> {
    const config = getMpesaConfig();
    if (!config) throw new Error('M-Pesa is not configured');

    const phone = normalisePhone(opts.phone);
    if (!phone) throw new Error('Enter a valid Safaricom number, e.g. 0712345678');

    const amount = Math.max(1, Math.ceil(opts.amountCents / 100));
    const timestamp = mpesaTimestamp();
    const password = Buffer.from(`${config.shortcode}${config.passkey}${timestamp}`).toString('base64');
    const token = await getAccessToken(config);

    const res = await fetch(`${apiBase(config.env)}/mpesa/stkpush/v1/processrequest`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(
            stkPayload(config, {
                phone,
                amount,
                timestamp,
                password,
                reference: opts.reference,
                description: opts.description,
            })
        ),
        cache: 'no-store',
    });

    const body = (await res.json()) as Record<string, string>;
    if (!res.ok || body.ResponseCode !== '0') {
        throw new Error(body.errorMessage || body.ResponseDescription || 'M-Pesa request failed');
    }

    return {
        checkoutRequestId: body.CheckoutRequestID,
        merchantRequestId: body.MerchantRequestID,
        customerMessage: body.CustomerMessage || 'Check your phone to complete payment',
    };
}
