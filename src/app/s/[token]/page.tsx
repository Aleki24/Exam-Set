import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarClock, Clock, Lock } from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import { createAdminClient } from '@/utils/supabase/admin';
import { formatPrice } from '@/lib/catalog';
import { resourceKindName } from '@/lib/resources';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Shared with your class | Skulbase Exams',
    // A share link should never be indexed. It is unguessable, but a search
    // engine that finds one in a public WhatsApp export would publish it.
    robots: { index: false, follow: false },
};

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Params {
    params: Promise<{ token: string }>;
}

/**
 * A LIST A TEACHER HANDED THEIR CLASS
 *
 * Opens without an account, on whatever phone the learner has. Shows what the
 * teacher chose and links to each item.
 *
 * What it deliberately does not do is hand out the files. Every link goes to
 * the ordinary resource page, and the ordinary download route still asks
 * `can_download_paper` for whoever is actually asking — so free material is
 * free here exactly as it is everywhere, and paid material still needs an
 * entitlement. The alternative, a link that unlocks whatever the teacher
 * bought, is a paywall with a public bypass: one forward into a WhatsApp group
 * and the catalogue is free for the county.
 *
 * Read with the service role, because the class has no session and there is
 * deliberately no public RLS policy on `class_shares` — a public policy would
 * let anyone enumerate every share on the platform. The token is resolved here
 * and only the fields the class needs are returned.
 */
export default async function SharePage({ params }: Params) {
    const { token } = await params;

    const admin = createAdminClient();
    if (!admin) {
        console.error('Share link opened but the service role is not configured.');
        notFound();
    }

    const { data: share, error } = await admin
        .from('class_shares')
        .select('id, token, title, note, exam_ids, expires_at, revoked_at, due_on, created_by')
        .eq('token', token)
        .maybeSingle();

    if (error) {
        console.error('Share lookup failed:', error.message);
        notFound();
    }

    // Expired, revoked and never-existed are one outcome on purpose. Telling
    // somebody a token *was* valid is telling them tokens of that shape exist.
    if (!share) notFound();

    const expired = new Date(share.expires_at).getTime() < Date.now();
    if (share.revoked_at || expired) return <Ended />;

    const { data: rows } = await admin
        .from('exams')
        .select(
            'id, slug, title, subject, grade_label, exam_type, resource_kind, year, ' +
                'total_marks, question_count, price_cents, currency, has_marking_scheme, is_published'
        )
        .in('id', share.exam_ids.length > 0 ? share.exam_ids : [EMPTY_UUID]);

    // Keep the teacher's order, and drop anything unpublished since — a class
    // should not be sent to a page that no longer exists.
    const byId = new Map((rows ?? []).map((r: any) => [r.id, r]));
    const items = (share.exam_ids as string[])
        .map((id) => byId.get(id))
        .filter((r: any) => r && r.is_published);

    // Fire and forget. A counter that fails must never block the page.
    void admin.rpc('record_share_view', { p_token: token }).then(
        () => undefined,
        () => undefined
    );
    void admin.rpc('record_share_open', { p_token: token }).then(
        () => undefined,
        () => undefined
    );

    return (
        <div className="min-h-screen bg-background">
            <TopNav />

            <main className="shell-width max-w-4xl py-10 sm:py-14">
                <header className="max-w-2xl">
                    <p className="overline">Shared with your class</p>
                    <h1 className="display-2 mt-3">{share.title}</h1>
                    {share.note && <p className="lead mt-4 whitespace-pre-line">{share.note}</p>}

                    {/* The deadline leads when there is one — it is the reason
                        the class opened the link, and burying it under an expiry
                        date nobody asked about would be perverse. */}
                    {share.due_on ? (
                        <Due dueOn={share.due_on} />
                    ) : (
                        <p className="meta mt-4 inline-flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" aria-hidden />
                            This link works until {formatDate(share.expires_at)}
                        </p>
                    )}
                </header>

                {items.length === 0 ? (
                    <div className="ruled mt-12 rounded-[var(--radius)] border border-border p-10 text-center">
                        <h2 className="title-1">Nothing on this list</h2>
                        <p className="lead mx-auto mt-3 max-w-md">
                            The resources on it are no longer available. Ask your teacher for an
                            updated link.
                        </p>
                    </div>
                ) : (
                    <ul className="mt-12 grid gap-3 sm:grid-cols-2">
                        {items.map((item: any, index: number) => {
                            const free = item.price_cents === 0;
                            return (
                                <li key={item.id}>
                                    <Link
                                        href={`/papers/${item.slug || item.id}`}
                                        className="sheet settle-in group flex h-full flex-col p-5"
                                        style={{ '--i': index % 12 } as React.CSSProperties}
                                    >
                                        <p className="overline">
                                            {resourceKindName(item.resource_kind)}
                                        </p>
                                        <h2 className="heading-ui mt-2.5 transition-colors group-hover:text-primary">
                                            {item.title}
                                        </h2>
                                        <p className="meta mt-1.5">
                                            {[item.grade_label, item.subject, item.year]
                                                .filter(Boolean)
                                                .join(' · ')}
                                        </p>

                                        <div className="flex-1" />

                                        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
                                            <span className="figure text-sm font-semibold">
                                                {free ? (
                                                    <span className="text-success">Free</span>
                                                ) : (
                                                    formatPrice(item.price_cents, item.currency)
                                                )}
                                            </span>
                                            {!free && (
                                                <span className="meta inline-flex items-center gap-1">
                                                    <Lock className="h-3 w-3" aria-hidden />
                                                    Sign in to download
                                                </span>
                                            )}
                                        </div>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                )}

                {/* Said once, plainly, so nobody is surprised at the download. */}
                <p className="meta mt-10 border-t border-border pt-6 leading-relaxed">
                    Free resources download straight away. Paid ones need your own account — this
                    link shows you the list your teacher put together, it does not buy them for you.
                </p>
            </main>
        </div>
    );
}

/**
 * How long is left, said the way somebody reads a deadline.
 *
 * "Due in 3 days" is what a learner needs; a date alone makes them do the
 * arithmetic, and on the day itself the arithmetic is the whole message. Late is
 * stated plainly rather than hidden — the link still works, and pretending
 * otherwise helps nobody hand the work in.
 */
function Due({ dueOn }: { dueOn: string }) {
    const today = new Date();
    const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const due = new Date(`${dueOn}T00:00:00`);
    const days = Math.round((due.getTime() - midnight.getTime()) / 86_400_000);

    const label =
        days < 0
            ? `Was due ${formatDate(dueOn)}`
            : days === 0
              ? 'Due today'
              : days === 1
                ? 'Due tomorrow'
                : `Due in ${days} days`;

    const urgent = days <= 1;

    return (
        <p
            className={`mt-4 inline-flex items-center gap-2 rounded-[var(--radius)] border px-3 py-2 text-sm font-semibold ${
                days < 0
                    ? 'border-border text-muted-foreground'
                    : urgent
                      ? 'border-[color:var(--ink-red)]/40 text-[color:var(--ink-red)]'
                      : 'border-primary/40 text-primary'
            }`}
        >
            <CalendarClock className="h-4 w-4" aria-hidden />
            {label}
            <span className="font-normal text-muted-foreground">· {formatDate(dueOn)}</span>
        </p>
    );
}

function Ended() {
    return (
        <div className="min-h-screen bg-background">
            <TopNav />
            <main className="shell-width max-w-2xl py-20 text-center">
                <h1 className="display-2">This link has ended</h1>
                <p className="lead mx-auto mt-4 max-w-md">
                    Share links expire so they cannot be passed on indefinitely. Ask your teacher
                    for a new one, or browse the library yourself.
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                    <Link href="/learn" className="btn-primary">
                        Browse the library
                    </Link>
                </div>
            </main>
        </div>
    );
}

/** `.in()` needs a non-empty list; this matches nothing. */
const EMPTY_UUID = '00000000-0000-0000-0000-000000000000';

function formatDate(iso: string): string {
    try {
        return new Date(iso).toLocaleDateString('en-KE', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        });
    } catch {
        return 'a later date';
    }
}
