import React from 'react';
import Link from 'next/link';
import { Mail, MessageCircle, PenSquare } from 'lucide-react';
import { LEVELS } from '@/lib/catalog';
import { RESOURCE_KINDS } from '@/lib/resources';
import { contactChannels } from '@/lib/contact';
import { BrandMark, Wordmark } from '@/components/shell/Wordmark';

/**
 * The site footer — the first shared chrome below the fold this product has had.
 *
 * It exists for the visitor the navigation cannot serve. `TopNav` carries four
 * links because four is all a working surface can hold; everything else a person
 * might want to know — which levels are stocked, what a "record of work" is, who
 * is behind this, how to reach them — had nowhere to live at all.
 *
 * Four nav groups, not three. Three is the number that will not divide: at two
 * columns it lays out as 2 + 1 and leaves a hole beside the last group, which is
 * exactly how this looked on a tablet. Four divides into both two columns and
 * four, so every breakpoint fills. The fourth group is the contact pair, which
 * was buried at the bottom of the brand block and is easier to find here.
 *
 * The brand sits on its own row rather than competing for a column. It carries
 * prose, and prose sets the height of whatever column it lands in.
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
        <footer className="mt-16 border-t border-border bg-card">
            <div className="shell-width py-10 sm:py-14">
                {/* Who this is. Its own row, so its prose cannot set the height
                    of a column of links. */}
                <div className="flex flex-wrap items-end justify-between gap-5 pb-8">
                    <div>
                        <Link href="/" className="group inline-flex items-center gap-2.5">
                            <BrandMark className="h-9 w-9 text-[15px] transition-transform duration-200 group-hover:-rotate-3" />
                            <Wordmark
                                suffix="Exams"
                                className="block font-display text-[17px] font-bold leading-none tracking-[-0.02em]"
                            />
                        </Link>

                        <p className="meta mt-3 max-w-sm">
                            Teaching and revision resources for the Kenyan classroom, Playgroup to
                            Form 4. Paid for with M-Pesa.
                        </p>
                    </div>

                    <Link href="/set" className="btn-outline btn-sm shrink-0">
                        <PenSquare className="h-3.5 w-3.5" aria-hidden />
                        Set your own exam
                    </Link>
                </div>

                {/* Two columns on a phone rather than one: twenty-odd links in a
                    single stack is a scroll nobody finishes. */}
                <nav
                    aria-label="Footer"
                    className="grid grid-cols-2 gap-x-6 gap-y-8 border-t border-border pt-8 lg:grid-cols-4 lg:gap-8"
                >
                    <FooterGroup title="Browse">
                        {kinds.map((kind) => (
                            <FooterLink key={kind.slug} href={`/catalog/${kind.slug}`}>
                                {kind.plural}
                            </FooterLink>
                        ))}
                    </FooterGroup>

                    <FooterGroup title="By level">
                        {LEVELS.map((level) => (
                            <FooterLink key={level.slug} href={`/learn/${level.slug}`}>
                                {level.name}
                            </FooterLink>
                        ))}
                    </FooterGroup>

                    <FooterGroup title="Skulbase">
                        <FooterLink href="/catalog">Every resource</FooterLink>
                        <FooterLink href="/learn">The library</FooterLink>
                        <FooterLink href="/about">About us</FooterLink>
                        <FooterLink href="/plans">Passes &amp; pricing</FooterLink>
                        <FooterLink href="/library">Your downloads</FooterLink>
                        <FooterLink href="/auth/login">Sign in</FooterLink>
                    </FooterGroup>

                    {/* The person who needs this most has just had a payment fail
                        and should not have to go hunting for it. */}
                    <FooterGroup title="Get help">
                        {channels.whatsapp && (
                            <li>
                                <a
                                    href={`https://wa.me/${channels.whatsapp}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 text-[15px] text-muted-foreground transition-colors hover:text-foreground"
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
                                {/* Labelled, not spelled out. The column is about
                                    150px on a phone and the address is longer than
                                    that, so printing it in full breaks it mid-word
                                    ("…@gm / ail.com"). `/contact` has the room. */}
                                <a
                                    href={`mailto:${channels.email}`}
                                    title={channels.email}
                                    className="inline-flex items-center gap-2 text-[15px] text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    Email us
                                </a>
                            </li>
                        )}
                        <FooterLink href="/contact">Contact &amp; FAQs</FooterLink>
                        <FooterLink href="/cart">Your cart</FooterLink>
                    </FooterGroup>
                </nav>

                <div className="mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border pt-6">
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

function FooterGroup({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <h2 className="overline">{title}</h2>
            <ul className="mt-3 space-y-1.5">{children}</ul>
        </div>
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
