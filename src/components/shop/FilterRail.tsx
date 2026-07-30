'use client';

import React from 'react';
import {
    catalogYears,
    EXAM_TYPE_GROUPS,
    EXAM_TYPES,
    LEVELS,
    TERMS,
    type LevelSlug,
} from '@/lib/catalog';
import type { PaperFilters, PaperListResponse } from '@/types/shop';

interface FilterRailProps {
    filters: PaperFilters;
    facets?: PaperListResponse['facets'];
    subjects: string[];
    onChange: (patch: Partial<PaperFilters>) => void;
}

/**
 * The shop's filter rail.
 *
 * Level is deliberately absent — the strip at the top of the page owns it, and
 * two controls for one decision is worse than none. Everything else is folded
 * away by default: a rail of six open groups is a wall, and most visitors only
 * ever touch one of them.
 *
 * Grade only appears once a level is chosen, because "Grade 4" means nothing
 * until you know which band you are shopping in.
 */
export default function FilterRail({ filters, facets, subjects, onChange }: FilterRailProps) {
    const level = filters.level ? LEVELS.find((l) => l.slug === filters.level) : undefined;

    const typesForLevel = EXAM_TYPES.filter(
        (t) => !t.levels || !filters.level || t.levels.includes(filters.level as LevelSlug)
    );

    const activeType = filters.exam_type ? EXAM_TYPES.find((t) => t.slug === filters.exam_type) : undefined;

    return (
        <div className="space-y-1">
            {/* Grade — only meaningful once a level is picked. */}
            {level && (
                <Disclosure label="Grade" value={filters.grade} defaultOpen>
                    <div className="flex flex-wrap gap-1.5 pb-2">
                        {level.grades.map((grade) => (
                            <button
                                key={grade}
                                type="button"
                                onClick={() => onChange({ grade: filters.grade === grade ? undefined : grade })}
                                className={filters.grade === grade ? 'chip chip-active' : 'chip'}
                                aria-pressed={filters.grade === grade}
                            >
                                {grade}
                            </button>
                        ))}
                    </div>
                </Disclosure>
            )}

            {/* Exam type — 25 of them, so grouped and folded. */}
            <Disclosure label="Exam type" value={activeType?.name} defaultOpen={Boolean(filters.exam_type)}>
                <div className="space-y-4 pb-2">
                    {EXAM_TYPE_GROUPS.map((group) => {
                        const inGroup = typesForLevel.filter((t) => t.group === group);
                        if (inGroup.length === 0) return null;

                        return (
                            <div key={group}>
                                <p className="overline mb-2">{group}</p>
                                <div className="space-y-0.5">
                                    {inGroup.map((type) => {
                                        const active = filters.exam_type === type.slug;
                                        const count = facets?.examTypes?.[type.slug];

                                        return (
                                            <button
                                                key={type.slug}
                                                type="button"
                                                onClick={() =>
                                                    onChange({ exam_type: active ? undefined : type.slug })
                                                }
                                                aria-pressed={active}
                                                className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                                                    active
                                                        ? 'bg-primary/[0.08] font-semibold text-primary'
                                                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                                                }`}
                                            >
                                                <span className="truncate">{type.name}</span>
                                                {typeof count === 'number' && count > 0 && (
                                                    <span className="figure shrink-0 text-[10px] opacity-60">
                                                        {count}
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Disclosure>

            {/* Subject */}
            {subjects.length > 0 && (
                <Disclosure label="Subject" value={filters.subject} defaultOpen={Boolean(filters.subject)}>
                    <div className="pb-2">
                        <select
                            className="field"
                            value={filters.subject || ''}
                            onChange={(e) => onChange({ subject: e.target.value || undefined })}
                            aria-label="Subject"
                        >
                            <option value="">All subjects</option>
                            {subjects.map((subject) => (
                                <option key={subject} value={subject}>
                                    {subject}
                                    {facets?.subjects?.[subject] ? ` (${facets.subjects[subject]})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                </Disclosure>
            )}

            {/* Term, year, price — the narrow cuts, together. */}
            <Disclosure
                label="Term, year & price"
                value={
                    [
                        TERMS.find((t) => t.slug === filters.term)?.name,
                        filters.year,
                        filters.price === 'free' ? 'Free' : filters.price === 'paid' ? 'Premium' : undefined,
                    ]
                        .filter(Boolean)
                        .join(' · ') || undefined
                }
                defaultOpen={Boolean(filters.term || filters.year || filters.price)}
            >
                <div className="space-y-3 pb-2">
                    <div className="grid grid-cols-2 gap-2">
                        <select
                            className="field"
                            value={filters.term || ''}
                            onChange={(e) => onChange({ term: e.target.value || undefined })}
                            aria-label="Term"
                        >
                            <option value="">Any term</option>
                            {TERMS.map((term) => (
                                <option key={term.slug} value={term.slug}>
                                    {term.name}
                                </option>
                            ))}
                        </select>
                        <select
                            className="field"
                            value={filters.year || ''}
                            onChange={(e) => onChange({ year: e.target.value ? Number(e.target.value) : undefined })}
                            aria-label="Year"
                        >
                            <option value="">Any year</option>
                            {catalogYears().map((year) => (
                                <option key={year} value={year}>
                                    {year}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex gap-1.5">
                        {(
                            [
                                { value: undefined, label: 'All' },
                                { value: 'free' as const, label: 'Free' },
                                { value: 'paid' as const, label: 'Premium' },
                            ]
                        ).map((option) => (
                            <button
                                key={option.label}
                                type="button"
                                onClick={() => onChange({ price: option.value })}
                                aria-pressed={filters.price === option.value}
                                className={
                                    filters.price === option.value
                                        ? 'chip chip-active flex-1 justify-center'
                                        : 'chip flex-1 justify-center'
                                }
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>
            </Disclosure>
        </div>
    );
}

/**
 * A folded filter group. When closed it still reports what is selected inside,
 * so nothing is ever hidden without a trace.
 */
function Disclosure({
    label,
    value,
    defaultOpen,
    children,
}: {
    label: string;
    value?: string | number;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    return (
        <details className="disclosure" open={defaultOpen}>
            <summary>
                <span className="flex min-w-0 items-baseline gap-2">
                    <span>{label}</span>
                    {value && <span className="truncate text-xs font-normal text-primary">{value}</span>}
                </span>
            </summary>
            {children}
        </details>
    );
}
