'use client';

import React from 'react';
import { X } from 'lucide-react';
import {
    ALL_GRADES,
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
    onReset: () => void;
}

/**
 * The shop's filter rail. Levels first because that is how a teacher thinks
 * ("I teach Grade 8"), then exam type, then the narrower cuts.
 */
export default function FilterRail({ filters, facets, subjects, onChange, onReset }: FilterRailProps) {
    const activeCount = [
        filters.level,
        filters.grade,
        filters.subject,
        filters.exam_type,
        filters.term,
        filters.year,
        filters.price,
    ].filter(Boolean).length;

    const gradesForLevel = filters.level
        ? LEVELS.find((l) => l.slug === filters.level)?.grades ?? ALL_GRADES
        : ALL_GRADES;

    const typesForLevel = EXAM_TYPES.filter(
        (t) => !t.levels || !filters.level || t.levels.includes(filters.level as LevelSlug)
    );

    return (
        <div className="space-y-7">
            {activeCount > 0 && (
                <button type="button" onClick={onReset} className="btn-outline btn-sm w-full">
                    <X className="h-3.5 w-3.5" aria-hidden />
                    Clear {activeCount} filter{activeCount === 1 ? '' : 's'}
                </button>
            )}

            {/* Level */}
            <Group title="Level">
                <div className="space-y-1">
                    <RailButton
                        label="All levels"
                        active={!filters.level}
                        onClick={() => onChange({ level: undefined, grade: undefined })}
                    />
                    {LEVELS.map((level) => (
                        <RailButton
                            key={level.slug}
                            label={level.name}
                            hint={level.short}
                            count={facets?.levels?.[level.slug]}
                            active={filters.level === level.slug}
                            onClick={() =>
                                onChange({
                                    level: filters.level === level.slug ? undefined : level.slug,
                                    grade: undefined,
                                })
                            }
                        />
                    ))}
                </div>
            </Group>

            {/* Grade / Form */}
            <Group title="Grade / Form">
                <div className="flex flex-wrap gap-1.5">
                    {gradesForLevel.map((grade) => (
                        <button
                            key={grade}
                            type="button"
                            onClick={() => onChange({ grade: filters.grade === grade ? undefined : grade })}
                            className={filters.grade === grade ? 'chip chip-active' : 'chip'}
                        >
                            {grade}
                        </button>
                    ))}
                </div>
            </Group>

            {/* Exam type */}
            <Group title="Exam type">
                <div className="space-y-3">
                    {EXAM_TYPE_GROUPS.map((group) => {
                        const inGroup = typesForLevel.filter((t) => t.group === group);
                        if (inGroup.length === 0) return null;
                        return (
                            <div key={group}>
                                <p className="overline mb-2 opacity-70">{group}</p>
                                <div className="space-y-0.5">
                                    {inGroup.map((type) => (
                                        <RailButton
                                            key={type.slug}
                                            label={type.name}
                                            count={facets?.examTypes?.[type.slug]}
                                            active={filters.exam_type === type.slug}
                                            onClick={() =>
                                                onChange({
                                                    exam_type: filters.exam_type === type.slug ? undefined : type.slug,
                                                })
                                            }
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Group>

            {/* Subject */}
            {subjects.length > 0 && (
                <Group title="Subject">
                    <select
                        className="field"
                        value={filters.subject || ''}
                        onChange={(e) => onChange({ subject: e.target.value || undefined })}
                    >
                        <option value="">All subjects</option>
                        {subjects.map((subject) => (
                            <option key={subject} value={subject}>
                                {subject}
                                {facets?.subjects?.[subject] ? ` (${facets.subjects[subject]})` : ''}
                            </option>
                        ))}
                    </select>
                </Group>
            )}

            {/* Term + Year */}
            <Group title="Term & year">
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
            </Group>

            {/* Price */}
            <Group title="Price">
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
                            className={filters.price === option.value ? 'chip chip-active flex-1 justify-center' : 'chip flex-1 justify-center'}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </Group>
        </div>
    );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section>
            <div className="rule-heading mb-3">
                <h3 className="overline text-foreground">{title}</h3>
            </div>
            {children}
        </section>
    );
}

function RailButton({
    label,
    hint,
    count,
    active,
    onClick,
}: {
    label: string;
    hint?: string;
    count?: number;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`group flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-all duration-150 ${
                active
                    ? 'bg-primary/[0.08] font-semibold text-primary'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            }`}
        >
            <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="truncate">{label}</span>
                {hint && <span className="figure shrink-0 text-[10px] opacity-60">{hint}</span>}
            </span>
            {typeof count === 'number' && count > 0 && (
                <span className="figure shrink-0 text-[10px] opacity-60">{count}</span>
            )}
        </button>
    );
}
