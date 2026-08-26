'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { reportRequestFailure } from '@/lib/apiErrors';
import {
    AlertTriangle,
    BadgeCheck,
    Ban,
    BookOpen,
    Eye,
    EyeOff,
    FileUp,
    Loader2,
    Lock,
    Plus,
    Tags,
    Trash2,
    Users, Layers, ClipboardCheck, KeyRound} from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import { ROLE_LABELS, useRole, type Role } from '@/lib/roles';
import { examTypeName, formatPrice } from '@/lib/catalog';
import type { Order, PaperListing } from '@/types/shop';

type Tab = 'payments' | 'catalog' | 'team';

interface TeamMember {
    id: string;
    email: string;
    full_name?: string;
    role: Role;
    created_at: string;
}

interface DiagnosticCheck {
    id: string;
    label: string;
    ok: boolean;
    detail: string;
    fix: string | null;
}

interface Summary {
    paid_orders: number;
    pending_orders: number;
    revenue_cents: number;
    papers_published: number;
    papers_sold: number;
    active_subscribers: number;
    subscription_revenue_cents: number;
}

/**
 * ADMIN CONSOLE
 *
 * Everything needed to run the shop: confirm the payments that came in by
 * paybill, manage what is listed and at what price, and appoint the admins who
 * upload papers. Owner-only actions are gated in the UI and again in the
 * database.
 */
export default function AdminPage() {
    const { isAdmin, isOwner, role, ready, signedIn } = useRole();
    const [tab, setTab] = useState<Tab>('payments');
    const [pendingReview, setPendingReview] = useState(0);

    const [orders, setOrders] = useState<Order[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [papers, setPapers] = useState<PaperListing[]>([]);
    const [team, setTeam] = useState<TeamMember[]>([]);
    const [diagnostics, setDiagnostics] = useState<DiagnosticCheck[] | null>(null);
    const [mpesaTest, setMpesaTest] = useState<{ ok: boolean; detail: string; fix?: string | null } | null>(null);
    const [testingMpesa, setTestingMpesa] = useState(false);
    const [storageTest, setStorageTest] = useState<{
        ok: boolean;
        detail: string;
        fix?: string | null;
        cors?: { ok: boolean; detail: string; fix?: string | null } | null;
    } | null>(null);
    const [testingStorage, setTestingStorage] = useState(false);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);

    const loadPayments = useCallback(async () => {
        const res = await fetch('/api/admin/orders?status=awaiting_confirmation');
        const data = await res.json();
        if (!res.ok || data.error) {
            reportRequestFailure(res, data, 'Could not load payments');
            return;
        }
        setOrders(data.orders || []);
        setSummary(data.summary || null);
    }, []);

    const loadCatalog = useCallback(async () => {
        const res = await fetch('/api/admin/papers');
        const data = await res.json();
        if (!res.ok || data.error) {
            reportRequestFailure(res, data, 'Could not load the catalog');
            return;
        }
        setPapers(data.papers || []);
    }, []);

    const loadDiagnostics = useCallback(async () => {
        const res = await fetch('/api/admin/diagnostics');
        const data = await res.json();
        if (!data.error) setDiagnostics(data.checks || []);
    }, []);

    const loadTeam = useCallback(async () => {
        const res = await fetch('/api/admin/team');
        const data = await res.json();
        if (!res.ok || data.error) {
            reportRequestFailure(res, data, 'Could not load the team');
            return;
        }
        setTeam(data.team || []);
    }, []);

    useEffect(() => {
        if (!ready || !isAdmin) return;
        setLoading(true);
        Promise.all([loadPayments(), loadCatalog(), loadTeam(), loadDiagnostics()]).finally(() =>
            setLoading(false)
        );
    }, [ready, isAdmin, loadPayments, loadCatalog, loadTeam, loadDiagnostics]);

    /*
     * How much is waiting to be read. Fetched on its own rather than inside the
     * batch above so a slow or failing count never holds up the page — a badge
     * that is briefly absent is better than an admin screen that is briefly
     * blank, and this one is only a number.
     */
    useEffect(() => {
        if (!ready || !isAdmin) return;
        fetch('/api/admin/questions/review?status=pending')
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => setPendingReview(d?.total ?? 0))
            .catch(() => undefined);
    }, [ready, isAdmin]);

    const testMpesa = async () => {
        setTestingMpesa(true);
        try {
            const res = await fetch('/api/admin/mpesa/test', { method: 'POST' });
            const data = await res.json();
            setMpesaTest({ ok: Boolean(data.ok), detail: data.detail || data.error || 'No answer', fix: data.fix });
        } catch (err) {
            setMpesaTest({ ok: false, detail: err instanceof Error ? err.message : 'Could not reach Safaricom' });
        } finally {
            setTestingMpesa(false);
        }
    };

    const testStorage = async () => {
        setTestingStorage(true);
        try {
            const res = await fetch('/api/admin/storage/test', { method: 'POST' });
            const data = await res.json();
            setStorageTest({
                ok: Boolean(data.ok),
                detail: data.detail || data.error || 'No answer',
                fix: data.fix,
                cors: data.cors,
            });
        } catch (err) {
            setStorageTest({
                ok: false,
                detail: err instanceof Error ? err.message : 'Could not reach storage',
            });
        } finally {
            setTestingStorage(false);
        }
    };

    // ------------------------------------------------------------------ actions

    const settleOrder = async (order: Order, action: 'confirm' | 'reject') => {
        setBusyId(order.id);
        try {
            const res = await fetch('/api/admin/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order_id: order.id, action, receipt: order.provider_ref }),
            });
            const data = await res.json();
            if (!res.ok) {
                reportRequestFailure(res, data, 'Could not update the order');
                return;
            }
            toast.success(data.message);
            await Promise.all([loadPayments(), loadCatalog()]);
        } finally {
            setBusyId(null);
        }
    };

    const togglePublished = async (paper: PaperListing) => {
        setBusyId(paper.id);
        try {
            const res = await fetch(`/api/papers/${paper.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_published: !paper.is_published }),
            });
            const data = await res.json();
            if (!res.ok) {
                reportRequestFailure(res, data, 'Could not update the paper');
                return;
            }
            setPapers((current) =>
                current.map((p) => (p.id === paper.id ? { ...p, is_published: !paper.is_published } : p))
            );
            toast.success(paper.is_published ? 'Unpublished — hidden from the shop' : 'Published to the shop');
        } finally {
            setBusyId(null);
        }
    };

    const updatePrice = async (paper: PaperListing, shillings: number) => {
        const cents = Math.max(0, Math.round(shillings * 100));
        if (cents === paper.price_cents) return;
        setBusyId(paper.id);
        try {
            const res = await fetch(`/api/papers/${paper.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ price_cents: cents }),
            });
            const data = await res.json();
            if (!res.ok) {
                reportRequestFailure(res, data, 'Could not update the price');
                return;
            }
            setPapers((current) => current.map((p) => (p.id === paper.id ? { ...p, price_cents: cents } : p)));
            toast.success(`Now listed at ${formatPrice(cents)}`);
        } finally {
            setBusyId(null);
        }
    };

    const deletePaper = async (paper: PaperListing) => {
        setBusyId(paper.id);
        try {
            const res = await fetch(`/api/admin/papers?id=${paper.id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) {
                reportRequestFailure(res, data, 'Could not delete the paper');
                return;
            }
            setPapers((current) => current.filter((p) => p.id !== paper.id));
            toast.success('Paper deleted');
        } finally {
            setBusyId(null);
        }
    };

    // ------------------------------------------------------------------- gating

    if (ready && !signedIn) {
        return (
            <Gate
                title="Sign in to continue"
                body="The admin console is for the shop owner and the admins they appoint."
            />
        );
    }
    if (ready && !isAdmin) {
        return (
            <Gate
                title="You do not have admin access"
                body="Only the shop owner and admins can upload and price papers. You can still set your own exams and buy papers."
            />
        );
    }

    const tabs: { id: Tab; label: string; count?: number }[] = [
        { id: 'payments', label: 'Payments', count: orders.length },
        { id: 'catalog', label: 'Catalog', count: papers.length },
        { id: 'team', label: 'Team', count: team.length },
    ];

    return (
        <div className="min-h-screen bg-background">
            <TopNav />

            <div className="shell-width py-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <p className="overline mb-2">Skulbase Exams</p>
                        <h1 className="display-2">Shop admin</h1>
                        <p className="meta mt-2">
                            Signed in as {role ? ROLE_LABELS[role] : 'user'}
                            {isOwner ? ' — you can appoint admins' : ''}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Link href="/papers/bulk" className="btn-buy">
                            <Layers className="h-4 w-4" />
                            Bulk upload
                        </Link>
                        <Link href="/papers/new" className="btn-outline">
                            <FileUp className="h-4 w-4" />
                            One paper
                        </Link>
                        <Link href="/set" className="btn-outline">
                            <Plus className="h-4 w-4" />
                            Set a paper
                        </Link>
                    </div>
                </div>

                {/* Configuration — only shown when something is actually wrong,
                    so a healthy deployment does not carry a permanent banner. */}
                {diagnostics && diagnostics.some((c) => !c.ok) && (
                    <section className="surface mt-6 border-accent/40 bg-accent/[0.04] p-5">
                        <div className="rule-heading mb-3">
                            <h2 className="overline text-accent">Needs configuration</h2>
                        </div>
                        <ul className="space-y-3">
                            {diagnostics
                                .filter((c) => !c.ok)
                                .map((check) => (
                                    <li key={check.id} className="flex items-start gap-3 text-sm">
                                        <AlertTriangle
                                            className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                                            aria-hidden
                                        />
                                        <span>
                                            <span className="font-semibold">{check.label}:</span> {check.detail}
                                            {check.fix && (
                                                <span className="figure mt-1 block text-[11px] text-muted-foreground">
                                                    {check.fix}
                                                </span>
                                            )}
                                        </span>
                                    </li>
                                ))}
                        </ul>
                        <p className="meta mt-4">
                            Environment variables only apply to new deployments — redeploy after changing them.
                        </p>
                    </section>
                )}

                {/* Proving the payment route works should not require a customer
                    to fail at it, so the handshake can be run on demand. */}
                <section className="surface mt-6 p-5">
                    <div className="rule-heading mb-3">
                        <h2 className="overline">Payments</h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            onClick={testMpesa}
                            disabled={testingMpesa}
                            className="btn-outline"
                        >
                            {testingMpesa ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            Test M-Pesa credentials
                        </button>
                        <span className="meta">
                            Asks Safaricom whether your keys are accepted. No prompt is sent and no money moves.
                        </span>
                    </div>
                    {mpesaTest && (
                        <p
                            className={
                                mpesaTest.ok
                                    ? 'mt-3 text-sm text-emerald-700 dark:text-emerald-400'
                                    : 'mt-3 text-sm text-accent'
                            }
                        >
                            {mpesaTest.detail}
                            {mpesaTest.fix && (
                                <span className="figure mt-1 block text-[11px] text-muted-foreground">
                                    {mpesaTest.fix}
                                </span>
                            )}
                        </p>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            onClick={testStorage}
                            disabled={testingStorage}
                            className="btn-outline"
                        >
                            {testingStorage ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            Test paper storage
                        </button>
                        <span className="meta">
                            Writes a few bytes to the bucket, reads them back and deletes them. No paper is
                            touched.
                        </span>
                    </div>
                    {storageTest && (
                        <div className="mt-3 space-y-1">
                            <p
                                className={
                                    storageTest.ok
                                        ? 'text-sm text-emerald-700 dark:text-emerald-400'
                                        : 'text-sm text-accent'
                                }
                            >
                                {storageTest.detail}
                            </p>
                            {storageTest.fix && (
                                <p className="figure text-[11px] text-muted-foreground">{storageTest.fix}</p>
                            )}
                            {/*
                             * The CORS verdict is reported separately because it fails
                             * separately: the round trip above can pass completely while
                             * every browser upload is still refused.
                             */}
                            {storageTest.cors && (
                                <>
                                    <p
                                        className={
                                            storageTest.cors.ok
                                                ? 'text-sm text-emerald-700 dark:text-emerald-400'
                                                : 'text-sm text-accent'
                                        }
                                    >
                                        {storageTest.cors.detail}
                                    </p>
                                    {storageTest.cors.fix && (
                                        <pre className="figure overflow-x-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-2 text-[11px] text-muted-foreground">
                                            {storageTest.cors.fix}
                                        </pre>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </section>

                {/* Numbers */}
                {summary && (
                    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Metric label="Revenue" value={formatPrice(summary.revenue_cents)} />
                        <Metric label="Paid orders" value={summary.paid_orders} />
                        <Metric label="Awaiting payment" value={summary.pending_orders} accent />
                        <Metric label="Papers listed" value={summary.papers_published} />
                        <Metric label="Copies sold" value={summary.papers_sold} />
                        {/* Subscription revenue is already counted inside Revenue
                            above; it is broken out because the two are worth
                            watching apart — recurring income is the number that
                            says whether the shop is becoming a business. */}
                        <Metric label="Subscribers" value={summary.active_subscribers ?? 0} />
                        <Metric
                            label="Of that, subscriptions"
                            value={formatPrice(summary.subscription_revenue_cents ?? 0)}
                        />
                    </div>
                )}

                {/* Question bank tools */}
                <div className="mt-6 flex flex-wrap gap-2">
                    <Link href="/admin/questions" className="chip">
                        <BookOpen className="h-3.5 w-3.5" />
                        Question bank
                    </Link>
                    <Link href="/admin/topics" className="chip">
                        <Tags className="h-3.5 w-3.5" />
                        Topics &amp; strands
                    </Link>
                    {/* The count is the point: a review queue nobody can see the
                        size of is a queue that never gets worked. */}
                    <Link href="/admin/review" className={pendingReview > 0 ? 'chip chip-active' : 'chip'}>
                        <ClipboardCheck className="h-3.5 w-3.5" />
                        Review queue
                        {pendingReview > 0 && <span className="figure ml-1 text-[11px]">{pendingReview}</span>}
                    </Link>
                    <Link href="/admin/keys" className="chip">
                        <KeyRound className="h-3.5 w-3.5" />
                        Ingest keys
                    </Link>
                </div>

                {/* Tabs */}
                <div className="mt-6 flex gap-1 border-b border-border">
                    {tabs.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setTab(t.id)}
                            className={`-mb-px min-h-11 border-b-2 px-4 text-sm font-semibold transition-colors ${
                                tab === t.id
                                    ? 'border-primary text-foreground'
                                    : 'border-transparent text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {t.label}
                            {typeof t.count === 'number' && (
                                <span className="figure ml-1.5 text-[11px] text-muted-foreground">{t.count}</span>
                            )}
                        </button>
                    ))}
                </div>

                <div className="mt-6">
                    {loading ? (
                        <div className="skeleton h-40" />
                    ) : tab === 'payments' ? (
                        <PaymentsQueue orders={orders} busyId={busyId} onSettle={settleOrder} />
                    ) : tab === 'catalog' ? (
                        <CatalogTable
                            papers={papers}
                            busyId={busyId}
                            onTogglePublished={togglePublished}
                            onUpdatePrice={updatePrice}
                            onDelete={deletePaper}
                        />
                    ) : (
                        <TeamPanel team={team} isOwner={isOwner} onChanged={loadTeam} />
                    )}
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// PAYMENTS
// ============================================================================

function PaymentsQueue({
    orders,
    busyId,
    onSettle,
}: {
    orders: Order[];
    busyId: string | null;
    onSettle: (order: Order, action: 'confirm' | 'reject') => void;
}) {
    if (orders.length === 0) {
        return (
            <div className="surface px-6 py-14 text-center">
                <BadgeCheck className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
                <h2 className="title-2">Nothing waiting</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    Orders paid by M-Pesa express confirm themselves. Ones paid to the paybill land here for you to
                    verify.
                </p>
            </div>
        );
    }

    return (
        <div className="surface divide-y divide-border">
            {orders.map((order) => (
                <div key={order.id} className="flex flex-wrap items-center gap-4 p-4">
                    <div className="min-w-0 flex-1">
                        <p className="figure text-sm font-bold">{order.reference}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {order.items?.length ?? 0} paper{(order.items?.length ?? 0) === 1 ? '' : 's'} ·{' '}
                            {order.phone || 'no phone given'} ·{' '}
                            {new Date(order.created_at).toLocaleString('en-KE', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                            })}
                        </p>
                        {order.items && order.items.length > 0 && (
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                                {order.items.map((i) => i.title).join(', ')}
                            </p>
                        )}
                    </div>

                    <div className="text-right">
                        <p className="figure text-sm font-bold">
                            {formatPrice(order.total_cents, order.currency)}
                        </p>
                        {order.provider_ref && (
                            <p className="figure text-[11px] text-muted-foreground">{order.provider_ref}</p>
                        )}
                    </div>

                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => onSettle(order, 'confirm')}
                            disabled={busyId === order.id}
                            className="btn-primary btn-sm"
                        >
                            {busyId === order.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <BadgeCheck className="h-3.5 w-3.5" />
                            )}
                            Confirm
                        </button>
                        <button
                            type="button"
                            onClick={() => onSettle(order, 'reject')}
                            disabled={busyId === order.id}
                            className="btn-outline btn-sm"
                        >
                            <Ban className="h-3.5 w-3.5" />
                            Reject
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ============================================================================
// CATALOG
// ============================================================================

function CatalogTable({
    papers,
    busyId,
    onTogglePublished,
    onUpdatePrice,
    onDelete,
}: {
    papers: PaperListing[];
    busyId: string | null;
    onTogglePublished: (paper: PaperListing) => void;
    onUpdatePrice: (paper: PaperListing, shillings: number) => void;
    onDelete: (paper: PaperListing) => void;
}) {
    if (papers.length === 0) {
        return (
            <div className="surface px-6 py-14 text-center">
                <FileUp className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
                <h2 className="title-2">No papers listed yet</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    Drop a folder of PDFs and let the covers be read for you, upload one at a time,
                    or build a paper in the setter and publish it.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                    <Link href="/papers/bulk" className="btn-buy inline-flex">
                        <Layers className="h-4 w-4" />
                        Bulk upload
                    </Link>
                    <Link href="/papers/new" className="btn-outline inline-flex">
                        <FileUp className="h-4 w-4" />
                        One paper
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="surface divide-y divide-border">
            {papers.map((paper) => (
                <div key={paper.id} className="flex flex-wrap items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                        <Link
                            href={`/papers/${paper.slug || paper.id}`}
                            className="heading-ui block truncate hover:text-primary"
                        >
                            {paper.title}
                        </Link>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {[
                                paper.subject,
                                paper.grade_label,
                                examTypeName(paper.exam_type),
                                paper.year,
                                paper.has_marking_scheme ? 'with scheme' : null,
                            ]
                                .filter(Boolean)
                                .join(' · ')}
                        </p>
                    </div>

                    <span className="figure text-[11px] text-muted-foreground">
                        {paper.purchase_count} sold · {paper.download_count} downloads
                    </span>

                    <PriceField paper={paper} disabled={busyId === paper.id} onCommit={onUpdatePrice} />

                    <button
                        type="button"
                        onClick={() => onTogglePublished(paper)}
                        disabled={busyId === paper.id}
                        className={paper.is_published ? 'btn-outline btn-sm' : 'btn-primary btn-sm'}
                    >
                        {paper.is_published ? (
                            <>
                                <EyeOff className="h-3.5 w-3.5" />
                                Unpublish
                            </>
                        ) : (
                            <>
                                <Eye className="h-3.5 w-3.5" />
                                Publish
                            </>
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={() => onDelete(paper)}
                        disabled={busyId === paper.id}
                        className="btn-icon hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Delete ${paper.title}`}
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                </div>
            ))}
        </div>
    );
}

/** Inline price editing — the field an admin touches most often. */
function PriceField({
    paper,
    disabled,
    onCommit,
}: {
    paper: PaperListing;
    disabled: boolean;
    onCommit: (paper: PaperListing, shillings: number) => void;
}) {
    const [value, setValue] = useState(String(paper.price_cents / 100));

    return (
        <label className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">KES</span>
            <input
                type="number"
                min={0}
                step={10}
                value={value}
                disabled={disabled}
                onChange={(e) => setValue(e.target.value)}
                onBlur={() => onCommit(paper, Number(value) || 0)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                className="field w-24 py-1.5 text-right tabular-nums"
                aria-label={`Price for ${paper.title}`}
            />
        </label>
    );
}

// ============================================================================
// TEAM
// ============================================================================

function TeamPanel({
    team,
    isOwner,
    onChanged,
}: {
    team: TeamMember[];
    isOwner: boolean;
    onChanged: () => void;
}) {
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);

    const setRole = async (targetEmail: string, role: 'admin' | 'user') => {
        setBusy(true);
        try {
            const res = await fetch('/api/admin/team', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: targetEmail, role }),
            });
            const data = await res.json();
            if (!res.ok) {
                reportRequestFailure(res, data, 'Could not update the role');
                return;
            }
            toast.success(data.message);
            setEmail('');
            onChanged();
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-6">
            {isOwner && (
                <div className="surface p-5">
                    <h2 className="overline">Appoint an admin</h2>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        Admins upload papers, set prices, publish and confirm payments. They need an account here
                        already.
                    </p>
                    <div className="mt-4 flex gap-2">
                        <input
                            type="email"
                            className="field"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="teacher@school.ac.ke"
                            aria-label="Email of the person to make an admin"
                        />
                        <button
                            type="button"
                            onClick={() => setRole(email, 'admin')}
                            disabled={busy || !email.includes('@')}
                            className="btn-primary shrink-0"
                        >
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                            Make admin
                        </button>
                    </div>
                </div>
            )}

            <div className="surface divide-y divide-border">
                {team.map((member) => (
                    <div key={member.id} className="flex items-center gap-4 p-4">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {(member.full_name || member.email || '?').slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{member.full_name || member.email}</p>
                            <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                        </div>
                        <span className="badge-soft">{ROLE_LABELS[member.role]}</span>
                        {isOwner && member.role === 'admin' && (
                            <button
                                type="button"
                                onClick={() => setRole(member.email, 'user')}
                                disabled={busy}
                                className="btn-outline btn-sm"
                            >
                                Remove access
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ============================================================================
// SHARED
// ============================================================================

function Metric({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
    return (
        <div className={`surface p-4 ${accent ? 'border-accent/40 bg-accent/5' : ''}`}>
            <p className="overline">{label}</p>
            <p className="figure mt-1.5 text-xl font-bold">{value}</p>
        </div>
    );
}

function Gate({ title, body }: { title: string; body: string }) {
    return (
        <div className="min-h-screen bg-background">
            <TopNav />
            <div className="shell-width py-20 text-center">
                <Lock className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                <h1 className="title-1">{title}</h1>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{body}</p>
                <div className="mt-6 flex justify-center gap-2">
                    <Link href="/catalog" className="btn-primary">
                        Browse papers
                    </Link>
                    <Link href="/set" className="btn-outline">
                        Set an exam
                    </Link>
                </div>
            </div>
        </div>
    );
}
