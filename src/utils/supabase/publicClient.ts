import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireSupabaseEnv } from '@/lib/supabaseEnv';

/**
 * A browser client with no session attached.
 *
 * The question bank and the paper catalogue are readable by anyone — row level
 * security says so, and the shop lists them before sign-in. Reading them through
 * the *authenticated* client makes them hostage to the session anyway, and that
 * is not a theoretical concern:
 *
 * supabase-js serialises token refresh behind a Web Lock. When a stored session
 * has expired, the first call on a page triggers a refresh, and every other call
 * queues behind it. If that refresh stalls — a dropped request on a mobile
 * network, an invalidated refresh token — the lock is never released and every
 * subsequent query waits for ever. Not an error, not a rejection: silence. That
 * is how the setter came to sit on "Loading bank…" indefinitely while the data
 * behind it was public and perfectly readable.
 *
 * So public reads get their own client: no session, no refresh, no lock, nothing
 * to queue behind. It cannot see anything an anonymous visitor could not, which
 * is exactly the point — a broken session can no longer take the catalogue down
 * with it.
 *
 * Anything that depends on who you are must still use `utils/supabase/client`.
 */
let cached: SupabaseClient | null = null;

export function publicBrowserClient(): SupabaseClient {
    if (cached) return cached;

    const { url, key } = requireSupabaseEnv();
    cached = createSupabaseClient(url, key, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
    });

    return cached;
}
