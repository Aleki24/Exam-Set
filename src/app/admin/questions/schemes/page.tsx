'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, CheckSquare, Loader2, Sparkles, Square } from 'lucide-react';

/**
 * FILLING IN THE MISSING MARKING SCHEMES
 * ----------------------------------------------------------------------------
 * Four in five questions in the bank have no marking scheme. This works
 * through them a batch at a time: load a batch, ask the AI to propose a
 * scheme for each, review and edit every one, save only what is checked.
 *
 * Nothing reaches the bank without going through the table on this page. That
 * is the whole safety argument for using AI here — see services/schemeGeneration
 * for why a wrong scheme is a worse mistake than a wrong question: it is
 * invisible until it marks a real answer incorrectly, possibly on a question
 * that is already being sold.
 */

interface CandidateQuestion {
    id: string;
    text: string;
    type: string | null;
    marks: number | null;
    topic: string | null;
    options?: unknown;
}

interface Row {
    question: CandidateQuestion;
    /** Undefined until "Generate proposals" has been run for this batch. */
    scheme?: string;
    confidence?: number;
    /** Set when the AI declined this one — see the module note on why it can. */
    declineReason?: string;
    selected: boolean;
}

export default function SchemeBackfillPage() {
    const [rows, setRows] = useState<Row[]>([]);
    const [remaining, setRemaining] = useState<number | null>(null);
    const [loadingBatch, setLoadingBatch] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const loadBatch = useCallback(async () => {
        setLoadingBatch(true);
        setLoadError(null);
        try {
            const res = await fetch('/api/admin/questions/marking-schemes');
            const data = await res.json();
            if (!res.ok) {
                setLoadError(data.error || 'Could not load questions');
                return;
            }
            setRows((data.questions as CandidateQuestion[]).map((question) => ({ question, selected: true })));
            setRemaining(data.remaining ?? 0);
        } catch {
            setLoadError('Could not reach the server');
        } finally {
            setLoadingBatch(false);
        }
    }, []);

    useEffect(() => {
        loadBatch();
    }, [loadBatch]);

    const generate = async () => {
        if (rows.length === 0) return;
        setGenerating(true);
        try {
            const res = await fetch('/api/admin/questions/marking-schemes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: rows.map((r) => r.question.id) }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || 'Could not generate schemes');
                return;
            }

            const byId = new Map<string, { markingScheme: string | null; confidence: number; reason: string | null }>(
                (data.proposals ?? []).map((p: any) => [p.id, p])
            );

            setRows((current) =>
                current.map((row) => {
                    const proposal = byId.get(row.question.id);
                    if (!proposal) return row;
                    return {
                        ...row,
                        scheme: proposal.markingScheme ?? undefined,
                        confidence: proposal.confidence,
                        declineReason: proposal.markingScheme ? undefined : proposal.reason ?? 'Could not generate',
                        // A decline is unchecked by default: there is nothing to
                        // save, and an admin who writes one by hand can still
                        // check it themselves.
                        selected: Boolean(proposal.markingScheme),
                    };
                })
            );

            const declined = (data.proposals ?? []).filter((p: any) => !p.markingScheme).length;
            if (declined > 0) {
                toast.warning(`${declined} question${declined === 1 ? '' : 's'} could not be generated — see the reason under each.`);
            } else {
                toast.success('Proposals generated — review each before saving.');
            }
        } catch {
            toast.error('Could not reach the server');
        } finally {
            setGenerating(false);
        }
    };

    const save = async () => {
        const toSave = rows.filter((r) => r.selected && r.scheme && r.scheme.trim());
        if (toSave.length === 0) {
            toast.error('Nothing selected to save');
            return;
        }

        setSaving(true);
        try {
            const res = await fetch('/api/admin/questions/marking-schemes', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    updates: toSave.map((r) => ({ id: r.question.id, markingScheme: r.scheme })),
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || 'Could not save');
                return;
            }
            toast.success(data.message);
            // The saved rows are no longer missing a scheme, so the next batch
            // simply will not include them — reload rather than patch state by
            // hand, which is how this stays correct if a row failed to save.
            await loadBatch();
        } catch {
            toast.error('Could not reach the server');
        } finally {
            setSaving(false);
        }
    };

    const toggle = (id: string) => {
        setRows((current) => current.map((r) => (r.question.id === id ? { ...r, selected: !r.selected } : r)));
    };

    const updateScheme = (id: string, value: string) => {
        setRows((current) => current.map((r) => (r.question.id === id ? { ...r, scheme: value } : r)));
    };

    const hasProposals = rows.some((r) => r.scheme !== undefined || r.declineReason !== undefined);
    const selectedCount = rows.filter((r) => r.selected && r.scheme && r.scheme.trim()).length;

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <a
                        href="/admin/questions"
                        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        Question Bank
                    </a>
                    <div className="mt-2 flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-primary" />
                                Fill in marking schemes
                            </h1>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                {remaining === null
                                    ? 'Loading…'
                                    : remaining === 0
                                      ? 'Every question in the bank has a marking scheme.'
                                      : `${remaining} question${remaining === 1 ? '' : 's'} have no marking scheme yet.`}
                            </p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {loadingBatch ? (
                    <div className="flex items-center justify-center py-24 text-gray-400">
                        <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                ) : loadError ? (
                    <div className="flex items-start gap-2 p-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        {loadError}
                    </div>
                ) : rows.length === 0 ? (
                    <div className="text-center py-24">
                        <p className="text-lg font-bold text-gray-900 dark:text-white">Nothing left to do</p>
                        <p className="text-sm text-gray-500 mt-1">Every question in the bank has a marking scheme.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 p-3 text-xs text-gray-500 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                            <Sparkles className="w-4 h-4 shrink-0 text-primary" />
                            Nothing is saved until you press Save below. Read every proposed scheme against
                            the question before checking it in — a wrong scheme marks real answers.
                        </div>

                        <div className="space-y-3">
                            {rows.map((row) => (
                                <div
                                    key={row.question.id}
                                    className={`p-4 border rounded-lg ${
                                        row.selected ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700' : 'bg-gray-50 dark:bg-gray-900/50 border-gray-100 dark:border-gray-800 opacity-70'
                                    }`}
                                >
                                    <div className="flex items-start gap-3">
                                        <button
                                            onClick={() => toggle(row.question.id)}
                                            disabled={!row.scheme}
                                            className="mt-0.5 text-gray-400 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                                            aria-label={row.selected ? 'Deselect' : 'Select'}
                                        >
                                            {row.selected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                                        </button>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">
                                                <span>{row.question.type || 'Structured'}</span>
                                                <span>·</span>
                                                <span>{row.question.marks || 1} mk{(row.question.marks || 1) === 1 ? '' : 's'}</span>
                                                {row.question.topic && (
                                                    <>
                                                        <span>·</span>
                                                        <span>{row.question.topic}</span>
                                                    </>
                                                )}
                                                {typeof row.confidence === 'number' && row.scheme && (
                                                    <>
                                                        <span>·</span>
                                                        <span className={row.confidence < 0.6 ? 'text-amber-600' : 'text-gray-400'}>
                                                            {Math.round(row.confidence * 100)}% confidence
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                            <p className="mt-1 text-sm text-gray-900 dark:text-white">{row.question.text}</p>

                                            {row.scheme !== undefined ? (
                                                <div className="mt-2">
                                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                                                        Proposed marking scheme — edit before saving
                                                    </label>
                                                    <textarea
                                                        value={row.scheme}
                                                        onChange={(e) => updateScheme(row.question.id, e.target.value)}
                                                        rows={3}
                                                        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-primary/20 outline-none resize-none"
                                                    />
                                                </div>
                                            ) : row.declineReason ? (
                                                <div className="mt-2 flex items-start gap-2 p-2.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg">
                                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                                    Could not generate: {row.declineReason}
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </main>

            {rows.length > 0 && !loadError && (
                <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 sm:px-6 lg:px-8 py-3">
                    <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
                        <p className="text-xs text-gray-500">{rows.length} in this batch</p>
                        {!hasProposals ? (
                            <button
                                onClick={generate}
                                disabled={generating}
                                className="inline-flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-lg hover:opacity-90 disabled:opacity-50 text-sm font-bold"
                            >
                                {generating ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Generating…
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-4 h-4" />
                                        Generate proposals
                                    </>
                                )}
                            </button>
                        ) : (
                            <button
                                onClick={save}
                                disabled={saving || selectedCount === 0}
                                className="inline-flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-bold"
                            >
                                {saving ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Saving…
                                    </>
                                ) : (
                                    `Save ${selectedCount} scheme${selectedCount === 1 ? '' : 's'}`
                                )}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
