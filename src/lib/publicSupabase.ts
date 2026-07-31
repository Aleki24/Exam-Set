import { createClient } from '@supabase/supabase-js';
import { supabaseAnonKey, supabaseUrl } from './supabaseEnv';

/**
 * A cookie-free Supabase client for things that run outside a request session:
 * the sitemap, and the metadata generated for each paper page.
 *
 * Uses the publishable key and therefore sees exactly what an anonymous visitor
 * sees — published catalog papers only, enforced by row level security. It can
 * never leak a draft or a teacher's private set.
 */
export function publicSupabase() {
    const url = supabaseUrl();
    const key = supabaseAnonKey();
    // Returns null rather than throwing: a sitemap that comes back short is a
    // better outcome than a build that falls over.
    if (!url || !key) return null;

    try {
        return createClient(url, key, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
    } catch (err) {
        // The sitemap and the per-paper metadata are prerendered, so anything
        // thrown here aborts the deployment rather than degrading one page.
        // Nothing this client does is worth failing a build over.
        console.error('publicSupabase unavailable:', err instanceof Error ? err.message : err);
        return null;
    }
}

/** The site's public origin, used for canonical URLs and the sitemap. */
export function siteUrl(): string {
    const configured = process.env.NEXT_PUBLIC_BASE_URL;
    if (configured) return configured.replace(/\/$/, '');
    // Vercel sets this on every deployment, so the sitemap still works before
    // anyone remembers to set a base URL.
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
        return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
    }
    return 'http://localhost:3000';
}
