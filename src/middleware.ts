import { type NextRequest, NextResponse } from 'next/server'
import { createMiddlewareClient } from '@/utils/supabase/middleware'
import { authErrorMessage, isSessionRejected } from '@/utils/supabase/authFailure'
import { claimedUserId, readVerifiedClaims } from '@/utils/supabase/claims'
import { missingSupabaseEnv, supabaseConfigured } from '@/lib/supabaseEnv'

export async function middleware(request: NextRequest) {
    try {
        // Nothing here can work without credentials. Letting the request through
        // means the page renders and fails later in the browser; saying so in the
        // log is the only way this ever gets diagnosed.
        if (!supabaseConfigured()) {
            console.error(
                `Supabase is not configured — missing ${missingSupabaseEnv().join(' and ')}. ` +
                    'Sign-in and every data fetch will fail until this is set.'
            );
            return NextResponse.next();
        }

        // One client, one ask, for the whole request.
        //
        // This used to be three: `updateSession` built a client and asked, then
        // each branch below built another and asked again. Every ask can renew the
        // token, and renewal rotates it — so three asks in one request left room
        // for a later client to present a refresh token an earlier one had already
        // spent. The server treats a replayed refresh token as a stolen one and
        // revokes the whole session family, which is a sign-out nobody asked for
        // and which nothing reports as an error. Asking once removes the race
        // outright, and saves two round trips on every request besides.
        //
        // `getClaims` rather than `getUser`, because this runs on every request
        // that is not a static file and `getUser` is a round trip to the auth
        // server every single time. `getClaims` verifies the token's signature
        // against the project's public keys, cached for the life of the process,
        // and only reaches the network when the token needs renewing.
        //
        // Renewal still happens: `getClaims` reads the session first, and reading
        // an expired session is what refreshes it. That matters more here than
        // anywhere else in the app — refreshing the cookie is most of what this
        // middleware is for, and dropping it would sign everybody out an hour
        // after they arrived.
        //
        // `session` is kept whole rather than destructured: renewing the token
        // replaces the response object, so `session.response` has to be read
        // after the call below, never before it. Pulling it out here would pin
        // the response from before the renewal and send the old cookies.
        const session = createMiddlewareClient(request)
        const { claims, error } = await readVerifiedClaims(session.supabase)
        const user = claimedUserId(claims)

        const pathname = request.nextUrl.pathname

        // Redirects need the renewed cookies copied across by hand: a redirect is
        // a new response and carries none of what was set on `response`. Losing
        // them here means losing the renewal, and a browser left holding the spent
        // token is signed out at its next refresh.
        const redirectTo = (url: URL) => session.applyAuthCookies(NextResponse.redirect(url))

        // The shop (/ and /papers) and the setter (/set) are open to everyone —
        // browsing is how the platform sells. Only the pages tied to a specific
        // account need a session.
        const isProtectedRoute =
            pathname.startsWith('/library') ||
            pathname.startsWith('/admin') ||
            pathname.startsWith('/exam/') ||
            pathname.startsWith('/account') ||
            pathname.startsWith('/home') ||
            pathname.startsWith('/progress') ||
            pathname.startsWith('/teach') ||
            pathname.startsWith('/family')

        // Whether the auth server answered at all. A dropped request says nothing
        // about the session, so it must not be read as "not signed in".
        const unreachable = Boolean(error) && !isSessionRejected(error)

        if (isProtectedRoute) {
            // A network fault is not grounds to throw someone out of a page they
            // are entitled to. Bounce only when there is genuinely no user, or the
            // server has actually rejected the session. If auth simply could not
            // be reached, let the request through — row level security is the real
            // guard and is unaffected by any of this.
            if (!user && !unreachable) {
                // Send them to sign in, then straight back to where they were.
                const login = new URL('/auth/login', request.url)
                login.searchParams.set('next', pathname)
                return redirectTo(login)
            }

            if (unreachable) {
                console.warn(
                    `Could not verify the session for ${pathname}; letting it through. ` +
                        `Row level security still applies. (${authErrorMessage(error)})`
                )
            }
        }

        // Signed-in users have no business on the auth pages — but "signed in"
        // has to mean a session the server actually accepts.
        //
        // The error was previously discarded here, and that turned a stale cookie
        // into a lockout with no way out: tapping "Sign in" bounced straight back
        // to the shop, which reads exactly like a button that does not work, and
        // the one page that could have fixed the session was the page being
        // redirected away from. Sending someone to sign in is only ever helpful
        // if they can arrive.
        // `/auth/reset-password` is exempt: a recovery link signs the user in as
        // its whole mechanism, so the session that proves they may set a new
        // password is the same session this rule would bounce them for having.
        // Redirecting there would make every reset link dead-end on the shop.
        const isAuthPageToGuard =
            pathname.startsWith('/auth') &&
            !pathname.includes('/callback') &&
            !pathname.startsWith('/auth/reset-password');

        if (isAuthPageToGuard) {
            if (!error && user) {
                const next = request.nextUrl.searchParams.get('next')
                return redirectTo(new URL(next && next.startsWith('/') ? next : '/', request.url))
            }

            // Only a session the server has actually rejected gets cleared. The
            // previous version cleared on any error at all, so a signed-in user
            // who opened an auth page during one dropped request had their session
            // deleted for it — the expiries went out with the response, and by the
            // time they noticed, the sign-out they never asked for was done.
            if (error && !unreachable) {
                console.warn('Stale session on an auth page, clearing it:', authErrorMessage(error))
                for (const cookie of request.cookies.getAll()) {
                    if (cookie.name.startsWith('sb-')) session.response.cookies.delete(cookie.name)
                }
            } else if (error) {
                console.warn(
                    'Could not verify the session on an auth page, leaving it alone:',
                    authErrorMessage(error)
                )
            }
        }

        return session.response
    } catch (e) {
        console.error('Middleware error:', e);
        return NextResponse.next();
    }
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
