import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { friendlyAuthError, safeNext } from '@/lib/authErrors';

/**
 * Where every emailed auth link lands: confirmations, invitations and password
 * recovery.
 *
 * Supabase sends these in two different shapes and which one you get depends on
 * how the request was started, so both are handled rather than assuming:
 *
 *   ?code=...                 PKCE. Used when the browser client began the flow
 *                             (signUp, resetPasswordForEmail). Exchanged for a
 *                             session.
 *   ?token_hash=...&type=...  The email-link flow, including links generated
 *                             server-side by an admin. Verified as a one-time
 *                             password.
 *
 * Handling only the first is how a working reset flow still dead-ends for
 * anyone whose link came from the admin console instead of the form.
 */

function loginWithError(origin: string, message: string): NextResponse {
    return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(message)}`);
}

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);

    const code = searchParams.get('code');
    const tokenHash = searchParams.get('token_hash');
    const type = searchParams.get('type') as EmailOtpType | null;

    // A recovery link must end on the page that sets a new password, even if
    // the caller forgot to say so — otherwise the user is silently signed in
    // and dropped on the shop with no idea their reset worked.
    const fallback = type === 'recovery' ? '/auth/reset-password' : '/';
    const next = safeNext(searchParams.get('next'), fallback);

    // Supabase reports a rejected or expired link here rather than as a failed
    // exchange, so the reason is worth carrying back to the sign-in page.
    const errorDescription = searchParams.get('error_description');
    if (errorDescription) {
        return loginWithError(origin, friendlyAuthError(errorDescription));
    }

    const supabase = await createClient();

    if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) return NextResponse.redirect(`${origin}${next}`);
        return loginWithError(origin, friendlyAuthError(error.message));
    }

    if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        if (!error) return NextResponse.redirect(`${origin}${next}`);
        return loginWithError(origin, friendlyAuthError(error.message));
    }

    return loginWithError(
        origin,
        'That link is no longer valid. Links can only be used once and expire after an hour.'
    );
}
