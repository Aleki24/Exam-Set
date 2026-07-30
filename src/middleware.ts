import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'
import { createServerClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;

if (!supabaseUrl || !supabaseKey) {
    console.warn('Missing Supabase environment variables in middleware. This may cause runtime errors.');
}

export async function middleware(request: NextRequest) {
    try {
        // If env vars are missing, skip middleware to prevent crash
        if (!supabaseUrl || !supabaseKey) {
            return NextResponse.next();
        }

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
