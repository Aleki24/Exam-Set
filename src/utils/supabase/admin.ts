import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role client. Server-only.
 *
 * Used solely for confirming payments (the M-Pesa callback has no user session)
 * and for admin actions. Never import this into a client component — the key
 * bypasses row level security.
 */
export function createAdminClient(): SupabaseClient | null {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) return null;

    return createSupabaseClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}
