/**
 * "THE SERVER SAID NO" IS NOT THE SAME AS "WE COULD NOT ASK"
 * ----------------------------------------------------------------------------
 * Both arrive as an error from `auth.getUser()`, and treating them alike is how
 * a signed-in user on a train gets signed out. One means the session is finished
 * and keeping it helps nobody; the other means a request did not complete, which
 * says nothing at all about the session.
 *
 * The asymmetry matters because the two mistakes do not cost the same. Keeping a
 * dead session costs a redirect to the sign-in page the user was heading for
 * anyway. Discarding a live one costs the user their session — mid-task, with no
 * explanation, having done nothing to invite it. So the rule is: clear only on a
 * verdict, never on silence.
 */

/** Errors as `auth.getUser()` reports them — the shape is not exported by the SDK. */
interface AuthErrorLike {
    message?: string;
    status?: number;
    code?: string;
    name?: string;
}

/**
 * The codes gotrue returns when a session is genuinely over: the refresh token
 * is spent, revoked or unknown, the JWT will not parse, or the account behind it
 * no longer exists. None of these improve on a retry.
 */
const REJECTED_CODES = new Set([
    // "There is no session here at all." Reported as an error, but the client
    // decides it locally without a request ever leaving — so it is a verdict of
    // the most certain kind, and it arrives as a 400, which no status rule
    // below would catch. Every signed-out visitor to a protected route produces
    // exactly this, so reading it as "could not reach the server" would let all
    // of them straight past the sign-in redirect.
    'session_missing',
    'bad_jwt',
    'session_expired',
    'session_not_found',
    'refresh_token_not_found',
    'refresh_token_already_used',
    'user_not_found',
    'user_banned',
    'no_authorization',
    // Raised when a token fails signature verification against the project's
    // public keys. Local verification is a verdict of the most certain kind:
    // nothing was asked of anybody, and no retry will change the answer.
    'invalid_jwt',
]);

const REJECTED_PHRASES = [
    'auth session missing',
    'invalid refresh token',
    'refresh token not found',
    'already used',
    'session from session id claim in jwt does not exist',
    'session not found',
    'jwt expired',
    // The wording local verification uses, which is not the wording the auth
    // server uses. Both mean the token is finished.
    'jwt has expired',
    'invalid jwt',
    'bad_jwt',
    'user from sub claim in jwt does not exist',
    'user not found',
];

/**
 * What to write in a log line about an auth failure.
 *
 * Errors reach this code as `unknown`, because verifying a token locally can
 * throw an ordinary exception where asking the server returned a typed one. A
 * log line is not worth a cast at every call site.
 */
export function authErrorMessage(error: unknown): string {
    if (!error) return 'no error';
    if (error instanceof Error) return error.message;
    const message = (error as AuthErrorLike).message;
    return typeof message === 'string' ? message : String(error);
}

/**
 * Verdicts reached without asking anybody: the token was verified here, against
 * a cached public key, and found wanting.
 *
 * These arrive as ordinary exceptions with no `status` and no `code`, so the
 * status rule below — which reads a missing status as "the request never landed"
 * — would call every one of them a network fault and keep a dead session alive.
 * They are checked first because there is nothing uncertain about them.
 */
const LOCAL_VERDICT_PHRASES = ['jwt has expired', 'missing exp claim', 'invalid jwt signature'];

/**
 * True only when the session has actually been ruled against — by the auth
 * server, or by verifying the token here. Anything nobody got to answer — a
 * dropped connection, a DNS failure, a timeout, a 5xx, a rate limit — is false.
 */
export function isSessionRejected(error: unknown): boolean {
    if (!error) return false;

    const e = error as AuthErrorLike;

    // The SDK's own name for "the request did not complete, try again later".
    if (e.name === 'AuthRetryableFetchError') return false;

    // And its name for "there is no session", which is the opposite: settled
    // locally, with certainty, before any request was attempted.
    if (e.name === 'AuthSessionMissingError') return true;

    const said = (e.message ?? '').toLowerCase();
    if (LOCAL_VERDICT_PHRASES.some((phrase) => said.includes(phrase))) return true;

    if (e.code && REJECTED_CODES.has(e.code)) return true;

    // A verdict needs an answer to have come back. Status 0 or absent means the
    // request never landed; 5xx and 429 are the server declining to answer *yet*
    // and say nothing about whether the session is valid.
    const status = typeof e.status === 'number' ? e.status : 0;
    if (status === 0 || status >= 500 || status === 429) return false;

    const message = (e.message ?? '').toLowerCase();
    if (REJECTED_PHRASES.some((phrase) => message.includes(phrase))) return true;

    // A plain 401/403 with an unfamiliar message is still the server refusing
    // this session, so it counts.
    return status === 401 || status === 403;
}
