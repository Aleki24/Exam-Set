'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
    BadgeCheck,
    Ban,
    BookOpen,
    Eye,
    EyeOff,
    FileUp,
    Loader2,
    Lock,
    Plus,
    Receipt,
    Tags,
    Trash2,
    Users,
} from 'lucide-react';
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

interface Summary {
    paid_orders: number;
    pending_orders: number;
    revenue_cents: number;
    papers_published: number;
    papers_sold: number;
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

    const [orders, setOrders] = useState<Order[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [papers, setPapers] = useState<PaperListing[]>([]);
    const [team, setTeam] = useState<TeamMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);

    const loadPayments = useCallback(async () => {
        const res = await fetch('/api/admin/orders?status=awaiting_confirmation');
        const data = await res.json();
        if (data.error) {
            toast.error(data.error);
            return;
        }
        setOrders(data.orders || []);
        setSummary(data.summary || null);
    }, []);

    const loadCatalog = useCallback(async () => {
        const res = await fetch('/api/admin/papers');
        const data = await res.json();
        if (data.error) {
            toast.error(data.error);
            return;
        }
        setPapers(data.papers || []);
    }, []);

    const loadTeam = useCallback(async () => {
        const res = await fetch('/api/admin/team');
        const data = await res.json();
        if (data.error) {
            toast.error(data.error);
            return;
        }
        setTeam(data.team || []);
    }, []);

    useEffect(() => {
        if (!ready || !isAdmin) return;
        setLoading(true);
        Promise.all([loadPayments(), loadCatalog(), loadTeam()]).finally(() => setLoading(false));
    }, [ready, isAdmin, loadPayments, loadCatalog, loadTeam]);

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
                toast.error(data.error || 'Could not update the order');
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
                toast.error(data.error || 'Could not update the paper');
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
                toast.error(data.error || 'Could not update the price');
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
                toast.error(data.error || 'Could not delete the paper');
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
                        <Link href="/papers/new" className="btn-buy">
                            <FileUp className="h-4 w-4" />
                            Upload a paper
                        </Link>
                        <Link href="/set" className="btn-outline">
                            <Plus className="h-4 w-4" />
                            Set a paper
                        </Link>
                    </div>
                </div>

                {/* Numbers */}
                {summary && (
                    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        <Metric label="Revenue" value={formatPrice(summary.revenue_cents)} />
                        <Metric label="Paid orders" value={summary.paid_orders} />
                        <Metric label="Awaiting payment" value={summary.pending_orders} accent />
                        <Metric label="Papers listed" value={summary.papers_published} />
                        <Metric label="Copies sold" value={summary.papers_sold} />
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
                    <Link href="/admin/templates" className="chip">
                        <Receipt className="h-3.5 w-3.5" />
                        Paper templates
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
                    Upload a PDF, or build one in the setter and publish it.
                </p>
                <Link href="/papers/new" className="btn-buy mt-5 inline-flex">
                    <FileUp className="h-4 w-4" />
                    Upload a paper
                </Link>
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
                toast.error(data.error || 'Could not update the role');
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
                    <Link href="/" className="btn-primary">
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
