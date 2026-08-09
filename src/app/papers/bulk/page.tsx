'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
    AlertTriangle, ArrowLeft, CheckCircle2, FileText, Loader2, Sparkles, Trash2, Upload,
} from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import { useRole } from '@/lib/roles';
import { EXAM_TYPES, LEVELS, TERMS, formatPrice } from '@/lib/catalog';
import { RESOURCE_KINDS } from '@/lib/resources';

/**
 * BULK LISTING — a folder of PDFs becomes a stocked shop.
 *
 * `/papers/new` lists one paper and asks for ten fields to do it. That is the
 * right shape for one paper and the reason the shop had two: stocking a hundred
 * meant several hours of typing facts that are already printed on the covers.
 *
 * So: drop the stack, let the classifier read the covers, correct what it got
 * wrong in a grid, publish the lot. The fields are identical to the single
 * form's — this is the same listing action with the typing removed, not a
 * second way to list a paper.
 *
 * Nothing here writes to `exams` directly. Confirming calls the same
 * `/api/papers/upload` the single form calls, once per row, so the set
 * resolution, slug uniqueness and entitlement rules stay in exactly one place.
 */

type Stage = 'idle' | 'uploading' | 'classifying' | 'review' | 'publishing' | 'done';

interface Row {
    key: string;
    filename: string;
    ok: boolean;
    error?: string;
    is_marking_scheme?: boolean;
    pairs_with?: string | null;
    title: string;
    subject: string;
    level_slug: string;
    grade_label: string;
    exam_type: string;
    resource_kind: string;
    term_slug: string;
    year: string;
    total_marks: string;
    time_limit: string;
    institution: string;
    confidence?: 'high' | 'medium' | 'low';
    published?: 'pending' | 'ok' | 'failed';
    publishError?: string;
}

const DEFAULT_PRICE = 30;

export default function BulkUploadPage() {
    const { isAdmin, ready } = useRole();
    const inputRef = useRef<HTMLInputElement>(null);

    const [stage, setStage] = useState<Stage>('idle');
    const [files, setFiles] = useState<File[]>([]);
    const [rows, setRows] = useState<Row[]>([]);
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [priceKes, setPriceKes] = useState(String(DEFAULT_PRICE));
    const [publishNow, setPublishNow] = useState(true);

    const papers = useMemo(() => rows.filter((r) => !r.is_marking_scheme), [rows]);
    const schemes = useMemo(() => rows.filter((r) => r.is_marking_scheme), [rows]);
    const unreadable = useMemo(() => rows.filter((r) => !r.ok), [rows]);

    const pick = (list: FileList | null) => {
        if (!list) return;
        const pdfs = Array.from(list).filter((f) => f.type === 'application/pdf');
        const rejected = list.length - pdfs.length;
        if (rejected > 0) toast.error(`${rejected} file${rejected === 1 ? '' : 's'} skipped — PDFs only`);
        if (pdfs.length === 0) return;
        setFiles((current) => [...current, ...pdfs].slice(0, 60));
    };

    /** Sign, upload straight to storage, then ask the classifier to read them. */
    const run = useCallback(async () => {
        if (files.length === 0) return;
        setStage('uploading');
        setProgress({ done: 0, total: files.length });

        try {
            const uploaded: { key: string; filename: string }[] = [];

            // Signed one file at a time: the ticket route names keys from a stem,
            // and a shared stem across a stack would collide.
            for (const file of files) {
                const signRes = await fetch('/api/papers/upload/sign', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        stem: file.name.replace(/\.pdf$/i, ''),
                        files: [{ kind: 'paper', contentType: file.type, size: file.size }],
                    }),
                });
                const signed = await signRes.json();
                if (!signRes.ok) throw new Error(signed.error || `Could not authorise ${file.name}`);

                const ticket = signed.tickets?.[0];
                const put = await fetch(ticket.url, {
                    method: ticket.method || 'PUT',
                    headers: { 'Content-Type': file.type, ...(ticket.headers || {}) },
                    body: file,
                });
                if (!put.ok) throw new Error(`Upload failed for ${file.name}`);

                uploaded.push({ key: ticket.key, filename: file.name });
                setProgress((p) => ({ ...p, done: p.done + 1 }));
            }

            setStage('classifying');
            const res = await fetch('/api/papers/bulk/classify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: uploaded }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not read the uploads');

            /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
            setRows((data.classifications as any[]).map(toRow));
            setStage('review');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Something went wrong');
            setStage('idle');
        }
    }, [files]);

    /** Publish, one row at a time, through the same route the single form uses. */
    const publish = async () => {
        setStage('publishing');
        const cents = Math.max(0, Math.round(Number(priceKes) || 0) * 100);
        let ok = 0;

        for (const row of papers) {
            const scheme = schemes.find((s) => s.pairs_with === row.key);
            setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, published: 'pending' } : r)));

            try {
                const res = await fetch('/api/papers/upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        pdf_storage_key: row.key,
                        marking_scheme_storage_key: scheme?.key ?? null,
                        meta: {
                            title: row.title,
                            subject: row.subject,
                            level_slug: row.level_slug || null,
                            grade_label: row.grade_label || null,
                            exam_type: row.exam_type || null,
                            resource_kind: row.resource_kind || 'past-paper',
                            term_slug: row.term_slug || null,
                            year: row.year ? Number(row.year) : null,
                            total_marks: row.total_marks ? Number(row.total_marks) : 0,
                            time_limit: row.time_limit || null,
                            institution: row.institution || null,
                            price_cents: cents,
                            is_published: publishNow,
                        },
                    }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Rejected');
                ok++;
                setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, published: 'ok' } : r)));
            } catch (err) {
                setRows((rs) =>
                    rs.map((r) =>
                        r.key === row.key
                            ? { ...r, published: 'failed', publishError: err instanceof Error ? err.message : 'Failed' }
                            : r
                    )
                );
            }
        }

        setStage('done');
        toast[ok === papers.length ? 'success' : 'error'](
            `${ok} of ${papers.length} listed${ok === papers.length ? '' : ' — the rest are marked below'}`
        );
    };

    const set = (key: string, field: keyof Row, value: string) =>
        setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)));

    if (!ready) {
        return (
            <div className="min-h-screen bg-background">
                <TopNav />
                <div className="shell-width py-20 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            </div>
        );
    }

    if (!isAdmin) {
        return (
            <div className="min-h-screen bg-background">
                <TopNav />
                <div className="shell-width py-20 text-center">
                    <h1 className="title-1">Staff only</h1>
                    <p className="lead mx-auto mt-3 max-w-md">
                        Listing resources for sale is an admin action. You can still build your own
                        papers in the setter.
                    </p>
                    <Link href="/set" className="btn-primary mt-6 inline-flex">Set an exam</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <TopNav />

            <main className="shell-width py-8 sm:py-12">
                <Link
                    href="/admin"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                    Admin
                </Link>

                <header className="mt-6 max-w-2xl">
                    <p className="overline">Bulk listing</p>
                    <h1 className="display-2 mt-3">Stock the shop from a folder</h1>
                    <p className="lead mt-4">
                        Drop the PDFs. Each cover is read for its subject, class, term and marks, and
                        marking schemes are matched to their papers. You correct anything that is
                        wrong, then list the lot.
                    </p>
                </header>

                {(stage === 'idle' || stage === 'uploading' || stage === 'classifying') && (
                    <section className="mt-10">
                        <button
                            type="button"
                            onClick={() => inputRef.current?.click()}
                            disabled={stage !== 'idle'}
                            className="ruled w-full rounded-[var(--radius)] border-2 border-dashed border-border p-12 text-center transition-colors hover:border-primary/40 disabled:opacity-60"
                        >
                            <Upload className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden />
                            <p className="heading-ui mt-4">Choose PDFs</p>
                            <p className="meta mt-1">Papers and their marking schemes together · up to 60 · 25 MB each</p>
                        </button>
                        <input
                            ref={inputRef}
                            type="file"
                            accept="application/pdf"
                            multiple
                            className="hidden"
                            onChange={(e) => pick(e.target.files)}
                        />

                        {files.length > 0 && (
                            <div className="surface mt-5 p-5">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <h2 className="overline">{files.length} file{files.length === 1 ? '' : 's'} ready</h2>
                                    {stage === 'idle' && (
                                        <button type="button" onClick={() => setFiles([])} className="btn-ghost btn-sm">
                                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                            Clear
                                        </button>
                                    )}
                                </div>
                                <ul className="mt-4 max-h-52 space-y-1 overflow-y-auto scroll-panel">
                                    {files.map((f) => (
                                        <li key={f.name} className="meta flex items-center gap-2">
                                            <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                            <span className="truncate">{f.name}</span>
                                        </li>
                                    ))}
                                </ul>

                                <button
                                    type="button"
                                    onClick={run}
                                    disabled={stage !== 'idle'}
                                    className="btn-primary mt-5 w-full"
                                >
                                    {stage === 'uploading' ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                            Uploading {progress.done} of {progress.total}
                                        </>
                                    ) : stage === 'classifying' ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                            Reading the covers…
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="h-4 w-4" aria-hidden />
                                            Upload and read {files.length} file{files.length === 1 ? '' : 's'}
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </section>
                )}

                {(stage === 'review' || stage === 'publishing' || stage === 'done') && (
                    <section className="mt-10">
                        <div className="flex flex-wrap items-end justify-between gap-4">
                            <div>
                                <h2 className="title-2">
                                    {papers.length} paper{papers.length === 1 ? '' : 's'}
                                    {schemes.length > 0 && `, ${schemes.length} marking scheme${schemes.length === 1 ? '' : 's'}`}
                                </h2>
                                <p className="meta mt-1">Check each row. Anything blank was not printed on the cover.</p>
                            </div>

                            {stage !== 'done' && (
                                <div className="flex flex-wrap items-end gap-3">
                                    <div>
                                        <label className="label" htmlFor="price">Price each (KES)</label>
                                        <input
                                            id="price"
                                            type="number"
                                            min="0"
                                            value={priceKes}
                                            onChange={(e) => setPriceKes(e.target.value)}
                                            className="field w-32"
                                        />
                                    </div>
                                    <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                                        <input
                                            type="checkbox"
                                            checked={publishNow}
                                            onChange={(e) => setPublishNow(e.target.checked)}
                                            className="h-4 w-4"
                                        />
                                        Publish immediately
                                    </label>
                                    <button
                                        type="button"
                                        onClick={publish}
                                        disabled={stage === 'publishing' || papers.length === 0}
                                        className="btn-buy"
                                    >
                                        {stage === 'publishing' ? (
                                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                        ) : null}
                                        List {papers.length} at {formatPrice(Math.round(Number(priceKes) || 0) * 100)}
                                    </button>
                                </div>
                            )}
                        </div>

                        {unreadable.length > 0 && (
                            <p className="mt-5 flex items-start gap-2 rounded-[var(--radius)] border border-accent/30 bg-accent/[0.07] p-4 text-sm">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                                <span>
                                    {unreadable.length} file{unreadable.length === 1 ? '' : 's'} could not be read —
                                    usually a scan with no text layer. Those rows need filling in by hand.
                                </span>
                            </p>
                        )}

                        <div className="mt-6 space-y-3">
                            {papers.map((row) => (
                                <PaperRow
                                    key={row.key}
                                    row={row}
                                    scheme={schemes.find((s) => s.pairs_with === row.key)}
                                    onChange={set}
                                    locked={stage !== 'review'}
                                />
                            ))}
                        </div>

                        {schemes.some((s) => !s.pairs_with) && (
                            <p className="meta mt-6">
                                Unpaired marking schemes:{' '}
                                {schemes.filter((s) => !s.pairs_with).map((s) => s.filename).join(', ')} — rename them to
                                match their paper and upload again, or attach them individually in{' '}
                                <Link href="/papers/new" className="font-semibold text-primary hover:underline">
                                    single upload
                                </Link>
                                .
                            </p>
                        )}

                        {stage === 'done' && (
                            <div className="ruled mt-10 rounded-[var(--radius)] border border-border p-8 text-center">
                                <CheckCircle2 className="mx-auto h-7 w-7 text-success" aria-hidden />
                                <h2 className="title-1 mt-4">Listed</h2>
                                <div className="mt-6 flex flex-wrap justify-center gap-3">
                                    <Link href="/catalog" className="btn-primary">See them in the shop</Link>
                                    <button
                                        type="button"
                                        onClick={() => { setFiles([]); setRows([]); setStage('idle'); }}
                                        className="btn-outline"
                                    >
                                        Upload more
                                    </button>
                                </div>
                            </div>
                        )}
                    </section>
                )}
            </main>
        </div>
    );
}

function PaperRow({
    row, scheme, onChange, locked,
}: {
    row: Row;
    scheme?: Row;
    onChange: (key: string, field: keyof Row, value: string) => void;
    locked: boolean;
}) {
    const state = row.published;

    return (
        <article
            className={`sheet p-4 ${state === 'failed' ? 'border-destructive/40' : ''} ${
                state === 'ok' ? 'opacity-70' : ''
            }`}
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <p className="meta flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span className="truncate">{row.filename}</span>
                        {scheme && <span className="badge-soft shrink-0">+ scheme</span>}
                        {row.confidence && row.confidence !== 'high' && (
                            <span className="badge-soft shrink-0">{row.confidence} confidence</span>
                        )}
                    </p>
                    {row.error && <p className="mt-1.5 text-xs text-accent">{row.error}</p>}
                    {row.publishError && <p className="mt-1.5 text-xs text-destructive">{row.publishError}</p>}
                </div>
                {state === 'ok' && <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden />}
                {state === 'pending' && <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" aria-hidden />}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Title" span>
                    <input className="field" value={row.title} disabled={locked}
                        onChange={(e) => onChange(row.key, 'title', e.target.value)} />
                </Field>
                <Field label="Subject">
                    <input className="field" value={row.subject} disabled={locked}
                        onChange={(e) => onChange(row.key, 'subject', e.target.value)} />
                </Field>
                <Field label="What it is">
                    <select className="field" value={row.resource_kind} disabled={locked}
                        onChange={(e) => onChange(row.key, 'resource_kind', e.target.value)}>
                        {RESOURCE_KINDS.map((k) => <option key={k.slug} value={k.slug}>{k.name}</option>)}
                    </select>
                </Field>
                <Field label="Level">
                    <select className="field" value={row.level_slug} disabled={locked}
                        onChange={(e) => onChange(row.key, 'level_slug', e.target.value)}>
                        <option value="">—</option>
                        {LEVELS.map((l) => <option key={l.slug} value={l.slug}>{l.name}</option>)}
                    </select>
                </Field>
                <Field label="Class">
                    <input className="field" value={row.grade_label} disabled={locked} placeholder="Grade 9"
                        onChange={(e) => onChange(row.key, 'grade_label', e.target.value)} />
                </Field>
                <Field label="Sitting">
                    <select className="field" value={row.exam_type} disabled={locked}
                        onChange={(e) => onChange(row.key, 'exam_type', e.target.value)}>
                        <option value="">—</option>
                        {EXAM_TYPES.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
                    </select>
                </Field>
                <Field label="Term">
                    <select className="field" value={row.term_slug} disabled={locked}
                        onChange={(e) => onChange(row.key, 'term_slug', e.target.value)}>
                        <option value="">—</option>
                        {TERMS.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
                    </select>
                </Field>
                <Field label="Year">
                    <input className="field" type="number" value={row.year} disabled={locked}
                        onChange={(e) => onChange(row.key, 'year', e.target.value)} />
                </Field>
                <Field label="Marks">
                    <input className="field" type="number" value={row.total_marks} disabled={locked}
                        onChange={(e) => onChange(row.key, 'total_marks', e.target.value)} />
                </Field>
                <Field label="School / source">
                    <input className="field" value={row.institution} disabled={locked}
                        onChange={(e) => onChange(row.key, 'institution', e.target.value)} />
                </Field>
            </div>
        </article>
    );
}

function Field({ label, span, children }: { label: string; span?: boolean; children: React.ReactNode }) {
    return (
        <div className={span ? 'sm:col-span-2' : ''}>
            <label className="label">{label}</label>
            {children}
        </div>
    );
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function toRow(c: any): Row {
    return {
        key: c.key,
        filename: c.filename,
        ok: Boolean(c.ok),
        error: c.error,
        is_marking_scheme: Boolean(c.is_marking_scheme),
        pairs_with: c.pairs_with ?? null,
        title: c.title || c.filename?.replace(/\.pdf$/i, '') || '',
        subject: c.subject || '',
        level_slug: c.level_slug || '',
        grade_label: c.grade_label || '',
        exam_type: c.exam_type || '',
        resource_kind: c.resource_kind || 'past-paper',
        term_slug: c.term_slug || '',
        year: c.year ? String(c.year) : '',
        total_marks: c.total_marks ? String(c.total_marks) : '',
        time_limit: c.time_limit || '',
        institution: c.institution || '',
        confidence: c.confidence,
    };
}
