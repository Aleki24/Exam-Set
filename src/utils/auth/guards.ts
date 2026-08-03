import type { SupabaseClient } from '@supabase/supabase-js';

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
 * WHY THE MEMO IS KEYED ON THE CLIENT
 *
 * A request that asks twice should not ask the auth server twice. The obvious
 * cache is a module-level one, and it is also how one visitor's identity ends up
 * answering for the next — the module outlives the request, which is exactly the
 * trap `utils/supabase/client` documents for the browser client.
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

/** Who they are and what they may do. Costs a `profiles` read. */
export interface Actor extends SignedInUser {
    role: Role;
    isAdmin: boolean;
    isOwner: boolean;
}

// Per-request memos. See the note above on why these are keyed on the client.
const userByClient = new WeakMap<SupabaseClient, Promise<SignedInUser | null>>();
const actorByClient = new WeakMap<SupabaseClient, Promise<Actor | null>>();

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

/**
 * The signed-in user, or null. One call to the auth server per request.
 *
 * `getUser()` revalidates the token against the auth server rather than trusting
 * the cookie, which is why it is worth not doing twice.
 */
export function getSignedInUser(supabase: SupabaseClient): Promise<SignedInUser | null> {
    return memoise(userByClient, supabase, async () => {
        const { data } = await supabase.auth.getUser();
        if (!data?.user) return null;
        return { id: data.user.id, email: data.user.email ?? null };
    });
}

/** The signed-in user and their role, or null when signed out. */
export function getActor(supabase: SupabaseClient): Promise<Actor | null> {
    return memoise(actorByClient, supabase, async () => {
        const user = await getSignedInUser(supabase);
        if (!user) return null;

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();

        const role = (profile?.role as Role) ?? 'user';
        return {
            ...user,
            role,
            isAdmin: role === 'admin' || role === 'owner',
            isOwner: role === 'owner',
        };
    });
}

export interface GuardFailure {
    error: string;
    status: 401 | 403;
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
    supabase: SupabaseClient
): Promise<{ actor: Actor; failure?: never } | { actor?: never; failure: GuardFailure }> {
    const actor = await getActor(supabase);
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

export async function requireOwner(
    supabase: SupabaseClient
): Promise<{ actor: Actor; failure?: never } | { actor?: never; failure: GuardFailure }> {
    const actor = await getActor(supabase);
    if (!actor) return { failure: { error: 'Sign in to continue', status: 401 } };
    if (!actor.isOwner) {
        return { failure: { error: 'Only the owner can manage roles', status: 403 } };
    }
    return { actor };
}
