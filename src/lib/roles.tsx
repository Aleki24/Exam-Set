'use client';

/**
 * WHO IS SIGNED IN, DECIDED ONCE PER TAB
 * ----------------------------------------------------------------------------
 * owner — the account that runs the shop. Everything an admin can do, plus
 *         appointing and removing admins.
 * admin — staff who stock the shop: upload papers, price them, publish them and
 *         confirm manual M-Pesa payments. They can also set exams.
 * user  — buys papers and sets their own exams, which stay private to them.
 *
 * This is a convenience for the UI only. The database enforces the same rules
 * through row level security, so hiding a button is never the actual guard.
 *
 * WHY THIS IS A PROVIDER AND NOT A HOOK THAT FETCHES
 *
 * `useRole` used to do the work itself: a `getUser()` and a `profiles` query,
 * per component that asked. `TopNav` asks, and so does the page inside it — so
 * `/set`, `/admin`, `/teach`, `/papers/new` and `/` each ran two of each on
 * every load, and each kept its own `onAuthStateChange` subscription that re-ran
 * both on every event, token refreshes included.
 *
 * That is the same shape as the two worst auth bugs this app has had. Several
 * browser clients each running their own refresh timer rotated the refresh token
 * out from under each other until the server treated the replay as theft and
 * revoked the session family (see `utils/supabase/client`); three `getUser()`
 * calls in one middleware pass did the same thing a different way (see
 * `middleware.ts`). Both were fixed by having one of the thing instead of
 * several. This is that fix applied to the last place it had not been: one
 * lookup, one subscription, one answer, shared by everyone who asks.
 */

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from 'react';
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

interface AuthValue extends RoleState {
    /**
     * Re-reads the profile.
     *
     * For after a write that changes it — the account page saving an account
     * type, say. Without this, somebody finishes onboarding and the navigation
     * goes on offering to onboard them until the next hard reload, because
     * nothing about the *session* changed and nothing was listening for
     * anything else.
     */
    refresh: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

const PROFILE_COLUMNS =
    'role, account_type, level_slug, grade_label, subject_interests, school_name, onboarded_at';

/**
 * Whether an auth event can have changed the answer already on screen.
 *
 * Named and exported so the rule can be checked directly, because getting it
 * wrong is invisible either way: too eager and every tab runs a profile query
 * an hour for ever, too shy and somebody who switched accounts goes on being
 * shown as the previous one.
 *
 * `describes` is who the current state is about — a uuid, null for signed out,
 * or undefined before the first lookup.
 */
export function authEventNeedsReload(
    event: string,
    userId: string | null,
    describes: string | null | undefined
): boolean {
    // The same person holding a newer credential. Nothing on screen can change.
    if (event === 'TOKEN_REFRESHED') return false;
    // The id is unchanged by definition here, so it has to be let through by
    // name or a changed email would never appear.
    if (event === 'USER_UPDATED') return true;
    return userId !== describes;
}

/** Holds the session for the whole tab. Mounted once, in the root layout. */
export function AuthProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<RoleState>({ ...SIGNED_OUT, ready: false });

    /**
     * The user the current state describes: a uuid, null for signed out, or
     * undefined before the first lookup. Compared against each auth event, so a
     * token refresh — the same person holding a newer credential — does not
     * trigger another round trip.
     */
    const describes = useRef<string | null | undefined>(undefined);
    const cancelled = useRef(false);

    const load = useCallback(async () => {
        // This provider wraps the whole app. If the credentials are missing it
        // must report "nobody is signed in" and let the site render, rather than
        // taking every page down with it — the shop is still worth reading when
        // auth is not available.
        let supabase: ReturnType<typeof createClient>;
        try {
            supabase = createClient();
        } catch (err) {
            console.error('Roles unavailable:', err instanceof Error ? err.message : err);
            describes.current = null;
            setState(SIGNED_OUT);
            return;
        }

        // `getClaims` verifies the token against the project's public keys —
        // fetched once and cached — rather than asking the auth server who this
        // is on every page. Same guarantee of authenticity, one fewer round trip
        // on the first paint of every page. On a project still signing with the
        // legacy shared secret the SDK falls back to `getUser()` by itself, so
        // this is safe to ship before that switch and simply does not get faster
        // until it happens.
        const { data: verified, error: authError } = await supabase.auth.getClaims();
        if (cancelled.current) return;

        const userId = typeof verified?.claims?.sub === 'string' ? verified.claims.sub : null;
        const userEmail = typeof verified?.claims?.email === 'string' ? verified.claims.email : null;

        if (authError || !userId) {
            describes.current = null;
            setState(SIGNED_OUT);
            return;
        }

        describes.current = userId;

        const { data: profile, error } = await supabase
            .from('profiles')
            .select(PROFILE_COLUMNS)
            .eq('id', userId)
            .maybeSingle();

        if (cancelled.current) return;

        // Every account gets a profile row from a trigger at signup. So if the
        // row cannot be seen, the row is not the problem — the request was not
        // authenticated as far as the database was concerned. Saying "you are a
        // plain user" here is the wrong answer and an actively misleading one:
        // it silently strips an owner of every admin surface and gives them no
        // way to tell why.
        if (error || !profile) {
            if (error) console.error('Role lookup failed:', error.message);
            setState({
                role: null,
                ready: true,
                signedIn: true,
                isAdmin: false,
                isOwner: false,
                email: userEmail,
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
            email: userEmail,
            staleSession: false,
            account,
            // Never asked, rather than asked and declined. `onboarded_at` is
            // what tells those apart, and prompting somebody who already said no
            // is how a helpful question becomes nagging.
            needsOnboarding: !account.accountType && !account.onboardedAt,
        });
    }, []);

    useEffect(() => {
        cancelled.current = false;
        load();

        let supabase: ReturnType<typeof createClient>;
        try {
            supabase = createClient();
        } catch {
            // Already reported by `load`.
            return () => {
                cancelled.current = true;
            };
        }

        const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
            if (!authEventNeedsReload(event, session?.user?.id ?? null, describes.current)) return;
            load();
        });

        return () => {
            cancelled.current = true;
            sub.subscription.unsubscribe();
        };
    }, [load]);

    return (
        <AuthContext.Provider value={{ ...state, refresh: load }}>{children}</AuthContext.Provider>
    );
}

/**
 * The signed-in account, its role and its profile.
 *
 * Throws outside the provider rather than quietly falling back to a lookup of
 * its own. A silent fallback is how six independent lookups happened in the
 * first place; it would hide the mistake instead of showing it.
 */
export function useRole(): RoleState {
    const value = useContext(AuthContext);
    if (!value) throw new Error('useRole must be used inside <AuthProvider>');
    return value;
}

/** As `useRole`, plus a way to re-read the profile after writing to it. */
export function useAuth(): AuthValue {
    const value = useContext(AuthContext);
    if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
    return value;
}

export const ROLE_LABELS: Record<Role, string> = {
    owner: 'Owner',
    admin: 'Admin',
    user: 'Teacher',
};
