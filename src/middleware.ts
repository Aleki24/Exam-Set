import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'
import { createServerClient } from '@supabase/ssr'
import { missingSupabaseEnv, supabaseAnonKey, supabaseConfigured, supabaseUrl as resolveUrl } from '@/lib/supabaseEnv'

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

        const supabaseUrl = resolveUrl()!;
        const supabaseKey = supabaseAnonKey()!;

        // Update session first
        const response = await updateSession(request)

        const pathname = request.nextUrl.pathname

        // Create supabase client for auth check
        const createSupabase = () => createServerClient(
            supabaseUrl,
            supabaseKey,
            {
                cookies: {
                    getAll() {
                        return request.cookies.getAll()
                    },
                    setAll(cookiesToSet) {
                        cookiesToSet.forEach(({ name, value, options }) => {
                            response.cookies.set(name, value, options)
                        })
                    },
                },
            }
        )

        // The shop (/ and /papers) and the setter (/set) are open to everyone —
        // browsing is how the platform sells. Only the pages tied to a specific
        // account need a session.
        const isProtectedRoute =
            pathname.startsWith('/library') ||
            pathname.startsWith('/admin') ||
            pathname.startsWith('/exam/')

        if (isProtectedRoute) {
            const supabase = createSupabase()
            const { data: { user } } = await supabase.auth.getUser()

            if (!user) {
                // Send them to sign in, then straight back to where they were.
                const login = new URL('/auth/login', request.url)
                login.searchParams.set('next', pathname)
                return NextResponse.redirect(login)
            }
        }

        // Signed-in users have no business on the auth pages.
        if (pathname.startsWith('/auth') && !pathname.includes('/callback')) {
            const supabase = createSupabase()
            const { data: { user } } = await supabase.auth.getUser()

            if (user) {
                const next = request.nextUrl.searchParams.get('next')
                return NextResponse.redirect(new URL(next && next.startsWith('/') ? next : '/', request.url))
            }
        }

        return response
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
