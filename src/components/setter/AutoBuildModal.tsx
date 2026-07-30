'use client';

import React, { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import type { PaperBlueprint } from '@/types/shop';
import { DEFAULT_BLUEPRINT } from '@/types/shop';

interface AutoBuildModalProps {
    open: boolean;
    poolSize: number;
    topics: string[];
    onClose: () => void;
    onBuild: (blueprint: PaperBlueprint, mode: 'replace' | 'append') => void;
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
export default function AutoBuildModal({ open, poolSize, topics, onClose, onBuild }: AutoBuildModalProps) {
    const [blueprint, setBlueprint] = useState<PaperBlueprint>(DEFAULT_BLUEPRINT);
    const [mode, setMode] = useState<'replace' | 'append'>('replace');

    if (!open) return null;

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
                        onClick={() => onBuild(blueprint, mode)}
                        disabled={poolSize === 0}
                        className="btn-primary flex-1"
                    >
                        <Sparkles className="h-4 w-4" />
                        Build paper
                    </button>
                </div>
            </div>
        </div>
    );
}
