import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side role guards for API routes.
 *
 * These are the second line of defence, not the only one: the same rules are
 * enforced by row level security in migration 013. They exist so a route can
 * return a clear 401/403 instead of a confusing empty result.
 */

export type Role = 'owner' | 'admin' | 'user';

export interface Actor {
    id: string;
    email: string | null;
    role: Role;
    isAdmin: boolean;
    isOwner: boolean;
}

/** Resolves the signed-in user and their role, or null when signed out. */
export async function getActor(supabase: SupabaseClient): Promise<Actor | null> {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return null;

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', auth.user.id)
        .maybeSingle();

    const role = (profile?.role as Role) ?? 'user';
    return {
        id: auth.user.id,
        email: auth.user.email ?? null,
        role,
        isAdmin: role === 'admin' || role === 'owner',
        isOwner: role === 'owner',
    };
}

export interface GuardFailure {
    error: string;
    status: 401 | 403;
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
): Promise<{ actor: Actor; failure?: never } | { actor?: never; failure: GuardFailure }> {
    const actor = await getActor(supabase);
    if (!actor) return { failure: { error: 'Sign in to continue', status: 401 } };
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
