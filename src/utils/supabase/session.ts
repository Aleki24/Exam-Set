'use client';

import { createClient } from './client';

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
 * The cure is to stop waiting and throw the bad session away. Everything the
 * shop and the setter show is readable anonymously, so a cleared session leaves
 * a working site and a prompt to sign in again — which is a great deal better
 * than a spinner that never resolves.
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
function clearSupabaseStorage(): void {
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
    /** True when the session was unusable and has been discarded. */
    cleared: boolean;
    reason?: 'timeout' | 'rejected';
}

const CHECK_TIMEOUT_MS = 8000;

/**
 * Verifies the stored session can still be used, and discards it if not.
 *
 * A timeout counts as a failure: a session that cannot answer within eight
 * seconds is, from the user's side, indistinguishable from one that is broken —
 * and leaving it in place is what blocks every later request.
 *
 * Only ever clears locally. It never revokes anything server-side, so a session
 * dropped here because of a passing network fault costs one sign-in, nothing
 * more.
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
    } catch {
        outcome = timedOut;
    }

    if (outcome === timedOut) {
        discard();
        console.warn('Session check timed out; the stored session has been cleared.');
        return { cleared: true, reason: 'timeout' };
    }

    const result = outcome as Awaited<ReturnType<typeof supabase.auth.getUser>>;
    if (result?.error || !result?.data?.user) {
        discard();
        console.warn('Stored session was rejected; it has been cleared.');
        return { cleared: true, reason: 'rejected' };
    }

    return { cleared: false };

    function discard() {
        // Local scope only, and not awaited — the SDK may be exactly what is
        // stuck, and the cookie and storage removal below is what actually
        // decides whether the next request carries a dead token.
        void supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
        clearSupabaseCookies();
        clearSupabaseStorage();
    }
}
