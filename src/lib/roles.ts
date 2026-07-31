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

export type Role = 'owner' | 'admin' | 'user';

export interface RoleState {
    role: Role | null;
    /** True once the lookup has finished, whether or not anyone is signed in. */
    ready: boolean;
    signedIn: boolean;
    isAdmin: boolean;
    isOwner: boolean;
    email: string | null;
}

export function useRole(): RoleState {
    const [state, setState] = useState<RoleState>({
        role: null,
        ready: false,
        signedIn: false,
        isAdmin: false,
        isOwner: false,
        email: null,
    });

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
            setState({ role: null, ready: true, signedIn: false, isAdmin: false, isOwner: false, email: null });
            return;
        }

        const load = async () => {
            const { data: auth } = await supabase.auth.getUser();
            if (cancelled) return;

            if (!auth?.user) {
                setState({
                    role: null,
                    ready: true,
                    signedIn: false,
                    isAdmin: false,
                    isOwner: false,
                    email: null,
                });
                return;
            }

            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', auth.user.id)
                .maybeSingle();

            if (cancelled) return;
            const role = (profile?.role as Role) ?? 'user';
            setState({
                role,
                ready: true,
                signedIn: true,
                isAdmin: role === 'admin' || role === 'owner',
                isOwner: role === 'owner',
                email: auth.user.email ?? null,
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
