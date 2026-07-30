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
            <div className="rule-heading mb-3">
                <h2 id="level-strip-heading" className="overline">
                    Browse by level
                </h2>
            </div>

            <div className="rail-x -mx-1 px-1">
                <button
                    type="button"
                    onClick={() => onSelect(undefined)}
                    aria-pressed={!active}
                    className={`sheet shrink-0 px-4 py-3 text-left transition-all ${
                        !active ? 'border-primary/45 bg-primary/[0.04]' : ''
                    }`}
                >
                    <span className="overline block">All</span>
                    <span className="heading-ui mt-1 block whitespace-nowrap">Everything</span>
                </button>

                {LEVELS.map((level, i) => {
                    const isActive = active === level.slug;
                    const count = counts?.[level.slug];

                    return (
                        <button
                            key={level.slug}
                            type="button"
                            onClick={() => onSelect(isActive ? undefined : level.slug)}
                            aria-pressed={isActive}
                            className={`sheet rise-in shrink-0 px-4 py-3 text-left transition-all ${
                                isActive ? 'border-primary/45 bg-primary/[0.04]' : ''
                            }`}
                            style={{ '--i': i + 1 } as React.CSSProperties}
                        >
                            <span className="overline block">
                                {level.curriculum === 'CBE' ? 'CBE' : '8-4-4'}
                            </span>
                            <span className="heading-ui mt-1 block whitespace-nowrap">{level.name}</span>
                            <span className="figure mt-1 block text-[11px] text-muted-foreground">
                                {level.short}
                                {typeof count === 'number' && count > 0 ? ` · ${count}` : ''}
                            </span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
