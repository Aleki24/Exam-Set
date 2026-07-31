import { createBrowserClient } from "@supabase/ssr";
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
 */
export const createClient = () => {
    const { url, key } = requireSupabaseEnv();
    return createBrowserClient(url, key);
};
