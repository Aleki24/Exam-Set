import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role client. Server-only.
 *
 * Used solely for confirming payments (the M-Pesa callback has no user session)
 * and for admin actions. Never import this into a client component — the key
 * bypasses row level security.
 */
/**
 * Which variable is missing, or null when the client can be built.
 *
 * Callers used to answer "Server is not configured for this", which is true and
 * useless: it names neither the variable nor the place to set it, and the same
 * sentence covers two different mistakes. A person reading it has no next step.
 */
export function adminClientMissing(): string | null {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return 'NEXT_PUBLIC_SUPABASE_URL';
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return 'SUPABASE_SERVICE_ROLE_KEY';
    return null;
}

/** The sentence to show a person when the client cannot be built. */
export function adminClientMissingMessage(): string {
    const name = adminClientMissing();
    if (!name) return '';
    return (
        `${name} is not set on this deployment, so this action cannot run. ` +
        'Add it in Vercel under Settings → Environment Variables, then redeploy. ' +
        (name === 'SUPABASE_SERVICE_ROLE_KEY'
            ? 'Find it in Supabase under Project Settings → API → service_role. It is server-only — never expose it to the browser.'
            : '')
    ).trim();
}

export function createAdminClient(): SupabaseClient | null {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) return null;

    return createSupabaseClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}
