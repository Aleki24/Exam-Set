import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * READING A VERIFIED TOKEN WITHOUT A ROUND TRIP
 * ----------------------------------------------------------------------------
 * `getUser()` asks the auth server who this is, every single time it is called.
 * `getClaims()` verifies the token's signature against the project's public keys
 * — fetched once per process and cached — and reads the answer out of the token.
 * Same guarantee that the token is genuine, without the network.
 *
 * On a project still signing with the legacy shared secret there is no public
 * key to verify against, and the SDK falls back to `getUser()` by itself. So
 * every caller of this is safe before the project switches to asymmetric signing
 * keys, and gets faster when it does, with nothing to change here.
 *
 * WHY THIS WRAPPER EXISTS
 *
 * `getUser()` reports every failure as a returned `error`. `getClaims()` does
 * not: failures it reaches *locally* — an expired token, one with no `exp`, one
 * that will not decode — are thrown, because they are not auth errors from the
 * server, they are ordinary exceptions. A caller that only handled the returned
 * error would be fine in testing, where tokens are fresh, and would throw out of
 * the middleware in production, where they are not.
 *
 * So this returns them the way the rest of the auth code already expects to read
 * them: a value and an error, never a throw. `isSessionRejected` then decides
 * which of the two kinds of failure it is, as it does everywhere else.
 */

export interface VerifiedClaims {
    /** The user id. Present on every genuine token. */
    sub?: string;
    email?: string;
    [claim: string]: unknown;
}

export interface ClaimsResult {
    claims: VerifiedClaims | null;
    /** Null when there is simply nobody signed in. */
    error: unknown;
}

/** Verifies the request's access token and returns its claims. Never throws. */
export async function readVerifiedClaims(supabase: SupabaseClient): Promise<ClaimsResult> {
    try {
        const { data, error } = await supabase.auth.getClaims();
        return { claims: (data?.claims as VerifiedClaims) ?? null, error: error ?? null };
    } catch (thrown) {
        // A local verdict: the token is expired, malformed or unsigned. There is
        // no session here, and no retry will produce one.
        return { claims: null, error: thrown };
    }
}

/** The user id on a set of verified claims, or null. */
export function claimedUserId(claims: VerifiedClaims | null): string | null {
    return typeof claims?.sub === 'string' && claims.sub ? claims.sub : null;
}

/** The email on a set of verified claims, or null. */
export function claimedEmail(claims: VerifiedClaims | null): string | null {
    return typeof claims?.email === 'string' && claims.email ? claims.email : null;
}
