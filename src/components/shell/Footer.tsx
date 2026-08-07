import React from 'react';
import Link from 'next/link';
import { Mail, MessageCircle } from 'lucide-react';
import { LEVELS } from '@/lib/catalog';
import { RESOURCE_KINDS } from '@/lib/resources';
import { contactChannels } from '@/lib/contact';
import { BrandMark, Wordmark } from '@/components/shell/Wordmark';

/**
 * The site footer — the first shared chrome below the fold this product has had.
 *
 * It exists for the visitor the navigation cannot serve. `TopNav` carries three
 * links because three is all a working surface can hold; everything else a
 * person might want to know — which levels are stocked, what a "record of work"
 * is, who is behind this, how to reach them — had nowhere to live at all. That
 * is what a footer is for, and its absence was the single clearest sign this
 * was a shop rather than a platform.
 *
 * Rendered per page rather than from `layout.tsx`, matching how `TopNav` is
 * already used by twenty pages. Both belong in the layout; moving them is one
 * change and should be its own, so that a mistake in it is not tangled up with
 * a redesign.
 */

/** The kinds worth naming by hand. The full sixteen would be a wall of links. */
const FOOTER_KINDS = [
    'scheme-of-work',
    'lesson-plan',
    'record-of-work',
    'notes',
    'past-paper',
    'setbook-guide',
] as const;

export default function Footer() {
    const year = new Date().getFullYear();
    const channels = contactChannels();

    const kinds = FOOTER_KINDS.map((slug) => RESOURCE_KINDS.find((k) => k.slug === slug)).filter(
        (k): k is NonNullable<typeof k> => Boolean(k)
    );

    return (
        <footer className="mt-20 border-t border-border bg-card">
            <div className="shell-width py-12 sm:py-16">
                <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
                    {/* Who this is */}
                    <div className="sm:col-span-2 lg:col-span-1">
                        <Link href="/" className="group inline-flex items-center gap-2.5">
                            <BrandMark className="h-9 w-9 text-[15px] transition-transform duration-200 group-hover:-rotate-3" />
                            <Wordmark
                                suffix="Exams"
                                className="block font-display text-[17px] font-bold leading-none tracking-[-0.02em]"
                            />
                        </Link>

                        <p className="meta mt-4 max-w-xs">
                            Schemes of work, lesson plans, records of work, notes and exam papers
                            for the Kenyan classroom — Playgroup to Form 4.
                        </p>

                        <p className="meta mt-4 max-w-xs">
                            Pay with M-Pesa. Your download unlocks the moment payment is confirmed,
                            and stays in your library for good.
                        </p>

                        {/* Reachable from the bottom of every page, because the
                            person who needs this most has just had a payment
                            fail and should not have to go hunting. */}
                        {(channels.whatsapp || channels.email) && (
                            <ul className="mt-5 space-y-1.5">
                                {channels.whatsapp && (
                                    <li>
                                        <a
                                            href={`https://wa.me/${channels.whatsapp}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                                        >
                                            <MessageCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                            <span className="figure">
                                                {channels.whatsappDisplay ?? channels.whatsapp}
                                            </span>
                                        </a>
                                    </li>
                                )}
                                {channels.email && (
                                    <li>
                                        <a
                                            href={`mailto:${channels.email}`}
                                            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                                        >
                                            <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                            <span className="figure break-all">{channels.email}</span>
                                        </a>
                                    </li>
                                )}
                            </ul>
                        )}
                    </div>

                    {/* What to browse */}
                    <nav aria-labelledby="footer-browse">
                        <h2 id="footer-browse" className="overline">
                            Browse
                        </h2>
                        <ul className="mt-4 space-y-2.5">
                            <FooterLink href="/catalog">Every resource</FooterLink>
                            {kinds.map((kind) => (
                                <FooterLink key={kind.slug} href={`/catalog/${kind.slug}`}>
                                    {kind.plural}
                                </FooterLink>
                            ))}
                            <FooterLink href="/set">Set your own exam</FooterLink>
                        </ul>
                    </nav>

                    {/* Which class */}
                    <nav aria-labelledby="footer-levels">
                        <h2 id="footer-levels" className="overline">
                            By level
                        </h2>
                        <ul className="mt-4 space-y-2.5">
                            {LEVELS.map((level) => (
                                <FooterLink key={level.slug} href={`/learn/${level.slug}`}>
                                    {level.name}
                                </FooterLink>
                            ))}
                        </ul>
                    </nav>

                    {/* Everything else */}
                    <nav aria-labelledby="footer-company">
                        <h2 id="footer-company" className="overline">
                            Skulbase
                        </h2>
                        <ul className="mt-4 space-y-2.5">
                            <FooterLink href="/learn">The library</FooterLink>
                            <FooterLink href="/about">About us</FooterLink>
                            <FooterLink href="/contact">Contact &amp; help</FooterLink>
                            <FooterLink href="/plans">Passes &amp; pricing</FooterLink>
                            <FooterLink href="/library">Your downloads</FooterLink>
                            <FooterLink href="/auth/login">Sign in</FooterLink>
                        </ul>
                    </nav>
                </div>

                <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
                    <p className="figure text-xs text-muted-foreground">
                        © {year} Skulbase. Built in Kenya, for Kenyan classrooms.
                    </p>
                    <p className="figure text-xs text-muted-foreground">
                        Organised around the KICD curriculum designs · CBC / CBE and 8-4-4
                    </p>
                </div>
            </div>
        </footer>
    );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
    return (
        <li>
            <Link
                href={href}
                className="text-[15px] text-muted-foreground transition-colors hover:text-foreground"
            >
                {children}
            </Link>
        </li>
    );
}
