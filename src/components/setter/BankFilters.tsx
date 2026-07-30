'use client';

import React from 'react';
import { X } from 'lucide-react';
import { LEVELS } from '@/lib/catalog';
import type { DBGrade, DBSubject, Difficulty, QuestionType } from '@/types';

export interface BankFilterState {
    levelSlug: string;
    gradeId: string;
    subjectId: string;
    topics: string[];
    difficulty: string;
    type: string;
    search: string;
}

export const EMPTY_BANK_FILTERS: BankFilterState = {
    levelSlug: '',
    gradeId: '',
    subjectId: '',
    topics: [],
    difficulty: '',
    type: '',
    search: '',
};

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Difficult'];
const TYPES: QuestionType[] = [
    'Multiple Choice',
    'True/False',
    'Short Answer',
    'Structured',
    'Essay',
    'Numeric',
    'Fill-in-the-blank',
    'Matching',
    'Practical',
    'Oral',
];

interface BankFiltersProps {
    filters: BankFilterState;
    grades: DBGrade[];
    subjects: DBSubject[];
    topicCounts: { topic: string; count: number }[];
    onChange: (patch: Partial<BankFilterState>) => void;
    onReset: () => void;
}

/**
 * The setter's left rail. Topics are the important part: a teacher setting an
 * end-of-term paper thinks in strands covered this term, so they get checkboxes
 * with live counts rather than a dropdown.
 */
export default function BankFilters({
    filters,
    grades,
    subjects,
    topicCounts,
    onChange,
    onReset,
}: BankFiltersProps) {
    const level = LEVELS.find((l) => l.slug === filters.levelSlug);
    const gradesForLevel = level
        ? grades.filter((g) => level.grades.some((name) => name.toLowerCase() === g.name.toLowerCase()))
        : grades;

    const activeCount = [
        filters.levelSlug,
        filters.gradeId,
        filters.subjectId,
        filters.difficulty,
        filters.type,
        filters.search,
    ].filter(Boolean).length + filters.topics.length;

    return (
        <div className="space-y-5">
            {activeCount > 0 && (
                <button type="button" onClick={onReset} className="btn-outline btn-sm w-full">
                    <X className="h-4 w-4" />
                    Clear {activeCount} filter{activeCount === 1 ? '' : 's'}
                </button>
            )}

            <div>
                <label className="label" htmlFor="setter-level">
                    Level
                </label>
                <select
                    id="setter-level"
                    className="field"
                    value={filters.levelSlug}
                    onChange={(e) => onChange({ levelSlug: e.target.value, gradeId: '' })}
                >
                    <option value="">All levels</option>
                    {LEVELS.map((l) => (
                        <option key={l.slug} value={l.slug}>
                            {l.name} ({l.short})
                        </option>
                    ))}
                </select>
            </div>

            <div>
                <label className="label" htmlFor="setter-grade">
                    Grade / Form
                </label>
                <select
                    id="setter-grade"
                    className="field"
                    value={filters.gradeId}
                    onChange={(e) => onChange({ gradeId: e.target.value })}
                >
                    <option value="">Any grade</option>
                    {gradesForLevel.map((g) => (
                        <option key={g.id} value={g.id}>
                            {g.name}
                        </option>
                    ))}
                </select>
            </div>

            <div>
                <label className="label" htmlFor="setter-subject">
                    Subject
                </label>
                <select
                    id="setter-subject"
                    className="field"
                    value={filters.subjectId}
                    onChange={(e) => onChange({ subjectId: e.target.value, topics: [] })}
                >
                    <option value="">Any subject</option>
                    {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                            {s.name}
                        </option>
                    ))}
                </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="label" htmlFor="setter-difficulty">
                        Difficulty
                    </label>
                    <select
                        id="setter-difficulty"
                        className="field"
                        value={filters.difficulty}
                        onChange={(e) => onChange({ difficulty: e.target.value })}
                    >
                        <option value="">Any</option>
                        {DIFFICULTIES.map((d) => (
                            <option key={d} value={d}>
                                {d}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="label" htmlFor="setter-type">
                        Type
                    </label>
                    <select
                        id="setter-type"
                        className="field"
                        value={filters.type}
                        onChange={(e) => onChange({ type: e.target.value })}
                    >
                        <option value="">Any</option>
                        {TYPES.map((t) => (
                            <option key={t} value={t}>
                                {t}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Topics */}
            <section>
                <div className="mb-2 flex items-center justify-between">
                    <h3 className="overline text-foreground">Topics / strands</h3>
                    {filters.topics.length > 0 && (
                        <button
                            type="button"
                            onClick={() => onChange({ topics: [] })}
                            className="text-xs font-semibold text-primary hover:underline"
                        >
                            Clear
                        </button>
                    )}
                </div>

                {topicCounts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                        Pick a subject to see the strands in the bank.
                    </p>
                ) : (
                    <div className="max-h-72 scroll-panel space-y-0.5 pr-1">
                        {topicCounts.map(({ topic, count }) => {
                            const checked = filters.topics.includes(topic);
                            return (
                                <label
                                    key={topic}
                                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                                        checked ? 'bg-primary/10 text-primary' : 'hover:bg-secondary'
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() =>
                                            onChange({
                                                topics: checked
                                                    ? filters.topics.filter((t) => t !== topic)
                                                    : [...filters.topics, topic],
                                            })
                                        }
                                        className="h-4 w-4 shrink-0 rounded border-input accent-[var(--primary)]"
                                    />
                                    <span className="min-w-0 flex-1 truncate">{topic}</span>
                                    <span className="figure shrink-0 text-[10px] text-muted-foreground">
                                        {count}
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}
