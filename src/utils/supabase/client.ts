import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseEnv } from "@/lib/supabaseEnv";

/**
 * The browser client. Everything the user does without a page load goes through
 * this: signing in, loading the question bank, browsing the shop.
 *
 * It throws when the environment is not configured rather than constructing a
 * client around `undefined`. A client built on undefined fails later, somewhere
 * else, with a message that points at the wrong thing — and since the same two
 * values back auth and data alike, "sign in is broken" and "the bank is empty"
 * turn out to be one missing variable wearing two disguises.
 *
 * ONE CLIENT PER TAB, AND WHY THAT IS NOT A MICRO-OPTIMISATION
 * ----------------------------------------------------------------------------
 * This used to build a fresh client on every call, and every call site took it
 * at its word: `examService` calls it seven times, `tagService` fourteen,
 * `examSessionService` eleven — once inside each exported function, so a client
 * was constructed per *query*. A few minutes of ordinary use produced dozens.
 *
 * Each one is a full auth client. Each keeps its own in-memory copy of the
 * session and starts its own token-refresh timer. Refresh tokens are single-use
 * and rotate: the first client to refresh invalidates the token every other
 * client is still holding. The next one to wake up presents that spent token,
 * the server sees a replayed token — which is exactly what a stolen one looks
 * like — and revokes the whole session family as a precaution. Every client then
 * reports SIGNED_OUT at once.
 *
 * From the user's side: they sign in, use the app for a few minutes, and are
 * signed out without having touched anything. Nothing anywhere reads as an
 * error, because from the server's side this was a defence working correctly
 * against an app attacking itself.
 *
 * One client per tab means one holder of the refresh token and one timer, so
 * there is no second client left holding a token to replay. Call sites need not
 * change — they still call `createClient()` wherever they need it, and now share
 * the instance.
 *
 * Deliberately only cached in the browser. On the server every request must stay
 * isolated, and a module-level cache is shared across every request the process
 * handles — one visitor's session would leak into the next. Server code should
 * be using `utils/supabase/server` regardless; this guard is here so that an
 * accidental import cannot quietly become a cross-request session leak.
 */
let browserClient: SupabaseClient | null = null;

export const createClient = (): SupabaseClient => {
    const { url, key } = requireSupabaseEnv();

    if (typeof window === 'undefined') return createBrowserClient(url, key);

    if (!browserClient) browserClient = createBrowserClient(url, key);
    return browserClient;
};

/**
 * Forgets the cached client.
 *
 * Only for sign-out, where the point is that the next call starts from nothing.
 * A client that has already loaded a session keeps serving it from memory, so
 * reusing it after the cookies are gone is how a signed-out user goes on being
 * shown as signed in until the page is reloaded.
 */
export const resetClient = (): void => {
    browserClient = null;
};
