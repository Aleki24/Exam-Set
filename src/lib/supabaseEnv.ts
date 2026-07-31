/**
 * WHERE THE SUPABASE CREDENTIALS COME FROM
 * ----------------------------------------------------------------------------
 * There is more than one name in circulation for the same public key, and which
 * one you get depends on how the project was wired up:
 *
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY  what this repo started with
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY          current Supabase naming
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY                 what the Vercel integration sets
 *
 * Accepting all three matters because the failure mode of picking wrong is
 * brutal and silent: every Supabase client in the app — sign in, sign up, the
 * question bank, the shop — is constructed from these two values, so a name
 * mismatch takes the whole product down at once while the pages still render
 * perfectly. Reading all three is free; guessing costs a day.
 *
 * Each name is spelled out literally rather than looked up from an array,
 * because Next.js only inlines NEXT_PUBLIC_* into the browser bundle when it can
 * see the full `process.env.NAME` expression at build time. A dynamic lookup
 * would compile to undefined in the browser and reintroduce the exact bug this
 * file exists to prevent.
 */

/**
 * The project URL — cleaned up, and only returned if it is actually usable.
 *
 * A value can be present and still be wrong, and the Supabase client rejects it
 * with "Invalid supabaseUrl" from deep inside the library. During a build that
 * aborts the whole deployment on a prerendered page, which is a long way from
 * the real cause: a pasted environment variable.
 *
 * Two things are forgiven, because they are what people actually paste:
 * surrounding quotes or whitespace, and a bare host with no scheme
 * (`abc.supabase.co`). Anything still not parseable is treated as not
 * configured, so callers degrade instead of throwing.
 */
export function supabaseUrl(): string | undefined {
    const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!raw) return undefined;

    const cleaned = raw.trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');
    if (!cleaned) return undefined;

    const withScheme = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;

    try {
        const parsed = new URL(withScheme);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
        if (!parsed.hostname) return undefined;
        return withScheme;
    } catch {
        return undefined;
    }
}

/** The public (anon / publishable) key, under whichever name it was given. */
export function supabaseAnonKey(): string | undefined {
    return (
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        undefined
    );
}

/** True when both values are present and the app can talk to Supabase at all. */
export function supabaseConfigured(): boolean {
    return Boolean(supabaseUrl() && supabaseAnonKey());
}

/**
 * The names that are missing, for error messages and the health check.
 * Only names are ever returned — never a value.
 */
export function missingSupabaseEnv(): string[] {
    const missing: string[] = [];
    if (!supabaseUrl()) missing.push('NEXT_PUBLIC_SUPABASE_URL');
    if (!supabaseAnonKey()) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    return missing;
}

/**
 * Both values, or a thrown error naming exactly what to set.
 *
 * Throwing beats passing `undefined!` into the Supabase constructor: that
 * produced "Invalid URL" or "supabaseKey is required" from somewhere deep in the
 * library, which reads like a bug in the app rather than a blank field in the
 * hosting dashboard.
 */
export function requireSupabaseEnv(): { url: string; key: string } {
    const url = supabaseUrl();
    const key = supabaseAnonKey();

    if (!url || !key) {
        throw new Error(
            `Supabase is not configured — missing ${missingSupabaseEnv().join(' and ')}. ` +
                'Set it in your hosting environment variables and redeploy.'
        );
    }

    return { url, key };
}
