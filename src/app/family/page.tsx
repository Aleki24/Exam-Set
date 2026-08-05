'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Check, Eye, Loader2, ShieldCheck, UserPlus, X } from 'lucide-react';
import TopNav from '@/components/shell/TopNav';

interface LinkRow {
    id: string;
    who: string;
    status: 'pending' | 'accepted' | 'revoked';
    invitedAt: string;
    acceptedAt: string | null;
    learnerId: string;
}

interface Summary {
    papersCompleted: number;
    averagePercentage: number | null;
    bestPercentage: number | null;
}

/**
 * FAMILY — following a learner's progress, with their permission.
 *
 * Two halves, and the second one is the point. A parent can ask to follow a
 * learner; a learner sees every request and every accepted follower, and can
 * end any of them at any moment without asking anybody.
 *
 * The page is written to make the consent visible rather than to make it
 * frictionless. A parent is told plainly that the learner must accept, and told
 * plainly what they will and will not be able to see. Nothing here can be done
 * quietly — which is the actual feature, not an obstacle in front of it.
 */
export default function FamilyPage() {
    const [following, setFollowing] = useState<LinkRow[]>([]);
    const [followers, setFollowers] = useState<LinkRow[]>([]);
    const [summaries, setSummaries] = useState<Record<string, Summary>>({});
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(true);
    const [inviting, setInviting] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/guardians');
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setFollowing(data.following ?? []);
            setFollowers(data.followers ?? []);

            // Summaries only for accepted links. The endpoint refuses anything
            // else, so asking for more would just be noise in the log.
            const accepted = (data.following ?? []).filter((l: LinkRow) => l.status === 'accepted');
            const results = await Promise.all(
                accepted.map(async (l: LinkRow) => {
                    const r = await fetch(`/api/guardians/${l.learnerId}/summary`);
                    if (!r.ok) return null;
                    const s = await r.json();
                    return [l.learnerId, s.summary] as const;
                })
            );
            setSummaries(Object.fromEntries(results.filter(Boolean) as [string, Summary][]));
        } catch {
            toast.error('Could not load your family links');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const invite = async () => {
        if (!email.trim()) return;
        setInviting(true);
        try {
            const res = await fetch('/api/guardians', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not send the request');
            toast.success(data.message ?? 'Request sent');
            setEmail('');
            void load();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not send the request');
        } finally {
            setInviting(false);
        }
    };

    const respond = async (id: string, status: 'accepted' | 'revoked') => {
        try {
            const res = await fetch('/api/guardians', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, status }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not update');
            toast.success(status === 'accepted' ? 'They can now see your summary' : 'Ended');
            void load();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not update');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-background">
                <TopNav />
                <main className="shell-width grid place-items-center py-32">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
                </main>
            </div>
        );
    }

    const pendingRequests = followers.filter((f) => f.status === 'pending');
    const activeFollowers = followers.filter((f) => f.status === 'accepted');
    const activeFollowing = following.filter((f) => f.status !== 'revoked');

    return (
        <div className="min-h-screen bg-background">
            <TopNav />

            <main className="shell-width max-w-4xl py-10 sm:py-14">
                <header className="max-w-2xl">
                    <p className="overline">Family</p>
                    <h1 className="display-2 mt-3">Follow a learner&rsquo;s progress</h1>
                    <p className="lead mt-4">
                        With their permission, and only ever a summary — how many papers, the
                        average, and which subjects need work.
                    </p>
                </header>

                {/* Requests waiting on this account come first: somebody is
                    waiting on an answer that only this person can give. */}
                {pendingRequests.length > 0 && (
                    <section aria-labelledby="requests-heading" className="mt-12">
                        <h2 id="requests-heading" className="title-2">
                            Waiting for your answer
                        </h2>
                        <ul className="mt-4 space-y-3">
                            {pendingRequests.map((r) => (
                                <li key={r.id} className="sheet flex flex-wrap items-center gap-4 p-4">
                                    <div className="min-w-0 flex-1">
                                        <p className="heading-ui">{r.who} wants to follow your progress</p>
                                        <p className="meta mt-1 leading-relaxed">
                                            They would see how many papers you have done, your
                                            average, and which subjects to help with. They would not
                                            see your answers, and you can end it whenever you like.
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => respond(r.id, 'accepted')}
                                            className="btn-primary btn-sm"
                                        >
                                            <Check className="h-3.5 w-3.5" aria-hidden />
                                            Allow
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => respond(r.id, 'revoked')}
                                            className="btn-outline btn-sm"
                                        >
                                            <X className="h-3.5 w-3.5" aria-hidden />
                                            Decline
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {/* Who can currently see this account. Rule: a link nobody can
                    see is a link nobody can revoke. */}
                {activeFollowers.length > 0 && (
                    <section aria-labelledby="watchers-heading" className="mt-12">
                        <h2 id="watchers-heading" className="title-2">
                            Who can see your progress
                        </h2>
                        <ul className="mt-4 divide-y divide-border">
                            {activeFollowers.map((f) => (
                                <li key={f.id} className="flex flex-wrap items-center gap-4 py-4">
                                    <div className="min-w-0 flex-1">
                                        <p className="heading-ui inline-flex items-center gap-2">
                                            <Eye className="h-4 w-4 text-muted-foreground" aria-hidden />
                                            {f.who}
                                        </p>
                                        <p className="meta mt-0.5">
                                            Since {formatDate(f.acceptedAt)} · summary only
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => respond(f.id, 'revoked')}
                                        className="btn-ghost btn-sm shrink-0"
                                    >
                                        Stop sharing
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                <section aria-labelledby="invite-heading" className="mt-12">
                    <h2 id="invite-heading" className="title-2">
                        Ask to follow a learner
                    </h2>
                    <p className="meta mt-2 leading-relaxed">
                        Enter the email on their account. They decide — nothing is shared until they
                        say yes, and they can stop at any time.
                    </p>

                    <div className="mt-4 flex flex-wrap gap-3">
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="their@email.com"
                            className="field flex-1 min-w-[16rem]"
                            autoComplete="off"
                        />
                        <button
                            type="button"
                            onClick={invite}
                            disabled={inviting || !email.trim()}
                            className="btn-primary shrink-0"
                        >
                            {inviting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                            <UserPlus className="h-4 w-4" aria-hidden />
                            Send request
                        </button>
                    </div>
                </section>

                {activeFollowing.length > 0 && (
                    <section aria-labelledby="following-heading" className="mt-12">
                        <h2 id="following-heading" className="title-2">
                            Learners you follow
                        </h2>
                        <ul className="mt-4 space-y-3">
                            {activeFollowing.map((l) => {
                                const s = summaries[l.learnerId];
                                return (
                                    <li key={l.id} className="sheet p-4">
                                        <div className="flex flex-wrap items-center gap-4">
                                            <div className="min-w-0 flex-1">
                                                <p className="heading-ui">{l.who}</p>
                                                <p className="meta mt-0.5">
                                                    {l.status === 'pending'
                                                        ? 'Waiting for them to accept'
                                                        : `Sharing since ${formatDate(l.acceptedAt)}`}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => respond(l.id, 'revoked')}
                                                className="btn-ghost btn-sm shrink-0"
                                            >
                                                {l.status === 'pending' ? 'Cancel' : 'Stop following'}
                                            </button>
                                        </div>

                                        {l.status === 'accepted' && s && (
                                            <dl className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
                                                <div>
                                                    <dt className="overline">Papers done</dt>
                                                    <dd className="figure mt-1 text-xl font-semibold">
                                                        {s.papersCompleted}
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt className="overline">Average</dt>
                                                    <dd className="figure mt-1 text-xl font-semibold">
                                                        {s.averagePercentage !== null ? `${s.averagePercentage}%` : '—'}
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt className="overline">Best</dt>
                                                    <dd className="figure mt-1 text-xl font-semibold">
                                                        {s.bestPercentage !== null ? `${s.bestPercentage}%` : '—'}
                                                    </dd>
                                                </div>
                                            </dl>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                )}

                <section className="mt-16 border-t border-border pt-8">
                    <h2 className="heading-ui inline-flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
                        What a follower can and cannot see
                    </h2>
                    <ul className="meta mt-3 space-y-1.5 leading-relaxed">
                        <li>Can see: papers completed, average and best mark, subjects that need work.</li>
                        <li>Cannot see: your answers, individual questions, or anything you have not submitted.</li>
                        <li>You can end any link instantly, without telling them first.</li>
                    </ul>
                    <p className="meta mt-4">
                        <Link href="/progress" className="text-primary hover:underline">
                            See your own full progress
                        </Link>
                    </p>
                </section>
            </main>
        </div>
    );
}

function formatDate(iso: string | null): string {
    if (!iso) return 'recently';
    try {
        return new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
        return 'recently';
    }
}
