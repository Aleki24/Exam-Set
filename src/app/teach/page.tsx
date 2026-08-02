'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Check, Copy, Download, Link2, Loader2, Trash2, Users } from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import { useRole } from '@/lib/roles';
import type { PaperListing } from '@/types/shop';

interface Share {
    id: string;
    token: string;
    title: string;
    note: string | null;
    examIds: string[];
    expiresAt: string;
    revokedAt: string | null;
    viewCount: number;
    openCount: number;
    dueOn: string | null;
    isAssignment: boolean;
    active: boolean;
}

/**
 * TEACHER TOOLS — hand a class a list, and take a term's worth of files at once.
 *
 * Both surfaces are wrapped around checks that already exist rather than around
 * new ones. A share link shows a list and never unlocks a download; a pack asks
 * `can_download_paper` once per resource and reports what it was refused. That
 * is deliberate: the useful version of both features and the dangerous version
 * differ by one decision, and the dangerous one is the one that looks more
 * generous.
 */
export default function TeachPage() {
    const { ready, signedIn } = useRole();

    const [shares, setShares] = useState<Share[]>([]);
    const [owned, setOwned] = useState<PaperListing[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [title, setTitle] = useState('');
    const [note, setNote] = useState('');
    const [dueOn, setDueOn] = useState('');
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [packing, setPacking] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const [sharesRes, libraryRes] = await Promise.all([
                fetch('/api/shares').then((r) => r.json()),
                fetch('/api/library').then((r) => r.json()),
            ]);
            if (Array.isArray(sharesRes.shares)) setShares(sharesRes.shares);
            // The library returns purchases and the teacher's own sets; both are
            // shareable, and both are things they can already download.
            const papers = [...(libraryRes.papers ?? []), ...(libraryRes.sets ?? [])];
            setOwned(papers);
        } catch {
            toast.error('Could not load your tools');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const toggle = (id: string) =>
        setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

    const createShare = async () => {
        if (!title.trim() || selected.length === 0) return;
        setCreating(true);
        try {
            const res = await fetch('/api/shares', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title.trim(),
                    note: note.trim() || null,
                    exam_ids: selected,
                    due_on: dueOn || null,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not create the link');

            setShares((s) => [data.share, ...s]);
            setTitle('');
            setNote('');
            setDueOn('');
            setSelected([]);
            toast.success(dueOn ? 'Assignment ready to share' : 'Link ready to share');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not create the link');
        } finally {
            setCreating(false);
        }
    };

    const endShare = async (id: string) => {
        try {
            const res = await fetch(`/api/shares?id=${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Could not end the link');
            setShares((s) => s.map((x) => (x.id === id ? { ...x, active: false, revokedAt: new Date().toISOString() } : x)));
            toast.success('Link ended');
        } catch {
            toast.error('Could not end the link');
        }
    };

    const copy = async (token: string) => {
        const url = `${window.location.origin}/s/${token}`;
        try {
            await navigator.clipboard.writeText(url);
            setCopied(token);
            setTimeout(() => setCopied(null), 2000);
            toast.success('Link copied');
        } catch {
            // Clipboard is blocked without a secure context or a gesture on some
            // mobile browsers. Showing the URL is better than a failure nobody
            // can act on.
            toast.message('Copy this link', { description: url });
        }
    };

    /**
     * Downloads the selected resources one at a time.
     *
     * Sequential and spaced on purpose. Twelve simultaneous downloads on a
     * mobile connection contend with each other and with the page itself, and
     * browsers block bursts of programmatic downloads as popup-like behaviour.
     * One at a time is slower on paper and finishes sooner in practice.
     */
    const downloadPack = async () => {
        if (selected.length === 0) return;
        setPacking(true);
        try {
            const res = await fetch('/api/packs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ exam_ids: selected, asset: 'both' }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not build the pack');

            for (const item of data.items) {
                const a = document.createElement('a');
                a.href = item.url;
                a.download = item.filename;
                a.rel = 'noopener';
                document.body.appendChild(a);
                a.click();
                a.remove();
                await new Promise((r) => setTimeout(r, 600));
            }

            if (data.refused?.length > 0) {
                toast.warning(
                    `${data.items.length} downloaded, ${data.refused.length} skipped`,
                    { description: data.refused.map((r: { title?: string; reason: string }) => `${r.title ?? 'A resource'}: ${r.reason}`).join('; ') }
                );
            } else {
                toast.success(`${data.items.length} file${data.items.length === 1 ? '' : 's'} downloading`);
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not build the pack');
        } finally {
            setPacking(false);
        }
    };

    if (!ready || loading) {
        return (
            <div className="min-h-screen bg-background">
                <TopNav />
                <main className="shell-width grid place-items-center py-32">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <TopNav />

            <main className="shell-width py-10 sm:py-14">
                <header className="max-w-2xl">
                    <p className="overline">Teacher tools</p>
                    <h1 className="display-2 mt-3">Share with a class, download in one go</h1>
                    <p className="lead mt-4">
                        Pick from what you already own, then either hand your class a link or take
                        every file at once.
                    </p>
                </header>

                {owned.length === 0 ? (
                    <div className="ruled mt-12 rounded-[var(--radius)] border border-border p-10 text-center">
                        <h2 className="title-1">Nothing to share yet</h2>
                        <p className="lead mx-auto mt-3 max-w-md">
                            Anything you buy or set yourself appears here, ready to hand to a class.
                        </p>
                        <div className="mt-6 flex flex-wrap justify-center gap-3">
                            <Link href="/learn" className="btn-primary">
                                Browse the library
                            </Link>
                            <Link href="/set" className="btn-outline">
                                Set a paper
                            </Link>
                        </div>
                    </div>
                ) : (
                    <>
                        <section aria-labelledby="pick-heading" className="mt-12">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                                <h2 id="pick-heading" className="title-2">
                                    Choose resources
                                </h2>
                                <span className="figure text-[11px] text-muted-foreground">
                                    {selected.length} selected
                                </span>
                            </div>

                            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {owned.map((p) => {
                                    const active = selected.includes(p.id);
                                    return (
                                        <li key={p.id}>
                                            <button
                                                type="button"
                                                onClick={() => toggle(p.id)}
                                                aria-pressed={active}
                                                className={`sheet w-full p-5 text-left transition-colors duration-200 ${
                                                    active ? 'border-primary bg-primary/[0.06]' : ''
                                                }`}
                                            >
                                                <span className="flex items-start justify-between gap-3">
                                                    <span className="heading-ui">{p.title}</span>
                                                    {active && (
                                                        <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                                                    )}
                                                </span>
                                                <span className="meta mt-1.5 block">
                                                    {[p.grade_label, p.subject, p.year].filter(Boolean).join(' · ')}
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>

                        {selected.length > 0 && (
                            <section aria-labelledby="act-heading" className="mt-12">
                                <h2 id="act-heading" className="title-2">
                                    What next?
                                </h2>

                                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                                    <div className="surface p-6">
                                        <h3 className="heading-ui inline-flex items-center gap-2">
                                            <Users className="h-4 w-4 text-primary" aria-hidden />
                                            Hand it to a class
                                        </h3>
                                        <p className="meta mt-1.5 leading-relaxed">
                                            A link that shows the list. Free resources open for
                                            anyone; paid ones still need their own account.
                                        </p>

                                        <label htmlFor="share-title" className="overline mt-5 block">
                                            Name
                                        </label>
                                        <input
                                            id="share-title"
                                            value={title}
                                            onChange={(e) => setTitle(e.target.value)}
                                            placeholder="e.g. Grade 9 Term 3 revision"
                                            maxLength={160}
                                            className="field mt-2"
                                        />

                                        <label htmlFor="share-note" className="overline mt-4 block">
                                            Note <span className="normal-case tracking-normal">(optional)</span>
                                        </label>
                                        <textarea
                                            id="share-note"
                                            value={note}
                                            onChange={(e) => setNote(e.target.value)}
                                            rows={2}
                                            maxLength={2000}
                                            placeholder="Do questions 1-10 before Friday"
                                            className="field mt-2"
                                        />

                                        <label htmlFor="share-due" className="overline mt-4 block">
                                            Due date <span className="normal-case tracking-normal">(optional)</span>
                                        </label>
                                        <input
                                            id="share-due"
                                            type="date"
                                            value={dueOn}
                                            onChange={(e) => setDueOn(e.target.value)}
                                            min={new Date().toISOString().slice(0, 10)}
                                            className="field mt-2"
                                        />
                                        <p className="meta mt-1.5 leading-relaxed">
                                            Add one and this becomes an assignment — your class sees
                                            the deadline, and you see how many have done it. The link
                                            stays open a week past the date so late work still opens.
                                        </p>

                                        <button
                                            type="button"
                                            onClick={createShare}
                                            disabled={creating || !title.trim()}
                                            className="btn-primary mt-5 w-full"
                                        >
                                            {creating && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                                            <Link2 className="h-4 w-4" aria-hidden />
                                            {dueOn ? 'Set the assignment' : 'Create the link'}
                                        </button>
                                    </div>

                                    <div className="surface p-6">
                                        <h3 className="heading-ui inline-flex items-center gap-2">
                                            <Download className="h-4 w-4 text-primary" aria-hidden />
                                            Download the lot
                                        </h3>
                                        <p className="meta mt-1.5 leading-relaxed">
                                            Papers and marking schemes, one file at a time so a
                                            dropped connection only costs you the file it was on.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={downloadPack}
                                            disabled={packing}
                                            className="btn-buy mt-5 w-full"
                                        >
                                            {packing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                                            Download {selected.length} resource
                                            {selected.length === 1 ? '' : 's'}
                                        </button>
                                    </div>
                                </div>
                            </section>
                        )}
                    </>
                )}

                {shares.length > 0 && (
                    <section aria-labelledby="links-heading" className="mt-16">
                        <h2 id="links-heading" className="title-2">
                            Your class links and assignments
                        </h2>
                        <ul className="mt-4 divide-y divide-border">
                            {shares.map((s) => (
                                <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
                                    <div className="min-w-0 flex-1">
                                        <p className="heading-ui">
                                            {s.title}
                                            {s.isAssignment && (
                                                <span className="badge-soft ml-2">Assignment</span>
                                            )}
                                        </p>
                                        <p className="meta mt-0.5">
                                            {[
                                                `${s.examIds.length} resource${s.examIds.length === 1 ? '' : 's'}`,
                                                `${s.viewCount} view${s.viewCount === 1 ? '' : 's'}`,
                                                s.isAssignment && s.dueOn
                                                    ? `due ${formatDate(s.dueOn)}`
                                                    : null,
                                                s.active ? `open until ${formatDate(s.expiresAt)}` : 'ended',
                                            ]
                                                .filter(Boolean)
                                                .join(' · ')}
                                        </p>
                                    </div>

                                    {s.active && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => copy(s.token)}
                                                className="btn-outline btn-sm"
                                            >
                                                {copied === s.token ? (
                                                    <Check className="h-3.5 w-3.5" aria-hidden />
                                                ) : (
                                                    <Copy className="h-3.5 w-3.5" aria-hidden />
                                                )}
                                                Copy
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => endShare(s.id)}
                                                className="btn-ghost btn-sm"
                                                aria-label={`End ${s.title}`}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                                End
                                            </button>
                                        </>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {!signedIn && (
                    <p className="meta mt-12">
                        <Link href="/auth/login?next=/teach" className="text-primary hover:underline">
                            Sign in
                        </Link>{' '}
                        to use these tools.
                    </p>
                )}
            </main>
        </div>
    );
}

function formatDate(iso: string): string {
    try {
        return new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
    } catch {
        return 'later';
    }
}
