import type { SupabaseClient } from '@supabase/supabase-js';
import {
    claimedEmail,
    claimedUserId,
    readVerifiedClaims,
    type VerifiedClaims,
} from '@/utils/supabase/claims';

/**
 * SERVER-SIDE GUARDS FOR API ROUTES
 * ----------------------------------------------------------------------------
 * The second line of defence, not the only one: the same rules are enforced by
 * row level security in migration 013. These exist so a route can return a clear
 * 401/403 instead of a confusing empty result.
 *
 * TWO QUESTIONS, NOT ONE
 *
 * "Is anybody signed in?" and "what may they do?" were answered by the same
 * function, so every route that only needed the first paid for the second. Two
 * thirds of the guarded routes are `requireUser` — saving a paper, starting an
 * exam session, uploading a file — and none of them look at a role. They were
 * each running a `profiles` query to fetch a column nobody read.
 *
 * So they are separate now, and `requireUser` hands back a narrower type than
 * `requireAdmin` does. That is the point of the narrower type: a route that did
 * not look up a role cannot accidentally read one, and a route that starts
 * needing one has to say so and pay for it.
 *
 * READING THE TOKEN INSTEAD OF ASKING ABOUT IT
 *
 * `getUser()` sends a request to the auth server on every call, because it
 * re-reads the user from source. `getClaims()` verifies the token's signature
 * against the project's public keys — fetched once per process and cached — and
 * returns the claims out of the token itself. Same guarantee of authenticity, no
 * round trip.
 *
 * On a project still signing with the legacy shared secret there is no public
 * key to verify against, and the SDK falls back to `getUser()` on its own. So
 * this is safe to ship before the project switches to asymmetric keys; it simply
 * does not get faster until it does.
 *
 * What is genuinely given up is instant revocation. A token that has been
 * verified locally is trusted until it expires, so a session revoked server-side
 * stays usable for the rest of the access token's life. That is the standard JWT
 * trade and it is survivable here for one reason: the database is the wall.
 * `is_admin()` and `is_owner()` read `profiles` inside Postgres, so every policy
 * and every privileged function re-checks the role on every statement. A stale
 * token can get somebody as far as an admin screen; it cannot get them past the
 * database.
 *
 * The exception is a route holding a service-role client, which bypasses row
 * level security and therefore has no wall behind it. Those pass `fresh: true`,
 * and are the only places that still pay for a round trip.
 *
 * WHY THE MEMO IS KEYED ON THE CLIENT
 *
 * A request that asks twice should not ask twice. The obvious cache is a
 * module-level one, and it is also how one visitor's identity ends up answering
 * for the next — the module outlives the request, which is exactly the trap
 * `utils/supabase/client` documents for the browser client.
 *
 * Keying on the Supabase client instead makes the lifetime correct by
 * construction: `utils/supabase/server` builds a fresh client per request from
 * that request's cookies, so the memo cannot outlive the request that owns it,
 * and a WeakMap lets it be collected with the client. No framework-specific
 * request store is involved, so this behaves the same in a route handler, a
 * server component and a script.
 */

export type Role = 'owner' | 'admin' | 'user';

/** Who is making the request. Nothing about what they may do. */
export interface SignedInUser {
    id: string;
    email: string | null;
}

/** Who they are and what they may do. */
export interface Actor extends SignedInUser {
    role: Role;
    isAdmin: boolean;
    isOwner: boolean;
    /**
     * Where the role came from.
     *
     * `token`    — a claim in the verified access token. Up to one token
     *              lifetime old.
     * `database` — read from `profiles` during this request.
     */
    roleSource: 'token' | 'database';
}

/** The claim the access token hook writes. See migration 033. */
const ROLE_CLAIM = 'user_role';

function isRole(value: unknown): value is Role {
    return value === 'owner' || value === 'admin' || value === 'user';
}

// Per-request memos. See the note above on why these are keyed on the client.
const userByClient = new WeakMap<SupabaseClient, Promise<SignedInUser | null>>();
const actorByClient = new WeakMap<SupabaseClient, Promise<Actor | null>>();
const freshActorByClient = new WeakMap<SupabaseClient, Promise<Actor | null>>();
const claimsByClient = new WeakMap<SupabaseClient, Promise<VerifiedClaims | null>>();

/**
 * Runs `resolve` once per client and hands every later caller the same promise.
 *
 * A rejected promise is dropped rather than kept: a dropped request is not a
 * verdict about the session, and caching one would turn a single network blip
 * into a failure for the rest of the request.
 */
function memoise<T>(
    store: WeakMap<SupabaseClient, Promise<T>>,
    supabase: SupabaseClient,
    resolve: () => Promise<T>
): Promise<T> {
    const existing = store.get(supabase);
    if (existing) return existing;

    const pending = resolve().catch((err) => {
        store.delete(supabase);
        throw err;
    });

    store.set(supabase, pending);
    return pending;
}

/** The verified claims in this request's access token, or null when signed out. */
function getClaims(supabase: SupabaseClient): Promise<VerifiedClaims | null> {
    return memoise(claimsByClient, supabase, async () => {
        const { claims, error } = await readVerifiedClaims(supabase);
        return error ? null : claims;
    });
}

/**
 * The signed-in user, or null. One verification per request, no round trip once
 * the project signs its tokens asymmetrically.
 */
export function getSignedInUser(supabase: SupabaseClient): Promise<SignedInUser | null> {
    return memoise(userByClient, supabase, async () => {
        const claims = await getClaims(supabase);
        const id = claimedUserId(claims);
        if (!id) return null;
        return { id, email: claimedEmail(claims) };
    });
}

/** Reads `profiles.role`. The fallback, and the answer when freshness matters. */
async function readRoleFromDatabase(supabase: SupabaseClient, id: string): Promise<Role> {
    const { data } = await supabase.from('profiles').select('role').eq('id', id).maybeSingle();
    // A missing row means the request was not authenticated as far as the
    // database was concerned — every account gets one from a trigger at signup.
    // The safe reading of that is the least privilege, never the most.
    return isRole(data?.role) ? data.role : 'user';
}

function toActor(user: SignedInUser, role: Role, roleSource: Actor['roleSource']): Actor {
    return {
        ...user,
        role,
        isAdmin: role === 'admin' || role === 'owner',
        isOwner: role === 'owner',
        roleSource,
    };
}

/**
 * The signed-in user and their role, or null when signed out.
 *
 * Takes the role from the token when the hook has put one there, and asks the
 * database when it has not — which is the case for a project that has not
 * enabled the hook yet, and for tokens minted before it was. A missing claim
 * must never be read as "no role": that would strip every already-signed-in
 * admin the moment this shipped.
 */
export function getActor(supabase: SupabaseClient): Promise<Actor | null> {
    return memoise(actorByClient, supabase, async () => {
        const user = await getSignedInUser(supabase);
        if (!user) return null;

        const claims = await getClaims(supabase);
        const claimed = claims?.[ROLE_CLAIM];
        if (isRole(claimed)) return toActor(user, claimed, 'token');

        return toActor(user, await readRoleFromDatabase(supabase, user.id), 'database');
    });
}

/**
 * As `getActor`, but the role is read from `profiles` even when the token
 * carries one.
 *
 * For the handful of routes that hold a service-role client. Those bypass row
 * level security, so the guard is the only wall and it cannot be a photograph
 * taken up to an hour ago.
 */
export function getFreshActor(supabase: SupabaseClient): Promise<Actor | null> {
    return memoise(freshActorByClient, supabase, async () => {
        const user = await getSignedInUser(supabase);
        if (!user) return null;
        return toActor(user, await readRoleFromDatabase(supabase, user.id), 'database');
    });
}

export interface GuardFailure {
    error: string;
    status: 401 | 403;
}

export interface GuardOptions {
    /**
     * Re-read the role from the database rather than trusting the token.
     *
     * Set this on any route that goes on to use a service-role client, or that
     * does something the database cannot undo.
     */
    fresh?: boolean;
}

/**
 * Requires any signed-in account.
 *
 * The floor for anything that costs money to run, writes to storage, or reaches
 * out to the internet on the server's behalf. Row level security already covers
 * the database, but it says nothing about a route that spends an API credit or
 * launches a browser — those need a person attached to the request.
 */
export async function requireUser(
    supabase: SupabaseClient
): Promise<{ user: SignedInUser; failure?: never } | { user?: never; failure: GuardFailure }> {
    const user = await getSignedInUser(supabase);
    if (!user) return { failure: { error: 'Sign in to continue', status: 401 } };
    return { user };
}

/**
 * Requires an admin (or the owner). Returns the actor, or a failure the caller
 * turns into a response.
 */
export async function requireAdmin(
    supabase: SupabaseClient,
    options: GuardOptions = {}
): Promise<{ actor: Actor; failure?: never } | { actor?: never; failure: GuardFailure }> {
    const actor = options.fresh ? await getFreshActor(supabase) : await getActor(supabase);
    if (!actor) return { failure: { error: 'Sign in to continue', status: 401 } };
    if (!actor.isAdmin) {
        return {
            failure: {
                error: 'Only the shop owner and admins can publish papers for sale. You can still set and save your own exams.',
                status: 403,
            },
        };
    }
    return { actor };
}

/**
 * Requires the owner.
 *
 * Always read from the database. There is one owner, this gates appointing and
 * removing admins, and three call sites do not add up to a round trip worth
 * saving.
 */
export async function requireOwner(
    supabase: SupabaseClient
): Promise<{ actor: Actor; failure?: never } | { actor?: never; failure: GuardFailure }> {
    const actor = await getFreshActor(supabase);
    if (!actor) return { failure: { error: 'Sign in to continue', status: 401 } };
    if (!actor.isOwner) {
        return { failure: { error: 'Only the owner can manage roles', status: 403 } };
    }
    return { actor };
}
