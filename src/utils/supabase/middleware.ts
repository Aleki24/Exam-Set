import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { requireSupabaseEnv } from "@/lib/supabaseEnv";

/**
 * THE MIDDLEWARE'S HALF OF THE SESSION
 * ----------------------------------------------------------------------------
 * Every request that reaches a page passes through here, and asking the auth
 * server who the user is has a side effect: when the access token has expired,
 * the asking *renews* it. Renewal rotates the refresh token — the old one is
 * spent the moment the new one is issued — so the new pair has to reach the
 * browser, or the browser is left holding a token the server has retired.
 *
 * That is the whole reason `applyAuthCookies` exists. `NextResponse.redirect()`
 * builds a brand-new response, so anything written onto the response this helper
 * returns is simply not on it. A request that both renewed the token and then
 * redirected — a signed-in user landing on `/auth/login`, an expired token on
 * `/library` — used to send the redirect and drop the renewal on the floor. The
 * browser carried on with the spent token until its next refresh, the server
 * refused that as a replayed token, and the user was signed out: minutes after
 * signing in, having done nothing to cause it.
 *
 * Every response leaving the middleware must therefore carry these cookies,
 * redirects included.
 */
export interface SessionContext {
    supabase: SupabaseClient;
    /** The pass-through response, already carrying any renewed cookies. */
    response: NextResponse;
    /** Copies renewed auth cookies onto another response — redirects, mainly. */
    applyAuthCookies: <T extends NextResponse>(target: T) => T;
}

export function createMiddlewareClient(request: NextRequest): SessionContext {
    const { url: supabaseUrl, key: supabaseKey } = requireSupabaseEnv();

    let supabaseResponse = NextResponse.next({
        request: {
            headers: request.headers,
        },
    });

    // Kept so a redirect can be given the same cookies the pass-through response
    // would have carried.
    const renewed: { name: string; value: string; options?: Record<string, unknown> }[] = [];

    const supabase = createServerClient(
        supabaseUrl,
        supabaseKey,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) => {
                        renewed.push({ name, value, options: options as Record<string, unknown> })
                        supabaseResponse.cookies.set(name, value, options)
                    })
                },
            },
        },
    );

    return {
        supabase,
        // A getter, because `setAll` replaces `supabaseResponse` when a renewal
        // happens — reading it eagerly would hand back the response from before.
        get response() {
            return supabaseResponse;
        },
        applyAuthCookies<T extends NextResponse>(target: T): T {
            for (const { name, value, options } of renewed) {
                target.cookies.set(name, value, options as never);
            }
            return target;
        },
    };
}

/**
 * Refreshes the session if it has expired — required for Server Components.
 * https://supabase.com/docs/guides/auth/server-side/nextjs
 */
export const updateSession = async (request: NextRequest) => {
    const context = createMiddlewareClient(request);
    await context.supabase.auth.getUser();
    return context.response;
};
