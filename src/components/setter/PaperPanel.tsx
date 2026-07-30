'use client';

import React from 'react';
import { ArrowDown, ArrowUp, Eye, Save, Sparkles, Tag, Trash2, X } from 'lucide-react';
import LatexRenderer from '@/components/LatexRenderer';
import { paperStats } from '@/services/paperBuilder';
import { EXAM_TYPES, LEVELS, TERMS, catalogYears } from '@/lib/catalog';
import type { Question } from '@/types';

export interface PaperMeta {
    title: string;
    subject: string;
    examType: string;
    levelSlug: string;
    gradeLabel: string;
    termSlug: string;
    year: number;
    duration: string;
    institution: string;
    instructions: string;
}

interface PaperPanelProps {
    meta: PaperMeta;
    questions: Question[];
    saving: boolean;
    onMetaChange: (patch: Partial<PaperMeta>) => void;
    onMove: (index: number, direction: -1 | 1) => void;
    onRemove: (id: string) => void;
    onClear: () => void;
    onPreview: () => void;
    onSave: () => void;
    onOpenAutoBuild: () => void;
    onOpenPublish: () => void;
    /** Only admins and the owner can list a paper for sale. */
    canPublish: boolean;
}

/**
 * The paper being built. Live totals sit at the top because "how many marks am
 * I at?" is the question a setter asks after every single addition.
 */
export default function PaperPanel({
    meta,
    questions,
    saving,
    onMetaChange,
    onMove,
    onRemove,
    onClear,
    onPreview,
    onSave,
    onOpenAutoBuild,
    onOpenPublish,
    canPublish,
}: PaperPanelProps) {
    const stats = paperStats(questions);

    return (
        <div className="flex h-full flex-col">
            {/* Live totals */}
            <div className="border-b border-border bg-secondary/40 p-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold uppercase tracking-widest">Your paper</h2>
                    {questions.length > 0 && (
                        <button
                            type="button"
                            onClick={onClear}
                            className="text-xs font-semibold text-muted-foreground hover:text-destructive"
                        >
                            Clear all
                        </button>
                    )}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                    <Stat label="Questions" value={stats.count} />
                    <Stat label="Marks" value={stats.marks} />
                    <Stat label="Approx." value={`${stats.estimatedMinutes}m`} />
                </div>

                {/* Difficulty spread */}
                {stats.count > 0 && (
                    <div className="mt-3">
                        <div className="flex h-1.5 overflow-hidden rounded-full bg-border">
                            <div
                                className="bg-success"
                                style={{ width: `${(stats.byDifficulty.Easy / stats.count) * 100}%` }}
                            />
                            <div
                                className="bg-accent"
                                style={{ width: `${(stats.byDifficulty.Medium / stats.count) * 100}%` }}
                            />
                            <div
                                className="bg-destructive"
                                style={{ width: `${(stats.byDifficulty.Difficult / stats.count) * 100}%` }}
                            />
                        </div>
                        <p className="mt-1.5 text-[11px] text-muted-foreground">
                            {stats.byDifficulty.Easy} easy · {stats.byDifficulty.Medium} medium ·{' '}
                            {stats.byDifficulty.Difficult} difficult
                            {Object.keys(stats.byTopic).length > 0 &&
                                ` · ${Object.keys(stats.byTopic).length} topic${
                                    Object.keys(stats.byTopic).length === 1 ? '' : 's'
                                }`}
                        </p>
                        {stats.duplicateIds.length > 0 && (
                            <p className="mt-1.5 text-[11px] font-semibold text-destructive">
                                {stats.duplicateIds.length} question
                                {stats.duplicateIds.length === 1 ? '' : 's'} appear twice — remove the repeat.
                            </p>
                        )}
                    </div>
                )}

                <button type="button" onClick={onOpenAutoBuild} className="btn-primary mt-3 w-full">
                    <Sparkles className="h-4 w-4" />
                    Auto-build to a mark target
                </button>
            </div>

            {/* Questions in the paper */}
            <div className="flex-1 scroll-panel p-3">
                {questions.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center px-4 py-10 text-center">
                        <Tag className="mb-3 h-8 w-8 text-muted-foreground" />
                        <p className="text-sm font-semibold">No questions yet</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Add them from the bank, or auto-build to a mark target.
                        </p>
                    </div>
                ) : (
                    <ol className="space-y-2">
                        {questions.map((question, index) => {
                            const subPartMarks = (question.subParts || []).reduce(
                                (sum, p) => sum + (Number(p.marks) || 0),
                                0
                            );
                            const marks = subPartMarks > 0 ? subPartMarks : question.marks;

                            return (
                                <li key={`${question.id}-${index}`} className="surface p-2.5">
                                    <div className="flex items-start gap-2">
                                        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded bg-secondary text-[11px] font-bold tabular-nums">
                                            {index + 1}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="line-clamp-2">
                                                <LatexRenderer content={question.text} className="text-xs leading-relaxed" />
                                            </div>
                                            <p className="mt-1 text-[10px] text-muted-foreground">
                                                {marks} mk · {question.difficulty}
                                                {question.topic ? ` · ${question.topic}` : ''}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 flex-col gap-0.5">
                                            <button
                                                type="button"
                                                onClick={() => onMove(index, -1)}
                                                disabled={index === 0}
                                                className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
                                                aria-label="Move up"
                                            >
                                                <ArrowUp className="h-3 w-3" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onMove(index, 1)}
                                                disabled={index === questions.length - 1}
                                                className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
                                                aria-label="Move down"
                                            >
                                                <ArrowDown className="h-3 w-3" />
                                            </button>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => onRemove(question.id)}
                                            className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                            aria-label="Remove from paper"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                )}
            </div>

            {/* Cover details */}
            <details className="border-t border-border">
                <summary className="cursor-pointer px-4 py-3 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground">
                    Paper details
                </summary>
                <div className="space-y-3 px-4 pb-4">
                    <div>
                        <label className="label" htmlFor="paper-title">
                            Title
                        </label>
                        <input
                            id="paper-title"
                            className="field"
                            value={meta.title}
                            onChange={(e) => onMetaChange({ title: e.target.value })}
                            placeholder="End of Term 2 Examination"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="label" htmlFor="paper-type">
                                Exam type
                            </label>
                            <select
                                id="paper-type"
                                className="field"
                                value={meta.examType}
                                onChange={(e) => onMetaChange({ examType: e.target.value })}
                            >
                                {EXAM_TYPES.map((t) => (
                                    <option key={t.slug} value={t.slug}>
                                        {t.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="label" htmlFor="paper-level">
                                Level
                            </label>
                            <select
                                id="paper-level"
                                className="field"
                                value={meta.levelSlug}
                                onChange={(e) => onMetaChange({ levelSlug: e.target.value, gradeLabel: '' })}
                            >
                                <option value="">Choose…</option>
                                {LEVELS.map((l) => (
                                    <option key={l.slug} value={l.slug}>
                                        {l.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="label" htmlFor="paper-grade">
                                Grade / Form
                            </label>
                            <select
                                id="paper-grade"
                                className="field"
                                value={meta.gradeLabel}
                                onChange={(e) => onMetaChange({ gradeLabel: e.target.value })}
                            >
                                <option value="">Any</option>
                                {(LEVELS.find((l) => l.slug === meta.levelSlug)?.grades ?? []).map((g) => (
                                    <option key={g} value={g}>
                                        {g}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="label" htmlFor="paper-subject">
                                Subject
                            </label>
                            <input
                                id="paper-subject"
                                className="field"
                                value={meta.subject}
                                onChange={(e) => onMetaChange({ subject: e.target.value })}
                                placeholder="Integrated Science"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        <div>
                            <label className="label" htmlFor="paper-term">
                                Term
                            </label>
                            <select
                                id="paper-term"
                                className="field"
                                value={meta.termSlug}
                                onChange={(e) => onMetaChange({ termSlug: e.target.value })}
                            >
                                <option value="">—</option>
                                {TERMS.map((t) => (
                                    <option key={t.slug} value={t.slug}>
                                        {t.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="label" htmlFor="paper-year">
                                Year
                            </label>
                            <select
                                id="paper-year"
                                className="field"
                                value={meta.year}
                                onChange={(e) => onMetaChange({ year: Number(e.target.value) })}
                            >
                                {catalogYears().map((y) => (
                                    <option key={y} value={y}>
                                        {y}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="label" htmlFor="paper-duration">
                                Duration
                            </label>
                            <input
                                id="paper-duration"
                                className="field"
                                value={meta.duration}
                                onChange={(e) => onMetaChange({ duration: e.target.value })}
                                placeholder="2 Hours"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="label" htmlFor="paper-institution">
                            School / institution
                        </label>
                        <input
                            id="paper-institution"
                            className="field"
                            value={meta.institution}
                            onChange={(e) => onMetaChange({ institution: e.target.value })}
                            placeholder="Your school name"
                        />
                    </div>

                    <div>
                        <label className="label" htmlFor="paper-instructions">
                            Instructions to candidates
                        </label>
                        <textarea
                            id="paper-instructions"
                            className="field min-h-20 resize-y"
                            value={meta.instructions}
                            onChange={(e) => onMetaChange({ instructions: e.target.value })}
                        />
                    </div>
                </div>
            </details>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-2 border-t border-border p-3">
                <button
                    type="button"
                    onClick={onPreview}
                    disabled={questions.length === 0}
                    className="btn-outline"
                >
                    <Eye className="h-4 w-4" />
                    Preview
                </button>
                <button
                    type="button"
                    onClick={onSave}
                    disabled={questions.length === 0 || saving}
                    className="btn-primary"
                >
                    <Save className="h-4 w-4" />
                    {saving ? 'Saving…' : 'Save paper'}
                </button>
                {canPublish ? (
                    <button
                        type="button"
                        onClick={onOpenPublish}
                        disabled={questions.length === 0}
                        className="btn-buy col-span-2"
                    >
                        <Tag className="h-4 w-4" />
                        Publish &amp; sell this paper
                    </button>
                ) : (
                    <p className="col-span-2 text-center text-[11px] text-muted-foreground">
                        Saved papers stay private to you. Ask an admin if you want yours listed in the shop.
                    </p>
                )}
            </div>
        </div>
    );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="rounded-lg bg-card px-2.5 py-2 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="text-lg font-black tabular-nums leading-tight">{value}</p>
        </div>
    );
}
