'use client';

import React from 'react';
import { LEVELS } from '@/lib/catalog';

interface LevelStripProps {
    active?: string;
    counts?: Record<string, number>;
    onSelect: (level: string | undefined) => void;
}

/**
 * The fastest route into the catalog: pick your level and go.
 *
 * A teacher arrives knowing exactly one thing — the class they teach — so the
 * levels sit above everything else as numbered cards, scrolling horizontally on
 * small screens rather than collapsing into a dropdown.
 */
export default function LevelStrip({ active, counts, onSelect }: LevelStripProps) {
    return (
        <section aria-labelledby="level-strip-heading" className="min-w-0">
            <h2 id="level-strip-heading" className="overline mb-3">
                Browse by level
            </h2>

            <div className="rail-x -mx-1 px-1">
                <LevelTile
                    label="All levels"
                    hint="CBE & 8-4-4"
                    active={!active}
                    onClick={() => onSelect(undefined)}
                />

                {LEVELS.map((level) => (
                    <LevelTile
                        key={level.slug}
                        label={level.name}
                        hint={level.short}
                        count={counts?.[level.slug]}
                        active={active === level.slug}
                        onClick={() => onSelect(active === level.slug ? undefined : level.slug)}
                    />
                ))}
            </div>
        </section>
    );
}

/** One level. Label on top, band underneath, count only when there is stock. */
function LevelTile({
    label,
    hint,
    count,
    active,
    onClick,
}: {
    label: string;
    hint: string;
    count?: number;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`shrink-0 rounded-[var(--radius)] border px-4 py-3 text-left transition-colors duration-150 ${
                active
                    ? 'border-primary bg-primary/[0.06] text-foreground'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
            }`}
        >
            <span className="heading-ui block whitespace-nowrap">{label}</span>
            <span className="figure mt-1 block text-[10px] opacity-70">
                {hint}
                {typeof count === 'number' && count > 0 ? ` · ${count}` : ''}
            </span>
        </button>
    );
}
