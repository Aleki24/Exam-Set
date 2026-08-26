'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
    ArrowLeft, Check, CheckCheck, Loader2, Pencil, Sparkles, X,
} from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import FigureControl from '@/components/admin/FigureControl';
import { useRole } from '@/lib/roles';

/**
 * THE REVIEW QUEUE.
 *
 * The one thing standing between generated content and a teacher who paid for
 * it. So the screen shows the whole question and its marking scheme side by
 * side rather than a truncated list — a queue that is faster to approve than to
 * read is not a review, and would leave the site making a claim about its stock
 * that nobody had checked.
 *
 * Editing in place is offered because most of what arrives is nearly right, and
 * a reviewer who can only accept or bin will bin things worth keeping.
 */

type Status = 'pending' | 'approved' | 'rejected';

interface Q {
    id: string;
    text: string;
    marks: number;
    marking_scheme: string | null;
    topic: string | null;
    subtopic: string | null;
    type: string | null;
    difficulty: string | null;
    subject: string | null;
    grade: string | null;
    is_ai_generated: boolean;
    review_status: Status;
    image_path: string | null;
    image_caption: string | null;
    image_required: boolean;
}

interface Facets {
    subjects: { id: string; name: string; count: number }[];
    grades: { id: string; name: string; count: number }[];
    topics: { name: string; count: number }[];
    missingScheme: number;
    statusTotal: number;
}

export default function ReviewPage() {
    const { isAdmin, ready } = useRole();

    const [status, setStatus] = useState<Status>('pending');
    const [questions, setQuestions] = useState<Q[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState<string | null>(null);

    // Narrowing the queue. A reviewer works one subject at a time; the whole
    // queue in one list is why a queue this size stops getting worked.
    const [subject, setSubject] = useState('');
    const [grade, setGrade] = useState('');
    const [topic, setTopic] = useState('');
    const [search, setSearch] = useState('');
    const [onlyMissingScheme, setOnlyMissingScheme] = useState(false);
    const [facets, setFacets] = useState<Facets | null>(null);

    // Typing in the search box must not fire a request per keystroke.
    const [debouncedSearch, setDebouncedSearch] = useState('');
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 350);
        return () => clearTimeout(t);
    }, [search]);

    const load = useCallback(async () => {
        setLoading(true);
        setSelected(new Set());
        try {
            const params = new URLSearchParams({ status });
            if (subject) params.set('subject', subject);
            if (grade) params.set('grade', grade);
            if (topic) params.set('topic', topic);
            if (debouncedSearch) params.set('q', debouncedSearch);
            if (onlyMissingScheme) params.set('missing_scheme', '1');

            const res = await fetch(`/api/admin/questions/review?${params}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not load the queue');
            setQuestions(data.questions || []);
            setTotal(data.total || 0);
            setFacets(data.facets ?? null);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not load the queue');
        } finally {
            setLoading(false);
        }
    }, [status, subject, grade, topic, debouncedSearch, onlyMissingScheme]);

    const clearFilters = () => {
        setSubject('');
        setGrade('');
        setTopic('');
        setSearch('');
        setOnlyMissingScheme(false);
    };
    const filtered = Boolean(subject || grade || topic || search || onlyMissingScheme);

    useEffect(() => {
        if (isAdmin) void load();
    }, [isAdmin, load]);

    const decide = async (ids: string[], decision: Status) => {
        if (ids.length === 0) return;
        setBusy(true);
        try {
            const res = await fetch('/api/admin/questions/review', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids, decision }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'That did not go through');
            toast.success(`${ids.length} ${decision}`);
            setQuestions((qs) => qs.filter((q) => !ids.includes(q.id)));
            setTotal((t) => Math.max(0, t - ids.length));
            setSelected(new Set());
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'That did not go through');
        } finally {
            setBusy(false);
        }
    };

    const saveEdit = async (id: string, patch: Partial<Q>) => {
        try {
            const res = await fetch('/api/admin/questions/review', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, ...patch }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not save');
            setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)));
            setEditing(null);
            toast.success('Saved');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not save');
        }
    };

    /**
     * Fold a change the card already saved back into the list.
     *
     * `FigureControl` talks to its own endpoint, so by the time this runs the
     * write has happened. This only keeps the copy on screen honest — without
     * it, attaching a figure and then approving would render the row from stale
     * state and the thumbnail would vanish.
     */
    const applyPatch = useCallback(
        (id: string, patch: Partial<Q>) =>
            setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q))),
        []
    );

    const toggle = (id: string) =>
        setSelected((s) => {
            const next = new Set(s);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    if (!ready) {
        return (
            <Shell>
                <div className="py-20 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            </Shell>
        );
    }

    if (!isAdmin) {
        return (
            <Shell>
                <div className="py-20 text-center">
                    <h1 className="title-1">Staff only</h1>
                    <p className="lead mx-auto mt-3 max-w-md">Reviewing the question bank is an admin action.</p>
                </div>
            </Shell>
        );
    }

    return (
        <Shell>
            <Link
                href="/admin"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Admin
            </Link>

            <header className="mt-6 max-w-2xl">
                <p className="overline">Question review</p>
                <h1 className="display-2 mt-3">What has not been read yet</h1>
                <p className="lead mt-4">
                    Nothing here can appear in a paper that is sold until it is approved. Read the
                    question and its marking scheme together — that pairing is what a buyer is
                    paying for.
                </p>
            </header>

            <div className="mt-8 flex flex-wrap items-center gap-2">
                {(['pending', 'approved', 'rejected'] as Status[]).map((s) => (
                    <button
                        key={s}
                        type="button"
                        onClick={() => setStatus(s)}
                        className={status === s ? 'chip chip-active' : 'chip'}
                    >
                        {s[0].toUpperCase() + s.slice(1)}
                        {status === s && <span className="figure ml-1 text-[11px]">{total}</span>}
                    </button>
                ))}
            </div>

            {/*
              * Filters. Every option carries its own count and the list is built
              * from what is actually in this queue, so nothing offered here can
              * return an empty screen.
              */}
            <div className="surface mt-4 p-3">
                <div className="flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor="review-search">Search the queue</label>
                    <input
                        id="review-search"
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search question text or topic…"
                        className="input min-w-[13rem] flex-1"
                    />

                    <label className="sr-only" htmlFor="review-subject">Learning area</label>
                    <select
                        id="review-subject"
                        value={subject}
                        onChange={(e) => { setSubject(e.target.value); setTopic(''); }}
                        className="input w-auto"
                    >
                        <option value="">All learning areas</option>
                        {(facets?.subjects ?? []).map((s) => (
                            <option key={s.id} value={s.id}>{s.name} ({s.count})</option>
                        ))}
                    </select>

                    <label className="sr-only" htmlFor="review-grade">Grade</label>
                    <select
                        id="review-grade"
                        value={grade}
                        onChange={(e) => setGrade(e.target.value)}
                        className="input w-auto"
                    >
                        <option value="">All grades</option>
                        {(facets?.grades ?? []).map((g) => (
                            <option key={g.id} value={g.id}>{g.name} ({g.count})</option>
                        ))}
                    </select>

                    <label className="sr-only" htmlFor="review-topic">Strand</label>
                    <select
                        id="review-topic"
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        className="input w-auto max-w-[16rem]"
                    >
                        <option value="">All strands</option>
                        {(facets?.topics ?? []).map((t) => (
                            <option key={t.name} value={t.name}>{t.name} ({t.count})</option>
                        ))}
                    </select>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-3">
                    {/*
                      * The 203-question backlog, findable at last. These are the
                      * cheapest stock in the bank — already written, blocked on
                      * one field — and until now there was no way to select them.
                      */}
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={onlyMissingScheme}
                            onChange={(e) => setOnlyMissingScheme(e.target.checked)}
                        />
                        Needs a marking scheme
                        {facets ? <span className="figure text-[11px] text-muted-foreground">{facets.missingScheme}</span> : null}
                    </label>

                    <span className="meta">
                        {loading
                            ? 'Loading…'
                            : filtered
                              ? `${total} of ${facets?.statusTotal ?? total} ${status}`
                              : `${total} ${status}`}
                    </span>

                    {filtered && (
                        <button type="button" onClick={clearFilters} className="btn-ghost btn-sm">
                            Clear filters
                        </button>
                    )}
                </div>
            </div>

            {selected.size > 0 && (
                <div className="bar-blur sticky top-16 z-30 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-border p-3">
                    <p className="heading-ui">{selected.size} selected</p>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => decide([...selected], 'approved')}
                            className="btn-primary btn-sm"
                        >
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
                            Approve
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => decide([...selected], 'rejected')}
                            className="btn-outline btn-sm"
                        >
                            <X className="h-3.5 w-3.5" />
                            Reject
                        </button>
                        <button type="button" onClick={() => setSelected(new Set())} className="btn-ghost btn-sm">
                            Clear
                        </button>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="mt-8 space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="surface p-5">
                            <div className="skeleton h-3 w-24" />
                            <div className="skeleton mt-3 h-4 w-full" />
                            <div className="skeleton mt-2 h-4 w-2/3" />
                        </div>
                    ))}
                </div>
            ) : questions.length === 0 ? (
                <div className="surface ruled mt-8 px-6 py-16 text-center">
                    <Check className="mx-auto h-8 w-8 text-success" aria-hidden />
                    <h2 className="title-1 mt-4">Nothing {status}</h2>
                    <p className="lead mx-auto mt-3 max-w-md">
                        {status === 'pending'
                            ? 'The queue is clear. Anything a model writes will land here.'
                            : `No questions are ${status}.`}
                    </p>
                </div>
            ) : (
                <div className="mt-8 space-y-3">
                    {questions.map((q) => (
                        <QuestionCard
                            key={q.id}
                            q={q}
                            selected={selected.has(q.id)}
                            onToggle={() => toggle(q.id)}
                            editing={editing === q.id}
                            onEdit={() => setEditing(editing === q.id ? null : q.id)}
                            onSave={(patch) => saveEdit(q.id, patch)}
                            onDecide={(d) => decide([q.id], d)}
                            onPatch={(patch) => applyPatch(q.id, patch)}
                            busy={busy}
                        />
                    ))}
                </div>
            )}
        </Shell>
    );
}

function QuestionCard({
    q, selected, onToggle, editing, onEdit, onSave, onDecide, onPatch, busy,
}: {
    q: Q;
    selected: boolean;
    onToggle: () => void;
    editing: boolean;
    onEdit: () => void;
    onSave: (patch: Partial<Q>) => void;
    onDecide: (d: Status) => void;
    onPatch: (patch: Partial<Q>) => void;
    busy: boolean;
}) {
    const [text, setText] = useState(q.text);
    const [scheme, setScheme] = useState(q.marking_scheme ?? '');
    const [marks, setMarks] = useState(String(q.marks));

    const noScheme = !q.marking_scheme || q.marking_scheme.trim() === '';

    return (
        <article className={`sheet p-5 ${selected ? 'border-primary' : ''}`}>
            <div className="flex flex-wrap items-start gap-3">
                <input
                    type="checkbox"
                    checked={selected}
                    onChange={onToggle}
                    className="mt-1 h-4 w-4 shrink-0"
                    aria-label="Select this question"
                />
                <div className="min-w-0 flex-1">
                    <p className="overline flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>{q.subject || 'No subject'}</span>
                        <span>{q.grade || 'No class'}</span>
                        <span>{q.topic || 'No topic'}</span>
                        <span className="figure">{q.marks} marks</span>
                        {q.is_ai_generated && (
                            <span className="badge-soft">
                                <Sparkles className="h-3 w-3" aria-hidden />
                                Machine-written
                            </span>
                        )}
                    </p>

                    {editing ? (
                        <div className="mt-4 space-y-3">
                            <div>
                                <label className="label">Question</label>
                                <textarea className="field min-h-24 py-2" value={text} onChange={(e) => setText(e.target.value)} />
                            </div>
                            <div>
                                <label className="label">Marking scheme</label>
                                <textarea className="field min-h-24 py-2" value={scheme} onChange={(e) => setScheme(e.target.value)} />
                            </div>
                            <div className="flex flex-wrap items-end gap-3">
                                <div>
                                    <label className="label">Marks</label>
                                    <input className="field w-24" type="number" value={marks} onChange={(e) => setMarks(e.target.value)} />
                                </div>
                                <button
                                    type="button"
                                    className="btn-primary btn-sm"
                                    onClick={() => onSave({ text, marking_scheme: scheme, marks: Number(marks) || q.marks })}
                                >
                                    Save
                                </button>
                                <button type="button" className="btn-ghost btn-sm" onClick={onEdit}>Cancel</button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{q.text}</p>

                            <div className="mt-4 border-t border-border pt-3">
                                <p className="overline">Marking scheme</p>
                                {noScheme ? (
                                    <p className="mt-1.5 text-sm text-accent">
                                        None recorded — this cannot be approved until one is added.
                                    </p>
                                ) : (
                                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                                        {q.marking_scheme}
                                    </p>
                                )}
                            </div>

                            <FigureControl
                                questionId={q.id}
                                imagePath={q.image_path}
                                imageCaption={q.image_caption}
                                imageRequired={q.image_required}
                                onChange={onPatch}
                            />
                        </>
                    )}
                </div>
            </div>

            {!editing && (
                <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border pt-3">
                    <button type="button" onClick={onEdit} className="btn-ghost btn-sm">
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                        Edit
                    </button>
                    {q.review_status !== 'rejected' && (
                        <button type="button" disabled={busy} onClick={() => onDecide('rejected')} className="btn-outline btn-sm">
                            <X className="h-3.5 w-3.5" aria-hidden />
                            Reject
                        </button>
                    )}
                    {q.review_status !== 'approved' && (
                        <button
                            type="button"
                            disabled={busy || noScheme}
                            onClick={() => onDecide('approved')}
                            className="btn-primary btn-sm"
                            title={noScheme ? 'Add a marking scheme first' : undefined}
                        >
                            <Check className="h-3.5 w-3.5" aria-hidden />
                            Approve
                        </button>
                    )}
                </div>
            )}
        </article>
    );
}

function Shell({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-background">
            <TopNav />
            <main className="shell-width py-8 sm:py-12">{children}</main>
        </div>
    );
}
