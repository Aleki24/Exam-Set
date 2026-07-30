'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FileText, PenSquare, ShoppingCart, Library, LogOut, Menu, X, Moon, Sun, Search, ShieldCheck } from 'lucide-react';
import { useTheme } from 'next-themes';
import { createClient } from '@/utils/supabase/client';
import { useCart } from '@/lib/cart';
import { formatPrice } from '@/lib/catalog';
import { formatDisplayName, getInitials } from '@/utils/userUtils';
import { useRole } from '@/lib/roles';
import { BrandMark, Wordmark } from '@/components/shell/Wordmark';

/**
 * The whole navigation of the product: two places to go, plus your cart and
 * your library. Anything more belongs inside one of the two surfaces.
 */
const PRIMARY_LINKS = [
    { href: '/', label: 'Exam papers', icon: FileText, match: (p: string) => p === '/' || p.startsWith('/papers') },
    { href: '/set', label: 'Set an exam', icon: PenSquare, match: (p: string) => p.startsWith('/set') },
];

export default function TopNav() {
    const pathname = usePathname();
    const router = useRouter();
    const { count, totals } = useCart();
    const { theme, setTheme } = useTheme();
    const { isAdmin } = useRole();
    const [email, setEmail] = useState<string | null>(null);
    const [name, setName] = useState<string | null>(null);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const supabase = createClient();

        supabase.auth.getUser().then(({ data }) => {
            setEmail(data.user?.email ?? null);
            setName(data.user?.user_metadata?.full_name ?? data.user?.user_metadata?.name ?? null);
        });

        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
            setEmail(session?.user?.email ?? null);
            setName(session?.user?.user_metadata?.full_name ?? null);
        });
        return () => sub.subscription.unsubscribe();
    }, []);

    useEffect(() => setMobileOpen(false), [pathname]);

    const signOut = async () => {
        await createClient().auth.signOut();
        router.push('/');
        router.refresh();
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
                        <span className="overline mt-1 block">CBE paper shop</span>
                    </span>
                </Link>

                {/* Primary nav */}
                <nav className="ml-4 hidden items-center gap-1 md:flex">
                    {PRIMARY_LINKS.map(({ href, label, icon: Icon, match }) => {
                        const active = match(pathname);
                        return (
                            <Link
                                key={href}
                                href={href}
                                aria-current={active ? 'page' : undefined}
                                className={`relative flex min-h-11 items-center gap-2 px-3.5 text-sm font-semibold transition-colors ${
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

                {/* Admin — only the owner and admins ever see this */}
                {isAdmin && (
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
                        <span
                            className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 font-display text-xs font-bold text-primary"
                            title={email}
                        >
                            {getInitials(name || formatDisplayName(email))}
                        </span>
                        <button
                            type="button"
                            onClick={signOut}
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
                    className="btn-icon md:hidden"
                    aria-label="Menu"
                    aria-expanded={mobileOpen}
                >
                    {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
            </div>

            {/* Mobile sheet */}
            {mobileOpen && (
                <div className="border-t bg-card md:hidden">
                    <nav className="shell-width flex flex-col gap-1 py-3">
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
                        {email ? (
                            <>
                                <Link
                                    href="/library"
                                    className="flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-semibold hover:bg-secondary"
                                >
                                    <Library className="h-4 w-4" />
                                    My library
                                </Link>
                                {isAdmin && (
                                    <Link
                                        href="/admin"
                                        className="flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-semibold hover:bg-secondary"
                                    >
                                        <ShieldCheck className="h-4 w-4" />
                                        Admin
                                    </Link>
                                )}
                                <button
                                    type="button"
                                    onClick={signOut}
                                    className="flex min-h-12 items-center gap-3 rounded-md px-3 text-left text-sm font-semibold text-muted-foreground hover:bg-secondary"
                                >
                                    <LogOut className="h-4 w-4" />
                                    Sign out
                                </button>
                            </>
                        ) : (
                            <div className="flex gap-2 px-1 py-2">
                                <Link href="/auth/login" className="btn-outline flex-1">
                                    Sign in
                                </Link>
                                <Link href="/auth/signup" className="btn-primary flex-1">
                                    Create account
                                </Link>
                            </div>
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
