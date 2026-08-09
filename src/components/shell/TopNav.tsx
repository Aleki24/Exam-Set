'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, PenSquare, ShoppingCart, Library, LogOut, Menu, X, Moon, Sun, Search, ShieldCheck, Upload, BookOpen, Home, Settings2, TrendingUp, Users, Heart, Info, LifeBuoy } from 'lucide-react';
import { useTheme } from 'next-themes';
import { createClient, resetClient } from '@/utils/supabase/client';
import { clearSupabaseCookies, clearSupabaseStorage, ensureUsableSession } from '@/utils/supabase/session';
import { useCart } from '@/lib/cart';
import { formatPrice } from '@/lib/catalog';
import { formatDisplayName, getInitials } from '@/utils/userUtils';
import { useRole } from '@/lib/roles';
import { BrandMark, Wordmark } from '@/components/shell/Wordmark';

/**
 * The whole navigation of the product: three places to go, plus your cart and
 * your library. Anything more belongs inside one of the three surfaces.
 *
 * "Exam papers" and "Library" are two doors onto the same stock, and both earn
 * their place because two different people arrive. Someone who knows what they
 * want types it, and search over everything is the fastest way to that. Someone
 * who does not know browses down a hierarchy — level, then learning area — and
 * is never asked a question they cannot answer. A parent knows their child is
 * in Grade 4; they do not know what a summative assessment is, and a filter
 * rail opening with twenty-six exam types is a wall to them.
 */
const PRIMARY_LINKS = [
    {
        href: '/',
        label: 'Home',
        icon: Home,
        // Exactly `/`. Leaving the old prefix match here would light "Home" up
        // while somebody reads a paper, which is precisely the scent this
        // link exists to provide.
        match: (p: string) => p === '/',
    },
    {
        href: '/catalog',
        label: 'Catalog',
        icon: FileText,
        // `/sets/...` is a sitting in the shop, not the setter. It belongs here.
        match: (p: string) =>
            p === '/catalog' || p.startsWith('/catalog/') || p.startsWith('/papers') || p.startsWith('/sets'),
    },
    { href: '/learn', label: 'Library', icon: BookOpen, match: (p: string) => p.startsWith('/learn') },
    {
        href: '/set',
        label: 'Set an exam',
        icon: PenSquare,
        // Exactly `/set` and its children — not `/sets`, which is a prefix match
        // away and would light up the setter while somebody browses the shop.
        match: (p: string) => p === '/set' || p.startsWith('/set/'),
    },
];

export default function TopNav() {
    const pathname = usePathname();
    const { count, totals } = useCart();
    const { theme, setTheme } = useTheme();
    const { isAdmin, staleSession } = useRole();
    const [email, setEmail] = useState<string | null>(null);
    const [name, setName] = useState<string | null>(null);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [signingOut, setSigningOut] = useState(false);

    useEffect(() => {
        setMounted(true);

        // Checks the stored session and discards it only if the server rejects
        // it outright. A slow or unreachable check leaves it alone: a session
        // that is merely being renewed looks identical to one that is broken,
        // and guessing wrong signs the user out mid-task for nothing.
        void ensureUsableSession();

        // Guarded because this runs on every page. `createClient` throws when the
        // environment is not configured, and an exception raised in an effect
        // tears down the React tree — which leaves the server-rendered markup on
        // screen with nothing wired to it. Every link and button then looks
        // present and does nothing, and the navigation is the worst possible
        // place to inflict that.
        let supabase: ReturnType<typeof createClient>;
        try {
            supabase = createClient();
        } catch (err) {
            console.error('Navigation auth unavailable:', err instanceof Error ? err.message : err);
            return;
        }

        supabase.auth
            .getUser()
            .then(({ data }) => {
                setEmail(data.user?.email ?? null);
                setName(data.user?.user_metadata?.full_name ?? data.user?.user_metadata?.name ?? null);
            })
            .catch(() => {
                setEmail(null);
                setName(null);
            });

        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
            setEmail(session?.user?.email ?? null);
            setName(session?.user?.user_metadata?.full_name ?? null);
        });
        return () => sub.subscription.unsubscribe();
    }, []);

    useEffect(() => setMobileOpen(false), [pathname]);

    /**
     * Signing out has to work even when the session is already broken — which is
     * exactly when people reach for it.
     *
     * The default `signOut()` calls the server to revoke the refresh token, and
     * returns an error if that token is already expired or invalid. The old
     * version awaited that call and did nothing with the result, so on a stale
     * session the button looked dead: no navigation, no message, still signed
     * in. Falling back to a local sign-out clears the browser's own copy, which
     * is the part that actually decides what the user sees.
     */
    const signOut = async () => {
        // Close the sheet first. Navigating to the shop from the shop is a no-op,
        // so waiting on a route change to close it means it never closes.
        setMobileOpen(false);
        setSigningOut(true);

        try {
            const supabase = createClient();

            // A global sign-out is a network round trip to revoke the token on
            // the server. On a slow or dropped mobile connection that request can
            // hang indefinitely — and because the button was awaiting it, it sat
            // disabled on "Signing out…" for ever, which is precisely when
            // somebody most wants out.
            //
            // Signing out is a local decision. The server revocation is worth
            // attempting, but never worth waiting on: after a moment we stop
            // waiting and clear this device regardless.
            // The rejection handler matters: once the timeout wins the race, a
            // later rejection from the abandoned call would otherwise surface as
            // an unhandled promise rejection.
            await Promise.race([
                supabase.auth.signOut().catch(() => undefined),
                new Promise((resolve) => setTimeout(resolve, 3000)),
            ]);

            // Local scope touches no network, so this is what actually
            // guarantees the browser forgets the session.
            await Promise.race([
                supabase.auth.signOut({ scope: 'local' }).catch(() => undefined),
                new Promise((resolve) => setTimeout(resolve, 1000)),
            ]);
        } catch (err) {
            console.error('Sign-out failed:', err instanceof Error ? err.message : err);
        } finally {
            // Last resort. If the SDK never completed, the cookie it left behind
            // would sign the user straight back in on the next request.
            clearSupabaseCookies();
            clearSupabaseStorage();

            // The client is shared for the lifetime of the tab now, and it holds
            // the session in memory. If the races above both timed out, that copy
            // outlives the cookies we just expired, and the next call would be
            // served a session the browser no longer has on disk.
            resetClient();

            setEmail(null);
            setName(null);
            setSigningOut(false);

            // A full load rather than `router.push`, and the shared client is why.
            // Discarding it leaves the mounted components subscribed to an
            // instance nothing writes to any more, so a subsequent sign-in in the
            // same tab would not reach the navigation and it would go on showing
            // a signed-out user until something forced a reload. Reloading here
            // makes that impossible: new client, new subscriptions, and the server
            // renders the page without the cookies for good measure.
            window.location.assign('/');
        }
    };

    return (
        <header className="sticky top-0 z-50 border-b border-border/60 bar-blur">
            <div className="shell-width flex h-16 items-center gap-3">
                {/* Brand */}
                <Link
                    href="/"
                    className="group flex shrink-0 items-center gap-2.5"
                    aria-label="Skulbase Exams home"
                >
                    <BrandMark className="h-9 w-9 text-[15px] transition-transform duration-200 group-hover:-rotate-3" />
                    <span className="hidden sm:block">
                        <Wordmark
                            suffix="Exams"
                            className="block font-display text-[17px] font-bold leading-none tracking-[-0.02em]"
                        />
                        <span className="overline mt-1 block">CBE resources for Kenya</span>
                    </span>
                </Link>

                {/* Primary nav */}
                {/* `lg`, not `md`. At 768px the brand, four links, the cart, the
                    library, the theme toggle and two auth buttons do not fit on
                    one 64px row, and the first thing to give was "Set an exam",
                    which wrapped to three lines. A tablet gets the sheet, which
                    carries everything this row does and more. */}
                <nav className="ml-4 hidden items-center gap-1 lg:flex">
                    {PRIMARY_LINKS.map(({ href, label, icon: Icon, match }) => {
                        const active = match(pathname);
                        return (
                            <Link
                                key={href}
                                href={href}
                                aria-current={active ? 'page' : undefined}
                                className={`relative flex min-h-11 items-center gap-2 whitespace-nowrap px-3.5 text-sm font-semibold transition-colors ${
                                    active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                <Icon className="h-4 w-4" aria-hidden />
                                {label}
                                {/* The active marker: a rule under the label, not a pill. */}
                                <span
                                    className={`absolute inset-x-3 -bottom-px h-[2px] rounded-full bg-primary transition-transform duration-200 ${
                                        active ? 'scale-x-100' : 'scale-x-0'
                                    }`}
                                    aria-hidden
                                />
                            </Link>
                        );
                    })}
                </nav>

                <div className="flex-1" />

                {/* Cart */}
                <Link
                    href="/cart"
                    className="relative flex min-h-11 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold transition-all duration-150 hover:border-primary/40 hover:bg-primary/[0.04] active:scale-[0.98]"
                >
                    <ShoppingCart className="h-4 w-4" aria-hidden />
                    <span className={count > 0 ? 'figure hidden sm:inline' : 'hidden sm:inline'}>
                        {count > 0 ? formatPrice(totals.totalCents, totals.currency) : 'Cart'}
                    </span>
                    {count > 0 && (
                        <span className="figure absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
                            {count}
                        </span>
                    )}
                </Link>

                {/* Library */}
                {email && (
                    <Link
                        href="/library"
                        className={`hidden min-h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors sm:flex ${
                            pathname.startsWith('/library')
                                ? 'text-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <Library className="h-4 w-4" aria-hidden />
                        My library
                    </Link>
                )}

                {/* Admin — only the owner and admins ever see these two.
                    Uploading a paper is the owner's main job and was buried two
                    clicks inside the admin console, so it gets its own control. */}
                {isAdmin && (
                    <>
                        <Link
                            href="/papers/new"
                            className="hidden min-h-11 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold transition-colors hover:border-primary/40 hover:bg-primary/[0.04] sm:flex"
                        >
                            <Upload className="h-4 w-4" aria-hidden />
                            Upload paper
                        </Link>
                        <Link
                            href="/admin"
                            className={`hidden min-h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors sm:flex ${
                                pathname.startsWith('/admin')
                                    ? 'text-foreground'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <ShieldCheck className="h-4 w-4" aria-hidden />
                            Admin
                        </Link>
                    </>
                )}

                {/* Theme */}
                {mounted && (
                    <button
                        type="button"
                        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                        className="btn-icon hidden sm:inline-grid"
                        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                    >
                        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    </button>
                )}

                {/* Account */}
                {email ? (
                    <div className="hidden items-center gap-2 sm:flex">
                        <Link
                            href="/account"
                            className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 font-display text-xs font-bold text-primary transition-colors hover:bg-primary/20"
                            title={`${email} — your account`}
                            aria-label="Your account"
                        >
                            {getInitials(name || formatDisplayName(email))}
                        </Link>
                        <button
                            type="button"
                            onClick={signOut}
                            disabled={signingOut}
                            className="btn-icon"
                            aria-label="Sign out"
                        >
                            <LogOut className="h-4 w-4" />
                        </button>
                    </div>
                ) : (
                    <div className="hidden items-center gap-2 sm:flex">
                        <Link href="/auth/login" className="btn-ghost">
                            Sign in
                        </Link>
                        <Link href="/auth/signup" className="btn-primary">
                            Create account
                        </Link>
                    </div>
                )}

                {/* Mobile toggle */}
                <button
                    type="button"
                    onClick={() => setMobileOpen((v) => !v)}
                    className="btn-icon lg:hidden"
                    aria-label="Menu"
                    aria-expanded={mobileOpen}
                >
                    {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
            </div>

            {/* A session the database will not answer for. Without this the site
                simply behaves as though the account were an ordinary user, which
                is the most confusing possible failure for an owner: the admin
                links are gone and nothing says why. */}
            {staleSession && (
                <div className="border-t border-amber-500/30 bg-amber-500/10">
                    <div className="shell-width flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs">
                        <span className="font-semibold">Your session has expired.</span>
                        <span className="text-muted-foreground">
                            You are seeing the site as a signed-out visitor until you sign in again.
                        </span>
                        <button
                            type="button"
                            onClick={signOut}
                            disabled={signingOut}
                            className="font-semibold text-primary underline underline-offset-2 disabled:opacity-60"
                        >
                            {signingOut ? 'Signing out…' : 'Sign in again'}
                        </button>
                    </div>
                </div>
            )}

            {/* Mobile sheet */}
            {mobileOpen && (
                <div className="border-t bg-card lg:hidden">
                    <nav className="shell-width flex flex-col gap-1 py-3">
                        {/* Which account this is. The desktop bar shows initials
                            with the address in a tooltip; on a phone there was
                            nothing at all, so somebody with two accounts had no
                            way to tell which one they were using — and no reason
                            to trust what their library showed them. */}
                        {email && (
                            <div className="mb-1 flex items-center gap-3 border-b border-border px-3 pb-3">
                                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 font-display text-xs font-bold text-primary">
                                    {getInitials(name || formatDisplayName(email))}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-semibold">
                                        {name || formatDisplayName(email)}
                                    </span>
                                    <span className="block truncate text-xs text-muted-foreground">{email}</span>
                                </span>
                                {isAdmin && <span className="chip shrink-0 text-[10px]">Admin</span>}
                            </div>
                        )}
                        {PRIMARY_LINKS.map(({ href, label, icon: Icon }) => (
                            <Link
                                key={href}
                                href={href}
                                className="flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-semibold hover:bg-secondary"
                            >
                                <Icon className="h-4 w-4" />
                                {label}
                            </Link>
                        ))}
                        <Link
                            href="/cart"
                            className="flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-semibold hover:bg-secondary"
                        >
                            <ShoppingCart className="h-4 w-4" />
                            Cart {count > 0 && `(${count})`}
                        </Link>
                        {/* The theme control was desktop-only (`hidden sm:inline-grid`),
                            so on a phone — where most of these teachers are —
                            dark mode simply could not be switched. */}
                        {mounted && (
                            <button
                                type="button"
                                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                                className="flex min-h-12 items-center gap-3 rounded-md px-3 text-left text-sm font-semibold hover:bg-secondary"
                            >
                                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                            </button>
                        )}

                        {email ? (
                            <>
                                <Link
                                    href="/home"
                                    className="flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-semibold hover:bg-secondary"
                                >
                                    <Home className="h-4 w-4" />
                                    My home
                                </Link>
                                <Link
                                    href="/progress"
                                    className="flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-semibold hover:bg-secondary"
                                >
                                    <TrendingUp className="h-4 w-4" />
                                    My progress
                                </Link>
                                <Link
                                    href="/teach"
                                    className="flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-semibold hover:bg-secondary"
                                >
                                    <Users className="h-4 w-4" />
                                    Teacher tools
                                </Link>
                                <Link
                                    href="/family"
                                    className="flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-semibold hover:bg-secondary"
                                >
                                    <Heart className="h-4 w-4" />
                                    Family
                                </Link>
                                <Link
                                    href="/library"
                                    className="flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-semibold hover:bg-secondary"
                                >
                                    <Library className="h-4 w-4" />
                                    My library
                                </Link>
                                <Link
                                    href="/account"
                                    className="flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-semibold hover:bg-secondary"
                                >
                                    <Settings2 className="h-4 w-4" />
                                    Account
                                </Link>
                                {isAdmin && (
                                    <>
                                        <Link
                                            href="/papers/new"
                                            className="flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-semibold hover:bg-secondary"
                                        >
                                            <Upload className="h-4 w-4" />
                                            Upload a paper
                                        </Link>
                                        <Link
                                            href="/admin"
                                            className="flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-semibold hover:bg-secondary"
                                        >
                                            <ShieldCheck className="h-4 w-4" />
                                            Admin
                                        </Link>
                                    </>
                                )}
                                <SecondaryMobileLinks />
                                <button
                                    type="button"
                                    onClick={signOut}
                                    disabled={signingOut}
                                    className="flex min-h-12 items-center gap-3 rounded-md px-3 text-left text-sm font-semibold text-muted-foreground hover:bg-secondary disabled:opacity-60"
                                >
                                    <LogOut className="h-4 w-4" />
                                    {signingOut ? 'Signing out…' : 'Sign out'}
                                </button>
                            </>
                        ) : (
                            <>
                            <SecondaryMobileLinks />
                            <div className="flex gap-2 px-1 py-2">
                                <Link href="/auth/login" className="btn-outline flex-1">
                                    Sign in
                                </Link>
                                <Link href="/auth/signup" className="btn-primary flex-1">
                                    Create account
                                </Link>
                            </div>
                            </>
                        )}
                    </nav>
                </div>
            )}
        </header>
    );
}

/** Compact search field used in the shop header on small screens. */
export function NavSearchHint() {
    return (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Search className="h-3.5 w-3.5" />
            Search papers
        </span>
    );
}

/**
 * About and Contact, on mobile only.
 *
 * They earn a place in the sheet because the footer that otherwise carries them
 * is a long scroll away on a phone — but not a place in the desktop bar, which
 * already holds four links, a cart, a library, two admin buttons, a theme
 * toggle and an avatar, and is tight at tablet widths as it is.
 */
function SecondaryMobileLinks() {
    return (
        <>
            <Link
                href="/about"
                className="flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-semibold text-muted-foreground hover:bg-secondary"
            >
                <Info className="h-4 w-4" />
                About us
            </Link>
            <Link
                href="/contact"
                className="flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-semibold text-muted-foreground hover:bg-secondary"
            >
                <LifeBuoy className="h-4 w-4" />
                Contact &amp; help
            </Link>
        </>
    );
}
