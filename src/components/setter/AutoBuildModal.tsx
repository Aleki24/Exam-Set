'use client';

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Sparkles, X } from 'lucide-react';
import type { PaperBlueprint } from '@/types/shop';
import { DEFAULT_BLUEPRINT } from '@/types/shop';
import type { Deficit, FeasibilityReport, PaperPlan } from '@/types/paperPlan';

interface AutoBuildModalProps {
    open: boolean;
    poolSize: number;
    topics: string[];
    onClose: () => void;
    onBuild: (blueprint: PaperBlueprint, mode: 'replace' | 'append') => void;
    /** The format KNEC (or convention) sets for this grade and subject, if any. */
    plan?: PaperPlan | null;
    /** What the bank can and cannot supply against that format. */
    feasibility?: FeasibilityReport | null;
    onBuildPlan?: (plan: PaperPlan, mode: 'replace' | 'append') => void;
    /** Opens Quick Add already set up to write what a section is missing. */
    onFillDeficit?: (deficit: Deficit) => void;
}

const PRESETS: { label: string; marks: number; mix: PaperBlueprint['difficultyMix'] }[] = [
    { label: 'CAT · 30 marks', marks: 30, mix: { Easy: 50, Medium: 35, Difficult: 15 } },
    { label: 'End term · 60 marks', marks: 60, mix: { Easy: 40, Medium: 40, Difficult: 20 } },
    { label: 'Mock · 100 marks', marks: 100, mix: { Easy: 30, Medium: 45, Difficult: 25 } },
];

/**
 * Auto-build: describe the paper you want, let the assembler fill it from the
 * bank. The mark target and difficulty mix are the two things a setter actually
 * cares about, so those are the only required inputs.
 */
export default function AutoBuildModal({
    open,
    poolSize,
    topics,
    onClose,
    onBuild,
    plan,
    feasibility,
    onBuildPlan,
    onFillDeficit,
}: AutoBuildModalProps) {
    const [blueprint, setBlueprint] = useState<PaperBlueprint>(DEFAULT_BLUEPRINT);
    const [mode, setMode] = useState<'replace' | 'append'>('replace');
    // The official shape is the default path when there is one — a teacher
    // setting a Grade 9 paper wants the Grade 9 paper, not a mark total.
    const [useFormat, setUseFormat] = useState(true);

    if (!open) return null;

    const hasFormat = Boolean(plan && onBuildPlan);
    const onFormat = hasFormat && useFormat;

    const mixTotal = blueprint.difficultyMix.Easy + blueprint.difficultyMix.Medium + blueprint.difficultyMix.Difficult;

    const patch = (p: Partial<PaperBlueprint>) => setBlueprint((b) => ({ ...b, ...p }));

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
            <div className="absolute inset-0 bg-foreground/50" onClick={onClose} aria-hidden />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="autobuild-title"
                className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-card shadow-2xl sm:rounded-2xl"
            >
                <div className="flex items-center justify-between border-b border-border p-4">
                    <h2 id="autobuild-title" className="title-2 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        Auto-build the paper
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="btn-icon h-9 w-9"
                        aria-label="Close"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="scroll-panel space-y-5 p-4">
                    <p className="text-sm text-muted-foreground">
                        {poolSize} question{poolSize === 1 ? '' : 's'} match your current filters. The builder picks
                        from those, never repeats one, and prefers questions you have used least.
                    </p>

                    {/* The official shape, when one exists for this grade and subject */}
                    {hasFormat && plan && (
                        <div className={onFormat ? 'rounded-xl border-2 border-primary p-3' : 'rounded-xl border border-border p-3'}>
                            <label className="flex items-start gap-2.5">
                                <input
                                    type="radio"
                                    checked={useFormat}
                                    onChange={() => setUseFormat(true)}
                                    className="mt-1 h-4 w-4 accent-[var(--primary)]"
                                />
                                <span className="flex-1">
                                    <span className="block text-sm font-semibold">{plan.name}</span>
                                    <span className="block text-xs text-muted-foreground">
                                        {plan.scoredMarks} marks · {plan.durationMinutes} min ·{' '}
                                        {plan.sections
                                            .map((s) => `${s.label} ${s.marks}m ${s.types[0]}`)
                                            .join(' · ')}
                                    </span>
                                    {plan.origin === 'knec' ? (
                                        <span className="mt-1 block text-xs text-muted-foreground">
                                            Follows the published structure
                                            {plan.provisional ? ' — provisional, worth checking' : ''}
                                            {plan.verifiedOn ? `, checked ${plan.verifiedOn}` : ''}.
                                        </span>
                                    ) : (
                                        <span className="mt-1 block text-xs text-muted-foreground">
                                            A common school shape, not an official structure.
                                        </span>
                                    )}
                                </span>
                            </label>

                            {/* What the bank can actually supply against it */}
                            {feasibility && (
                                <div className="mt-2.5 border-t border-border pt-2.5">
                                    {feasibility.fillable ? (
                                        <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                            The bank can fill every section.
                                        </p>
                                    ) : (
                                        <div className="space-y-1">
                                            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                                                <AlertTriangle className="h-3.5 w-3.5" />
                                                Covers {feasibility.coverableMarks} of {feasibility.scoredMarks} marks
                                            </p>
                                            {feasibility.deficits.map((d) => (
                                                <div key={d.sectionId} className="flex items-start justify-between gap-2">
                                                    <p className="text-xs text-muted-foreground">{d.message}</p>
                                                    {onFillDeficit && (
                                                        <button
                                                            type="button"
                                                            onClick={() => onFillDeficit(d)}
                                                            className="chip shrink-0"
                                                        >
                                                            Write them
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                            <p className="text-xs text-muted-foreground">
                                                It will still build what it can, and leave the rest clearly short.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {hasFormat && (
                        <label className="flex items-start gap-2.5 rounded-xl border border-border p-3">
                            <input
                                type="radio"
                                checked={!useFormat}
                                onChange={() => setUseFormat(false)}
                                className="mt-1 h-4 w-4 accent-[var(--primary)]"
                            />
                            <span className="flex-1">
                                <span className="block text-sm font-semibold">Custom mix</span>
                                <span className="block text-xs text-muted-foreground">
                                    Choose your own total and difficulty spread, with no sections.
                                </span>
                            </span>
                        </label>
                    )}

                    {!onFormat && (
                    <>
                    {/* Presets */}
                    <div className="flex flex-wrap gap-1.5">
                        {PRESETS.map((preset) => (
                            <button
                                key={preset.label}
                                type="button"
                                onClick={() => patch({ targetMarks: preset.marks, difficultyMix: preset.mix })}
                                className={
                                    blueprint.targetMarks === preset.marks ? 'chip chip-active' : 'chip'
                                }
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>

                    {/* Mark target */}
                    <div>
                        <label className="label" htmlFor="target-marks">
                            Total marks
                        </label>
                        <input
                            id="target-marks"
                            type="number"
                            min={5}
                            max={400}
                            className="field"
                            value={blueprint.targetMarks}
                            onChange={(e) => patch({ targetMarks: Math.max(1, Number(e.target.value) || 0) })}
                        />
                    </div>

                    {/* Difficulty mix */}
                    <fieldset>
                        <legend className="label">Difficulty mix</legend>
                        <div className="space-y-3">
                            {(['Easy', 'Medium', 'Difficult'] as const).map((level) => (
                                <div key={level}>
                                    <div className="mb-1 flex justify-between text-xs">
                                        <span className="font-semibold">{level}</span>
                                        <span className="figure text-muted-foreground">
                                            {blueprint.difficultyMix[level]}%
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min={0}
                                        max={100}
                                        step={5}
                                        value={blueprint.difficultyMix[level]}
                                        onChange={(e) =>
                                            patch({
                                                difficultyMix: {
                                                    ...blueprint.difficultyMix,
                                                    [level]: Number(e.target.value),
                                                },
                                            })
                                        }
                                        className="w-full accent-[var(--primary)]"
                                        aria-label={`${level} share`}
                                    />
                                </div>
                            ))}
                        </div>
                        {mixTotal !== 100 && (
                            <p className="mt-2 text-xs text-muted-foreground">
                                Adds up to {mixTotal}% — the shares are scaled to fit, so this still works.
                            </p>
                        )}
                    </fieldset>

                    {/* Topics */}
                    {topics.length > 0 && (
                        <div>
                            <label className="label" htmlFor="autobuild-topics">
                                Restrict to topics (optional)
                            </label>
                            <select
                                id="autobuild-topics"
                                multiple
                                className="field h-32"
                                value={blueprint.topics}
                                onChange={(e) =>
                                    patch({
                                        topics: Array.from(e.target.selectedOptions).map((o) => o.value),
                                    })
                                }
                            >
                                {topics.map((topic) => (
                                    <option key={topic} value={topic}>
                                        {topic}
                                    </option>
                                ))}
                            </select>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Leave empty to draw from every topic in the filtered bank.
                            </p>
                        </div>
                    )}

                    <label className="flex items-center gap-2.5 text-sm">
                        <input
                            type="checkbox"
                            checked={blueprint.preferUnused}
                            onChange={(e) => patch({ preferUnused: e.target.checked })}
                            className="h-4 w-4 rounded border-input accent-[var(--primary)]"
                        />
                        Prefer questions I have used least
                    </label>
                    </>
                    )}

                    <fieldset>
                        <legend className="label">If the paper already has questions</legend>
                        <div className="flex gap-1.5">
                            <button
                                type="button"
                                onClick={() => setMode('replace')}
                                className={mode === 'replace' ? 'chip chip-active flex-1 justify-center' : 'chip flex-1 justify-center'}
                            >
                                Replace them
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode('append')}
                                className={mode === 'append' ? 'chip chip-active flex-1 justify-center' : 'chip flex-1 justify-center'}
                            >
                                Add to them
                            </button>
                        </div>
                    </fieldset>
                </div>

                <div className="flex gap-2 border-t border-border p-4">
                    <button type="button" onClick={onClose} className="btn-outline flex-1">
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            if (onFormat && plan && onBuildPlan) onBuildPlan(plan, mode);
                            else onBuild(blueprint, mode);
                        }}
                        disabled={poolSize === 0}
                        className="btn-primary flex-1"
                    >
                        <Sparkles className="h-4 w-4" />
                        {onFormat ? 'Build to this format' : 'Build paper'}
                    </button>
                </div>
            </div>
        </div>
    );
}
