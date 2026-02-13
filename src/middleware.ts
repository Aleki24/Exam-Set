import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'
import { createServerClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;

if (!supabaseUrl || !supabaseKey) {
    console.warn('Missing Supabase environment variables in middleware. This may cause runtime errors.');
}

export async function middleware(request: NextRequest) {
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

    // Protected routes - require authentication
    const isProtectedRoute = pathname.startsWith('/app') || pathname.startsWith('/admin')

    if (isProtectedRoute) {
        const supabase = createSupabase()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            // Not logged in - redirect to home page (landing)
            return NextResponse.redirect(new URL('/', request.url))
        }
    }

    // Redirect authenticated users away from auth pages to main app
    if (pathname.startsWith('/auth') && !pathname.includes('/callback')) {
        const supabase = createSupabase()
        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
            // Already logged in - redirect to main app
            return NextResponse.redirect(new URL('/app', request.url))
        }
    }

    return response
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
