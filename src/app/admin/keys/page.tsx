'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Check, Copy, KeyRound, Loader2, Plus, ShieldOff } from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import { useRole } from '@/lib/roles';

/**
 * INGEST KEYS — the credential a program uses to write into the bank.
 *
 * Shown once, on creation, and never again: only a hash is stored, which is the
 * property worth keeping. A key that cannot be read back out of the database
 * cannot be leaked by a backup, a support query, or the next bug in a screen
 * like this one.
 *
 * Revoked rather than deleted, so the row can still answer "which key was it"
 * long after it stopped working.
 */

interface KeyRow {
    id: string;
    name: string;
    key_prefix: string;
    created_at: string;
    last_used_at: string | null;
    revoked_at: string | null;
}

export default function IngestKeysPage() {
    const { isAdmin, ready } = useRole();

    const [keys, setKeys] = useState<KeyRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [name, setName] = useState('');
    const [minting, setMinting] = useState(false);
    const [fresh, setFresh] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/ingest-keys');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not load keys');
            setKeys(data.keys || []);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not load keys');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isAdmin) void load();
    }, [isAdmin, load]);

    const mint = async () => {
        if (!name.trim()) return toast.error('Give the key a name');
        setMinting(true);
        try {
            const res = await fetch('/api/admin/ingest-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not create the key');
            setFresh(data.key);
            setName('');
            setCopied(false);
            void load();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not create the key');
        } finally {
            setMinting(false);
        }
    };

    const revoke = async (id: string, keyName: string) => {
        if (!confirm(`Revoke "${keyName}"? Anything using it stops working immediately.`)) return;
        try {
            const res = await fetch(`/api/admin/ingest-keys?id=${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not revoke');
            toast.success('Revoked');
            void load();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not revoke');
        }
    };

    if (!ready) {
        return <Shell><div className="py-20 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></div></Shell>;
    }
    if (!isAdmin) {
        return (
            <Shell>
                <div className="py-20 text-center">
                    <h1 className="title-1">Staff only</h1>
                    <p className="lead mx-auto mt-3 max-w-md">Ingest keys are an admin action.</p>
                </div>
            </Shell>
        );
    }

    return (
        <Shell>
            <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Admin
            </Link>

            <header className="mt-6 max-w-2xl">
                <p className="overline">Ingest keys</p>
                <h1 className="display-2 mt-3">Let a program write into the bank</h1>
                <p className="lead mt-4">
                    A key lets the MCP server submit questions for review and read the curriculum.
                    It cannot publish, price, or see an order — so a lost laptop costs you a revoked
                    key and nothing else.
                </p>
            </header>

            {fresh && (
                <div className="mt-8 rounded-[var(--radius)] border border-accent/40 bg-accent/[0.07] p-5">
                    <p className="overline">Copy this now</p>
                    <p className="meta mt-1.5">
                        Only a hash is stored, so this cannot be shown again. Lose it and mint another.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        <code className="figure min-w-0 flex-1 break-all rounded-[var(--radius)] border border-border bg-card px-3 py-2.5 text-xs">
                            {fresh}
                        </code>
                        <button
                            type="button"
                            onClick={() => {
                                void navigator.clipboard.writeText(fresh);
                                setCopied(true);
                                toast.success('Copied');
                            }}
                            className="btn-primary btn-sm shrink-0"
                        >
                            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            {copied ? 'Copied' : 'Copy'}
                        </button>
                    </div>
                    <button type="button" onClick={() => setFresh(null)} className="btn-ghost btn-sm mt-3">
                        I have saved it
                    </button>
                </div>
            )}

            <section className="surface mt-8 p-5">
                <h2 className="overline">New key</h2>
                <div className="mt-4 flex flex-wrap items-end gap-3">
                    <div className="min-w-0 flex-1">
                        <label className="label" htmlFor="keyname">What is it for?</label>
                        <input
                            id="keyname"
                            className="field"
                            placeholder="Claude on my laptop"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && mint()}
                        />
                    </div>
                    <button type="button" onClick={mint} disabled={minting} className="btn-buy shrink-0">
                        {minting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Mint key
                    </button>
                </div>
            </section>

            <section className="mt-10">
                <div className="rule-heading">
                    <h2 className="overline">Keys</h2>
                </div>

                {loading ? (
                    <div className="mt-5 space-y-2">
                        {Array.from({ length: 2 }).map((_, i) => <div key={i} className="skeleton h-16 w-full" />)}
                    </div>
                ) : keys.length === 0 ? (
                    <p className="meta mt-5">No keys yet. Mint one above, then follow <code className="figure">mcp/README.md</code>.</p>
                ) : (
                    <ul className="mt-5 space-y-2">
                        {keys.map((k) => (
                            <li key={k.id} className={`sheet flex flex-wrap items-center gap-4 p-4 ${k.revoked_at ? 'opacity-60' : ''}`}>
                                <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                                <div className="min-w-0 flex-1">
                                    <p className="heading-ui truncate">{k.name}</p>
                                    <p className="figure meta mt-1">
                                        {k.key_prefix}… · created {new Date(k.created_at).toLocaleDateString()}
                                        {k.last_used_at
                                            ? ` · last used ${new Date(k.last_used_at).toLocaleDateString()}`
                                            : ' · never used'}
                                    </p>
                                </div>
                                {k.revoked_at ? (
                                    <span className="badge-soft shrink-0">Revoked</span>
                                ) : (
                                    <button type="button" onClick={() => revoke(k.id, k.name)} className="btn-outline btn-sm shrink-0">
                                        <ShieldOff className="h-3.5 w-3.5" aria-hidden />
                                        Revoke
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </Shell>
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
