'use client';

/**
 * ROLES (client side)
 *
 * owner — the account that runs the shop. Everything an admin can do, plus
 *         appointing and removing admins.
 * admin — staff who stock the shop: upload papers, price them, publish them and
 *         confirm manual M-Pesa payments. They can also set exams.
 * user  — buys papers and sets their own exams, which stay private to them.
 *
 * This is a convenience for the UI only. The database enforces the same rules
 * through row level security, so hiding a button is never the actual guard.
 */

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { EMPTY_ACCOUNT_PROFILE, toAccountProfile, type AccountProfile } from './accounts';

export type Role = 'owner' | 'admin' | 'user';

export interface RoleState {
    role: Role | null;
    /** True once the lookup has finished, whether or not anyone is signed in. */
    ready: boolean;
    signedIn: boolean;
    isAdmin: boolean;
    isOwner: boolean;
    email: string | null;
    /**
     * The session looks signed in but the database will not answer for it —
     * an expired or invalidated token.
     *
     * This is worth its own flag because of how it presents: `getUser()` reads a
     * cached user and happily returns one, so the navigation shows a name and a
     * "Sign out" button, while every authenticated query quietly comes back
     * empty. An owner is then indistinguishable from a signed-out stranger —
     * the admin links vanish and the site looks like it demoted them, with
     * nothing on screen explaining why.
     */
    staleSession: boolean;
    /**
     * Who they are, as opposed to what they may do.
     *
     * Carried alongside the permission role rather than folded into it, because
     * they answer different questions and one column could not hold both
     * without the signup form becoming a way to grant yourself permissions.
     * Nothing on this object is ever consulted to decide whether an action is
     * allowed — it only decides what gets shown first.
     */
    account: AccountProfile;
    /** True when the account exists but has never been asked who they are. */
    needsOnboarding: boolean;
}

const SIGNED_OUT: RoleState = {
    role: null,
    ready: true,
    signedIn: false,
    isAdmin: false,
    isOwner: false,
    email: null,
    staleSession: false,
    account: EMPTY_ACCOUNT_PROFILE,
    needsOnboarding: false,
};

export function useRole(): RoleState {
    const [state, setState] = useState<RoleState>({ ...SIGNED_OUT, ready: false });

    useEffect(() => {
        let cancelled = false;

        // This hook sits in the top navigation, so it runs on every page. If the
        // credentials are missing it must report "nobody is signed in" and let
        // the rest of the page render, rather than taking the whole site down
        // with it — the shop is still worth reading when auth is not available.
        let supabase: ReturnType<typeof createClient>;
        try {
            supabase = createClient();
        } catch (err) {
            console.error('Roles unavailable:', err instanceof Error ? err.message : err);
            setState(SIGNED_OUT);
            return;
        }

        const load = async () => {
            const { data: auth, error: authError } = await supabase.auth.getUser();
            if (cancelled) return;

            if (authError || !auth?.user) {
                setState(SIGNED_OUT);
                return;
            }

            const { data: profile, error } = await supabase
                .from('profiles')
                .select('role, account_type, level_slug, grade_label, subject_interests, school_name, onboarded_at')
                .eq('id', auth.user.id)
                .maybeSingle();

            if (cancelled) return;

            // Every account gets a profile row from a trigger at signup. So if
            // the row cannot be seen, the row is not the problem — the request
            // was not authenticated as far as the database was concerned. Saying
            // "you are a plain user" here is the wrong answer and an actively
            // misleading one: it silently strips an owner of every admin surface
            // and gives them no way to tell why.
            if (error || !profile) {
                if (error) console.error('Role lookup failed:', error.message);
                setState({
                    role: null,
                    ready: true,
                    signedIn: true,
                    isAdmin: false,
                    isOwner: false,
                    email: auth.user.email ?? null,
                    staleSession: true,
                    account: EMPTY_ACCOUNT_PROFILE,
                    needsOnboarding: false,
                });
                return;
            }

            const role = profile.role as Role;
            const account = toAccountProfile(profile);
            setState({
                role,
                ready: true,
                signedIn: true,
                isAdmin: role === 'admin' || role === 'owner',
                isOwner: role === 'owner',
                email: auth.user.email ?? null,
                staleSession: false,
                account,
                // Never asked, rather than asked and declined. `onboarded_at` is
                // what tells those apart, and prompting somebody who already
                // said no is how a helpful question becomes nagging.
                needsOnboarding: !account.accountType && !account.onboardedAt,
            });
        };

        load();
        const { data: sub } = supabase.auth.onAuthStateChange(() => load());
        return () => {
            cancelled = true;
            sub.subscription.unsubscribe();
        };
    }, []);

    return state;
}

export const ROLE_LABELS: Record<Role, string> = {
    owner: 'Owner',
    admin: 'Admin',
    user: 'Teacher',
};
