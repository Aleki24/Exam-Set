'use client';

/**
 * TELLING SOMEBODY WHY A REQUEST FAILED, ONCE
 * ----------------------------------------------------------------------------
 * Two things went wrong on the screen this file exists because of. A page that
 * loads three things at once got three identical "Sign in to continue" toasts,
 * stacked, filling the top of the window — three requests hitting the same
 * problem is one problem, not three. And the sentence was wrong: the reader was
 * signed in, with their own initials in the navigation behind the toasts.
 *
 * The server half of that is fixed in `utils/auth/guards`, which now answers
 * 503 when it could not check the session rather than 401 as though it had
 * checked and found nobody. This is the other half: read the status, not the
 * sentence, and never let a complaint about the session arrive more than once.
 */

import { toast } from 'sonner';

/**
 * One id for every complaint about the session, so N parallel requests failing
 * the same way collapse into one toast — sonner replaces a toast that reuses an
 * id instead of adding another.
 *
 * Ordinary failures deliberately do not share it: two different things going
 * wrong are two things worth reading.
 */
const SESSION_TOAST_ID = 'session-failed';

/** What every route in this app answers a failure with. */
interface FailurePayload {
    error?: string;
}

/** Where to send somebody whose session has actually ended, and back again. */
function signInHref(): string {
    if (typeof window === 'undefined') return '/auth/login';
    const here = `${window.location.pathname}${window.location.search}`;
    return `/auth/login?next=${encodeURIComponent(here)}`;
}

/**
 * Shows the right thing for a failed request.
 *
 * `fallback` is used only when the server sent no sentence of its own — the
 * routes write theirs for the person reading it, and replacing those with a
 * generic line throws away the part that says what to do next.
 */
export function reportRequestFailure(
    res: { status: number },
    payload: FailurePayload | null | undefined,
    fallback: string
): void {
    const said = payload?.error;

    // The session was checked and refused. Now that "could not check" has a
    // status of its own, this means signed out for real, and the only useful
    // thing to offer somebody is the way back in.
    if (res.status === 401) {
        toast.error(said || 'Sign in to continue', {
            id: SESSION_TOAST_ID,
            description: 'Your session has ended. Sign in again to pick up where you left off.',
            action: {
                label: 'Sign in',
                onClick: () => window.location.assign(signInHref()),
            },
        });
        return;
    }

    // Nobody said no; nobody said anything. Whatever this turns into on screen,
    // it must not be a sign-in prompt: they are already signed in, signing in
    // again fixes nothing, and being told to do it reads as an accusation.
    if (res.status === 503) {
        toast.error(said || 'We could not reach the server just now.', {
            id: SESSION_TOAST_ID,
            description: 'Nothing is wrong with your account. Try again in a moment.',
        });
        return;
    }

    toast.error(said || fallback);
}

/**
 * True when a failed request means the reader has to sign in again — as opposed
 * to meaning the check itself did not complete.
 *
 * For the pages that redirect rather than toast. A 503 must never redirect: it
 * would throw a signed-in reader out of the page they are entitled to, and land
 * them on a sign-in form that has nothing to fix.
 */
export function isSignedOut(res: { status: number }): boolean {
    return res.status === 401;
}
