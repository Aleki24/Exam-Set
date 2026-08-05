/**
 * Where an emailed auth link should land.
 *
 * Supabase does not simply use whatever `emailRedirectTo` it is handed. GoTrue
 * checks the value against the project's Redirect URLs allow-list, and when it
 * does not match it silently substitutes the project's Site URL instead. So a
 * link that "goes to localhost" is never a bug in the email — it is this app
 * sending an origin the project has not been told to allow, and Supabase
 * falling back to a Site URL that is still the development default.
 *
 * Using `window.location.origin` makes that mismatch easy to hit: preview
 * deployments get a new hostname on every push, and `example.com` and
 * `www.example.com` are two different origins as far as the allow-list is
 * concerned. `NEXT_PUBLIC_BASE_URL` is already the site's declared canonical
 * origin — the same value the sitemap and the M-Pesa callback are built from —
 * so preferring it means there is exactly one origin to allow-list, and it is
 * one already written down.
 *
 * The browser origin remains the fallback, which keeps `next dev` working for
 * anyone who has not set the variable.
 */
function authOrigin(): string {
    const configured = process.env.NEXT_PUBLIC_BASE_URL?.trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');
    if (configured) return configured;
    if (typeof window !== 'undefined') return window.location.origin;
    return '';
}

/**
 * The full callback URL to hand to `signUp`, `resend` or `resetPasswordForEmail`.
 *
 * @param next Path to forward to once the link has been verified. Must be a
 *             site-relative path; anything else is ignored by the callback.
 */
export function authCallbackUrl(next?: string): string {
    const base = `${authOrigin()}/auth/callback`;
    if (!next) return base;
    return `${base}?next=${encodeURIComponent(next)}`;
}
