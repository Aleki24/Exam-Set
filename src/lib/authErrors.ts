/**
 * TURNING AUTH FAILURES INTO SENTENCES PEOPLE CAN ACT ON
 * ----------------------------------------------------------------------------
 * Supabase reports configuration faults, developer mistakes and ordinary user
 * errors through the same channel, in the same shape. Passed straight to the
 * screen that produces things like:
 *
 *   "PKCE code verifier not found in storage. This can happen if the auth flow
 *    was initiated in a different browser or device... For SSR frameworks
 *    (Next.js, SvelteKit, etc.), use @supabase/ssr on both the server and
 *    client to store the code verifier in cookies."
 *
 * A teacher cannot do anything with that, and it leaks the stack we run on. The
 * mapping below keeps the part that tells them what to do next and drops the
 * part addressed to whoever wrote the app.
 *
 * Anything unrecognised is passed through unchanged rather than replaced with a
 * generic apology: an unhelpful specific message still beats "an error
 * occurred" when somebody has to report the problem.
 */

export function friendlyAuthError(message: string | null | undefined): string {
    if (!message) return 'Something went wrong. Please try again.';
    const m = message.toLowerCase();

    // A link opened on a different device from the one that requested it. Very
    // common: requested on a laptop, link tapped in a phone's mail app.
    if (m.includes('code verifier') || m.includes('code challenge')) {
        return 'Open the link on the same device and browser you asked for it from. If that is not possible, request a new one here.';
    }

    if (m.includes('invalid login credentials')) {
        return 'That email and password do not match an account. Check them, or reset your password below.';
    }
    if (m.includes('email not confirmed') || m.includes('not confirmed')) {
        return 'This account has not been confirmed yet. Check your inbox for the link, or send it again below.';
    }
    if (m.includes('already registered') || m.includes('already been registered')) {
        return 'That email already has an account. Sign in instead, or reset the password.';
    }
    if (m.includes('expired') || m.includes('otp_expired')) {
        return 'That link has expired. Links last one hour and can only be used once — request a new one.';
    }
    if (m.includes('token has invalid claims') || m.includes('invalid token') || m.includes('bad_jwt')) {
        return 'That link is not valid any more. Request a new one.';
    }
    if (m.includes('rate limit') || m.includes('too many') || m.includes('over_email_send_rate_limit')) {
        return 'Too many attempts just now. Wait a few minutes and try again.';
    }
    if (m.includes('password should be') || m.includes('weak password')) {
        return 'That password is too weak. Use at least 8 characters.';
    }
    if (m.includes('same as the old') || m.includes('should be different')) {
        return 'The new password must be different from your current one.';
    }
    if (m.includes('user not found')) {
        return 'No account was found for that email address.';
    }
    if (m.includes('signups not allowed') || m.includes('signup is disabled')) {
        return 'New accounts are not being accepted at the moment.';
    }

    // Network and upstream faults, including the JSON parse error you get when
    // the auth host cannot be reached at all and an HTML error page comes back
    // where JSON was expected.
    if (
        m.includes('is not valid json') ||
        m.includes('fetch failed') ||
        m.includes('network') ||
        m.includes('econnrefused') ||
        m.includes('host not in allowlist')
    ) {
        return 'We could not reach the sign-in service. Check your connection and try again in a moment.';
    }

    if (m.includes('database error')) {
        return 'The account could not be created because of a problem on our side, not with what you typed.';
    }

    return message;
}

/**
 * Same-site paths only.
 *
 * `next` travels through the user's inbox on every emailed link, so it is
 * attacker-controllable: anyone who can trigger a signup or reset email chooses
 * its value. A leading `//` is rejected specifically because `https://site` +
 * `//evil.com` is a protocol-relative URL — it leaves the site entirely while
 * looking like a same-site path, which is exactly the shape a reviewer skims
 * past.
 */
export function safeNext(raw: string | null | undefined, fallback = '/'): string {
    if (!raw) return fallback;
    if (!raw.startsWith('/')) return fallback;
    if (raw.startsWith('//')) return fallback;
    // Backslashes are treated as forward slashes by some browsers, so `/\evil.com`
    // can also escape the origin.
    if (raw.startsWith('/\\')) return fallback;
    return raw;
}
