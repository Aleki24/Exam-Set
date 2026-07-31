import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * Where the confirmation link in an email lands.
 *
 * The `next` parameter travels through the user's inbox, which means it is
 * attacker-controllable: anyone who can trigger a signup email chooses its
 * value. Only same-site paths are honoured, and a leading `//` is rejected
 * because `https://site` + `//evil.com` is a protocol-relative URL that leaves
 * the site entirely while looking like it stayed.
 */
function safeNext(raw: string | null): string {
    if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
    return raw;
}

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const next = safeNext(searchParams.get('next'));

    // Supabase reports a rejected or expired link here rather than as a failed
    // exchange, so the reason is worth carrying back to the sign-in page.
    const errorDescription = searchParams.get('error_description');
    if (errorDescription) {
        return NextResponse.redirect(
            `${origin}/auth/login?error=${encodeURIComponent(errorDescription)}`
        );
    }

    if (code) {
        const supabase = await createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (!error) {
            return NextResponse.redirect(`${origin}${next}`);
        }

        return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(error.message)}`);
    }

    return NextResponse.redirect(
        `${origin}/auth/login?error=${encodeURIComponent('That confirmation link is no longer valid. Sign in to send a new one.')}`
    );
}
