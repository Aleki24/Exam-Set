'use client';

import { createClient } from './client';
import { isSessionRejected } from './authFailure';

/**
 * RECOVERING FROM A SESSION THAT CANNOT ANSWER
 * ----------------------------------------------------------------------------
 * supabase-js serialises token refresh behind a Web Lock. A stored session that
 * has expired triggers a refresh on the first call of a page, and every other
 * authenticated call queues behind it. When that refresh cannot complete — a
 * request dropped on a mobile network, a refresh token the server has since
 * rejected — the lock is never released and everything behind it waits for
 * ever. Not an error. Silence.
 *
 * That single failure produced three separate-looking bugs on this app: the
 * setter hung on "Loading bank…", sign-out sat on "Signing out…", and the owner
 * appeared as an ordinary customer because the profile lookup never returned.
 *
 * WHAT THIS FILE MAY AND MAY NOT DO
 * ----------------------------------------------------------------------------
 * The first version of this check answered the hang by throwing the session away
 * whenever it failed to answer within eight seconds. That fixed the freeze and
 * introduced a worse bug: it signed people out for having a slow connection.
 *
 * Eight seconds is not long on a phone. A backgrounded tab, a lift, a tunnel, a
 * radio waking from idle — any of these outlast it. Worse, the check is slowest
 * in precisely the case where the session is *fine*: an access token that has
 * just expired makes `getUser()` queue behind a token refresh, so the one moment
 * a healthy session takes a while to answer is the moment it is being renewed.
 * The timeout was landing on renewals and calling them deaths, which is how
 * someone signs in and is signed out minutes later without touching anything.
 *
 * So the ceiling stayed and the punishment went. A session is discarded only
 * when the auth server has actually rejected it. A timeout is reported to the
 * caller and nothing more — the hang this was invented to prevent is already
 * fixed at its source, since public reads now go through a session-free client
 * (see `publicClient`) and no longer queue behind auth at all. There is nothing
 * left for a slow session to freeze, so there is nothing to justify killing it.
 */

/** Expires the Supabase cookies directly, for when the SDK itself is stuck. */
export function clearSupabaseCookies(): void {
    if (typeof document === 'undefined') return;

    for (const entry of document.cookie.split(';')) {
        const name = entry.split('=')[0]?.trim();
        if (!name || !name.startsWith('sb-')) continue;

        const expiry = 'Thu, 01 Jan 1970 00:00:00 GMT';
        // Every path and domain combination the cookie might carry — a mismatch
        // leaves it alive and the sign-out silently undone.
        document.cookie = `${name}=; expires=${expiry}; path=/`;
        document.cookie = `${name}=; expires=${expiry}; path=/; domain=${location.hostname}`;
        document.cookie = `${name}=; expires=${expiry}; path=/; domain=.${location.hostname}`;
    }
}

/** Also drop anything the SDK kept in local storage. */
export function clearSupabaseStorage(): void {
    if (typeof localStorage === 'undefined') return;
    try {
        for (const key of Object.keys(localStorage)) {
            if (key.startsWith('sb-') || key.includes('supabase.auth')) {
                localStorage.removeItem(key);
            }
        }
    } catch {
        // Storage can be unavailable in private browsing. Nothing to do.
    }
}

export interface SessionHealth {
    /** True when the server rejected the session and it has been discarded. */
    cleared: boolean;
    /**
     * `rejected`    — the server ruled the session invalid; it is gone.
     * `unreachable` — the check could not complete. The session is untouched and
     *                 may be perfectly good; carry on as before.
     */
    reason?: 'unreachable' | 'rejected';
}

const CHECK_TIMEOUT_MS = 15000;

/**
 * Verifies the stored session can still be used, and discards it if — and only
 * if — the server says it cannot.
 *
 * Never revokes anything server-side, so a session cleared here costs one
 * sign-in on this device and nothing on any other.
 */
export async function ensureUsableSession(): Promise<SessionHealth> {
    let supabase: ReturnType<typeof createClient>;
    try {
        supabase = createClient();
    } catch {
        // Not configured. Nothing to validate and nothing to clear.
        return { cleared: false };
    }

    // No cookie means no session to be stuck on.
    const hasCookie =
        typeof document !== 'undefined' &&
        document.cookie.split(';').some((c) => c.trim().startsWith('sb-'));
    if (!hasCookie) return { cleared: false };

    const timedOut = Symbol('timeout');

    let outcome: unknown;
    try {
        outcome = await Promise.race([
            supabase.auth.getUser(),
            new Promise((resolve) => setTimeout(() => resolve(timedOut), CHECK_TIMEOUT_MS)),
        ]);
    } catch (err) {
        // A thrown error still counts if it is the server's answer.
        if (isSessionRejected(err)) {
            await discard();
            console.warn('Stored session was rejected by the server; it has been cleared.');
            return { cleared: true, reason: 'rejected' };
        }
        return { cleared: false, reason: 'unreachable' };
    }

    if (outcome === timedOut) {
        // Slow, not dead — and leaving it alone is the whole point. This is what
        // a healthy session looks like while its token is being refreshed.
        console.warn('Session check did not answer in time; leaving the session in place.');
        return { cleared: false, reason: 'unreachable' };
    }

    const result = outcome as Awaited<ReturnType<typeof supabase.auth.getUser>>;

    if (result?.error) {
        if (!isSessionRejected(result.error)) {
            console.warn('Session check could not reach the auth server:', result.error.message);
            return { cleared: false, reason: 'unreachable' };
        }
        await discard();
        console.warn('Stored session was rejected by the server; it has been cleared.');
        return { cleared: true, reason: 'rejected' };
    }

    // No error and no user is the server answering "nobody is signed in". That
    // is a verdict, not a silence.
    if (!result?.data?.user) {
        await discard();
        return { cleared: true, reason: 'rejected' };
    }

    return { cleared: false };

    async function discard() {
        // Waited on, unlike before — letting the SDK finish first stops it
        // writing a session back into storage that has just been emptied.
        //
        // But waited on with a ceiling, because `signOut` takes the same lock a
        // stuck refresh may be holding, and this must not become another thing
        // that hangs. If the ceiling wins, the manual clear below is what decides
        // whether the next request carries a dead token, and it always runs.
        await Promise.race([
            supabase.auth.signOut({ scope: 'local' }).catch(() => undefined),
            new Promise((resolve) => setTimeout(resolve, 2000)),
        ]);

        clearSupabaseCookies();
        clearSupabaseStorage();
    }
}
