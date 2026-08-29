/**
 * PROVING YOU PLACED AN ORDER, WITHOUT AN ACCOUNT
 * ----------------------------------------------------------------------------
 * A buyer who pays without signing in still has to be able to download what
 * they just paid for. This is the narrowest thing that lets them: a signed
 * token naming one order, held in an httpOnly cookie, that proves the holder is
 * the person who placed it.
 *
 * It is deliberately not a session. A session says "you are this user" and
 * opens their whole library; this says "you placed order 47" and opens the
 * papers on order 47. That distinction is the entire security argument for
 * guest checkout here.
 *
 * The reason it has to be so narrow: on WhatsApp a phone number is proven by
 * the message arriving from it, but a number typed into a web form proves
 * nothing at all. If typing a number signed you in, anyone could type a
 * returning buyer's number and walk off with the papers they paid for. So the
 * account behind the number is still created and still collects the
 * entitlement — a buyer who later signs in properly finds everything waiting —
 * but the browser never gets to act as that account on the strength of a typed
 * number.
 *
 * The paywall itself is untouched. `can_download_paper` still decides; this
 * only answers the earlier question of who is asking.
 */

import { createHmac, timingSafeEqual } from 'crypto';

/** How long a guest can download what they bought without signing in. */
export const ORDER_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const ORDER_TOKEN_COOKIE = 'sb_order_access';

/**
 * The signing key.
 *
 * Falls back to the service role key, which is server-only and always present
 * wherever orders are created, so guest checkout does not need a new secret
 * configured before it works. `ORDER_TOKEN_SECRET` overrides it for anyone who
 * would rather the two rotate independently.
 *
 * Returns null rather than a default when neither exists. A token signed with a
 * predictable key is worse than no token, because it looks like proof.
 */
export function orderTokenSecret(): string | null {
    return process.env.ORDER_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

function sign(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('base64url');
}

/**
 * A token naming one order and the moment it stops being valid.
 *
 * The expiry is inside the signed payload rather than trusted from the cookie,
 * so a buyer cannot extend their own access by editing it.
 */
export function signOrderToken(
    orderId: string,
    secret: string,
    now: number = Date.now()
): string {
    const payload = `${orderId}.${now + ORDER_TOKEN_TTL_MS}`;
    return `${payload}.${sign(payload, secret)}`;
}

/**
 * The order a token vouches for, or null.
 *
 * Null for anything that is not exactly right: wrong shape, wrong signature,
 * expired, tampered. There is no partial credit and no error detail — a caller
 * only needs to know whether to open the file.
 */
export function verifyOrderToken(
    token: string | null | undefined,
    secret: string,
    now: number = Date.now()
): string | null {
    if (!token) return null;

    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [orderId, expiresAt, provided] = parts;
    if (!orderId || !expiresAt || !provided) return null;

    const expected = sign(`${orderId}.${expiresAt}`, secret);

    // Compared as bytes of equal length, so a wrong signature costs the same
    // time as a right one and cannot be discovered a character at a time.
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const expiry = Number(expiresAt);
    if (!Number.isFinite(expiry) || expiry <= now) return null;

    return orderId;
}
