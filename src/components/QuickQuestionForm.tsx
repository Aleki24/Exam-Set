'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, Plus, Settings2, X } from 'lucide-react';
import type { Difficulty, QuestionType } from '@/types';
import {
    EMPTY_QUICK_ADD,
    QUICK_ADD_DEFAULTS_KEY,
    QUICK_TYPES,
    applyPrefill,
    clearedForNext,
    defaultsFrom,
    needsAnswer,
    needsOptions,
    optionLetter,
    plainText,
    quickAddPayload,
    resolveContext,
    validateQuickAdd,
    type QuickAddState,
    type QuickPrefill,
} from '@/lib/quickAdd';

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Difficult'];

interface QuickQuestionFormProps {
    isOpen: boolean;
    onClose: () => void;
    /** So the list behind the modal can refresh without a reload. */
    onSaved?: (question: unknown) => void;
    /** Only id and name are read, so either page's own lookup shape fits. */
    grades: { id: string; name: string }[];
    subjects: { id: string; name: string }[];
    activeFilters?: { curriculum_id?: string; grade_id?: string; subject_id?: string; topic?: string };
    /** Topics already in the bank for this subject — the autocomplete list. */
    topicSuggestions?: string[];
    /** Opens whichever full form this surface uses, carrying what has been typed. */
    onOpenFullForm?: (prefill: QuickAddState) => void;
    /** Set when the form was opened from a feasibility deficit. */
    prefill?: QuickPrefill;
}

/**
 * QUICK ADD — the fast way into the bank.
 *
 * One screen: the stem, what it is worth, what kind it is, which topic. Context
 * rides in from the filters the teacher already set, so a paper's worth of
 * questions is one sitting rather than one cascade per question.
 *
 * The selection rules live in lib/quickAdd so they can be tested without a
 * browser; this file is about the interaction and nothing else.
 */
export default function QuickQuestionForm({
    isOpen,
    onClose,
    onSaved,
    grades,
    subjects,
    activeFilters,
    topicSuggestions = [],
    onOpenFullForm,
    prefill,
}: QuickQuestionFormProps) {
    const [state, setState] = useState<QuickAddState>(EMPTY_QUICK_ADD);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [showContext, setShowContext] = useState(false);
    const [savedCount, setSavedCount] = useState(0);
    const [similar, setSimilar] = useState<{ id: string; text: string }[]>([]);

    const textRef = useRef<HTMLTextAreaElement>(null);

    // --- Context: filters beat what was saved last time, which beats nothing --
    useEffect(() => {
        if (!isOpen) return;

        let remembered: Partial<QuickAddState> = {};
        try {
            const raw = localStorage.getItem(QUICK_ADD_DEFAULTS_KEY);
            if (raw) remembered = JSON.parse(raw);
        } catch {
            // A corrupt defaults blob is not worth failing to open a form over.
        }

        const base: QuickAddState = {
            ...EMPTY_QUICK_ADD,
            ...resolveContext(activeFilters, remembered),
        } as QuickAddState;

        const next = applyPrefill(base, prefill);
        setState(next);
        setErrors({});
        setSavedCount(0);
        setSimilar([]);
        // A form that opens with the cursor already in the box saves a click
        // every single time, which is the whole point of this screen.
        setShowContext(!next.grade_id || !next.subject_id);
        setTimeout(() => textRef.current?.focus(), 50);
    }, [isOpen, activeFilters, prefill]);

    // --- Has this been asked before? Advisory only, never blocking ----------
    useEffect(() => {
        const stem = plainText(state.text);
        if (stem.length < 15) {
            setSimilar([]);
            return;
        }
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(
                    `/api/questions/search?q=${encodeURIComponent(stem.substring(0, 50))}&limit=3`
                );
                if (!res.ok) return;
                const data = await res.json();
                setSimilar(data.questions ?? []);
            } catch {
                // Not being able to check for duplicates is not a reason to
                // stop somebody writing a question.
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [state.text]);

    const patch = useCallback((p: Partial<QuickAddState>) => {
        setState((s) => ({ ...s, ...p }));
    }, []);

    const gradeName = useMemo(
        () => grades.find((g) => g.id === state.grade_id)?.name,
        [grades, state.grade_id]
    );
    const subjectName = useMemo(
        () => subjects.find((s) => s.id === state.subject_id)?.name,
        [subjects, state.subject_id]
    );

    const save = useCallback(async () => {
        const found = validateQuickAdd(state);
        setErrors(found);
        if (Object.keys(found).length > 0) {
            if (found.context) setShowContext(true);
            return;
        }

        setSaving(true);
        try {
            const res = await fetch('/api/questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(quickAddPayload(state)),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || 'Could not save the question');
                return;
            }

            try {
                localStorage.setItem(QUICK_ADD_DEFAULTS_KEY, JSON.stringify(defaultsFrom(state)));
            } catch {
                // Private browsing. The save itself already worked.
            }

            const saved = savedCount + 1;
            setSavedCount(saved);
            onSaved?.(data.questions?.[0] ?? data);

            // When the form was opened from a deficit, the count coming down is
            // the whole reward — say it out loud.
            const left = prefill?.remaining !== undefined ? prefill.remaining - saved : null;
            toast.success(
                left !== null && left > 0
                    ? `Saved. ${left} more to go.`
                    : left !== null
                      ? 'Saved — that section is covered.'
                      : 'Saved'
            );

            setState((s) => clearedForNext(s));
            setSimilar([]);
            setErrors({});
            textRef.current?.focus();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not save the question');
        } finally {
            setSaving(false);
        }
    }, [state, savedCount, prefill, onSaved]);

    // Ctrl/Cmd + Enter saves, so a fast typist never reaches for the mouse.
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                void save();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, save]);

    if (!isOpen) return null;

    const topicListId = 'quick-add-topics';

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
            <div className="absolute inset-0 bg-foreground/50" onClick={onClose} aria-hidden />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="quick-add-title"
                className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-card shadow-2xl sm:rounded-2xl"
            >
                <div className="flex items-center justify-between border-b border-border p-4">
                    <h2 id="quick-add-title" className="title-2 flex items-center gap-2">
                        <Plus className="h-4 w-4 text-primary" />
                        Add question
                        {savedCount > 0 && (
                            <span className="figure text-xs text-muted-foreground">{savedCount} saved</span>
                        )}
                    </h2>
                    <button type="button" onClick={onClose} className="btn-icon h-9 w-9" aria-label="Close">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="scroll-panel space-y-4 p-4">
                    {prefill?.reason && (
                        <p className="rounded-lg bg-primary/10 p-3 text-sm text-foreground">{prefill.reason}</p>
                    )}

                    {/* Context — inherited, not re-picked */}
                    <div className="flex flex-wrap items-center gap-1.5">
                        {gradeName && <span className="chip chip-active">{gradeName}</span>}
                        {subjectName && <span className="chip chip-active">{subjectName}</span>}
                        {!gradeName && !subjectName && (
                            <span className="text-xs text-muted-foreground">No grade or subject set</span>
                        )}
                        <button type="button" onClick={() => setShowContext((v) => !v)} className="chip">
                            <Settings2 className="h-3.5 w-3.5" />
                            Change
                        </button>
                    </div>

                    {showContext && (
                        <div className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
                            <div>
                                <label className="label" htmlFor="quick-grade">
                                    Grade
                                </label>
                                <select
                                    id="quick-grade"
                                    className="field"
                                    value={state.grade_id}
                                    onChange={(e) => patch({ grade_id: e.target.value })}
                                >
                                    <option value="">Choose…</option>
                                    {grades.map((g) => (
                                        <option key={g.id} value={g.id}>
                                            {g.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="label" htmlFor="quick-subject">
                                    Subject
                                </label>
                                <select
                                    id="quick-subject"
                                    className="field"
                                    value={state.subject_id}
                                    onChange={(e) => patch({ subject_id: e.target.value })}
                                >
                                    <option value="">Choose…</option>
                                    {subjects.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            {errors.context && (
                                <p className="text-xs text-destructive sm:col-span-2">{errors.context}</p>
                            )}
                        </div>
                    )}

                    {/* The question */}
                    <div>
                        <label className="label" htmlFor="quick-text">
                            Question
                        </label>
                        <textarea
                            id="quick-text"
                            ref={textRef}
                            rows={3}
                            className="field"
                            placeholder="Type the question…"
                            value={state.text}
                            onChange={(e) => patch({ text: e.target.value })}
                        />
                        {errors.text && <p className="mt-1 text-xs text-destructive">{errors.text}</p>}
                        {similar.length > 0 && (
                            <div className="mt-2 rounded-lg bg-amber-500/10 p-2.5">
                                <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    Similar questions are already in the bank
                                </p>
                                <ul className="mt-1 space-y-0.5">
                                    {similar.map((q) => (
                                        <li key={q.id} className="line-clamp-1 text-xs text-muted-foreground">
                                            {plainText(q.text)}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>

                    {/* Marks · type · topic */}
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                            <label className="label" htmlFor="quick-marks">
                                Marks
                            </label>
                            <input
                                id="quick-marks"
                                type="number"
                                min={1}
                                className="field"
                                value={state.marks}
                                onChange={(e) => patch({ marks: Number(e.target.value) || 1 })}
                            />
                            {errors.marks && <p className="mt-1 text-xs text-destructive">{errors.marks}</p>}
                        </div>
                        <div>
                            <label className="label" htmlFor="quick-type">
                                Type
                            </label>
                            <select
                                id="quick-type"
                                className="field"
                                value={state.type}
                                onChange={(e) => patch({ type: e.target.value as QuestionType, answer: null })}
                            >
                                {QUICK_TYPES.map((t) => (
                                    <option key={t} value={t}>
                                        {t}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="label" htmlFor="quick-topic">
                                Topic
                            </label>
                            <input
                                id="quick-topic"
                                className="field"
                                list={topicListId}
                                placeholder="Start typing…"
                                value={state.topic}
                                onChange={(e) => patch({ topic: e.target.value })}
                            />
                            <datalist id={topicListId}>
                                {topicSuggestions.map((t) => (
                                    <option key={t} value={t} />
                                ))}
                            </datalist>
                            {errors.topic && <p className="mt-1 text-xs text-destructive">{errors.topic}</p>}
                        </div>
                    </div>

                    {/* Options, and which one is right */}
                    {needsOptions(state.type) && (
                        <fieldset>
                            <legend className="label">Options — choose the correct one</legend>
                            <div className="space-y-2">
                                {state.options.map((option, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                        <input
                                            type="radio"
                                            name="quick-answer"
                                            checked={state.answer === i}
                                            onChange={() => patch({ answer: i })}
                                            className="h-4 w-4 accent-[var(--primary)]"
                                            aria-label={`Option ${optionLetter(i)} is correct`}
                                        />
                                        <span className="w-4 text-xs font-semibold text-muted-foreground">
                                            {optionLetter(i)}
                                        </span>
                                        <input
                                            className="field flex-1"
                                            placeholder={`Option ${optionLetter(i)}`}
                                            value={option}
                                            onChange={(e) => {
                                                const options = [...state.options];
                                                options[i] = e.target.value;
                                                patch({ options });
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                            {errors.options && <p className="mt-1 text-xs text-destructive">{errors.options}</p>}
                        </fieldset>
                    )}

                    {state.type === 'True/False' && (
                        <fieldset>
                            <legend className="label">Correct answer</legend>
                            <div className="flex gap-1.5">
                                {(['True', 'False'] as const).map((value) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => patch({ answer: value })}
                                        className={
                                            state.answer === value
                                                ? 'chip chip-active flex-1 justify-center'
                                                : 'chip flex-1 justify-center'
                                        }
                                    >
                                        {value}
                                    </button>
                                ))}
                            </div>
                        </fieldset>
                    )}

                    {needsAnswer(state.type) && errors.answer && (
                        <p className="text-xs text-destructive">{errors.answer}</p>
                    )}

                    {/* Difficulty */}
                    <fieldset>
                        <legend className="label">Difficulty</legend>
                        <div className="flex gap-1.5">
                            {DIFFICULTIES.map((level) => (
                                <button
                                    key={level}
                                    type="button"
                                    onClick={() => patch({ difficulty: level })}
                                    className={
                                        state.difficulty === level
                                            ? 'chip chip-active flex-1 justify-center'
                                            : 'chip flex-1 justify-center'
                                    }
                                >
                                    {level}
                                </button>
                            ))}
                        </div>
                    </fieldset>
                </div>

                <div className="flex flex-wrap gap-2 border-t border-border p-4">
                    {onOpenFullForm && (
                        <button
                            type="button"
                            onClick={() => onOpenFullForm(state)}
                            className="btn-outline"
                            disabled={saving}
                        >
                            More options
                        </button>
                    )}
                    <button type="button" onClick={onClose} className="btn-outline flex-1" disabled={saving}>
                        {savedCount > 0 ? 'Done' : 'Cancel'}
                    </button>
                    <button type="button" onClick={save} className="btn-primary flex-1" disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Save &amp; add another
                    </button>
                </div>
            </div>
        </div>
    );
}
