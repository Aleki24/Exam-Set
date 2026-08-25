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

/**
 * How long to wait for the auth server before giving up on it.
 *
 * `getClaims` is usually local, but renewing an expired token is a real request
 * — and a request that hangs rather than fails has no deadline of its own. This
 * ran without one, and production logs show the consequence: two requests held
 * until Vercel killed the function with "did not return an initial response
 * within 25s". A middleware timeout is a blank page on every route, because the
 * matcher puts this in front of all of them.
 *
 * Five seconds is far longer than a healthy renewal and far short of the
 * platform's ceiling, so the fail-open path below gets to run instead.
 */
const CLAIMS_TIMEOUT_MS = 5000;

/** Marker for "nobody answered in time" — deliberately shaped as a non-verdict. */
class ClaimsTimeoutError extends Error {
    /*
     * No `status` and no `code`, so `isSessionRejected` falls through to its
     * status rule, reads the absent status as 0, and returns false. A timeout
     * must never be mistaken for the server rejecting the session: that would
     * turn a slow network into a sign-out.
     */
    constructor(ms: number) {
        super(`Timed out after ${ms}ms waiting to verify the session`);
        this.name = 'ClaimsTimeoutError';
    }
}

/** Verifies the request's access token and returns its claims. Never throws. */
export async function readVerifiedClaims(
    supabase: SupabaseClient,
    timeoutMs: number = CLAIMS_TIMEOUT_MS
): Promise<ClaimsResult> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
        const verdict = supabase.auth.getClaims();

        // The losing promise is not cancellable, so swallow its eventual result
        // rather than leaving an unhandled rejection behind on a slow answer.
        void Promise.resolve(verdict).catch(() => undefined);

        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new ClaimsTimeoutError(timeoutMs)), timeoutMs);
        });

        const { data, error } = await Promise.race([verdict, timeout]);
        return { claims: (data?.claims as VerifiedClaims) ?? null, error: error ?? null };
    } catch (thrown) {
        // Either a local verdict — the token is expired, malformed or unsigned,
        // and no retry will produce one — or the timeout above. They are returned
        // the same way and told apart by `isSessionRejected`.
        return { claims: null, error: thrown };
    } finally {
        clearTimeout(timer);
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
