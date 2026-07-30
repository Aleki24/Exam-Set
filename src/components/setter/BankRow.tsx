'use client';

import React, { useState } from 'react';
import { Check, ChevronDown, Eye, Plus } from 'lucide-react';
import LatexRenderer from '@/components/LatexRenderer';
import type { DBQuestion } from '@/types';

/* Difficulty reads as a colour first, a word second. */
const DIFFICULTY_STYLES: Record<string, string> = {
    Easy: 'bg-success/12 text-success',
    Medium: 'bg-accent/15 text-accent',
    Difficult: 'bg-ink-red/12 text-ink-red',
};

interface BankRowProps {
    question: DBQuestion;
    added: boolean;
    onAdd: (question: DBQuestion) => void;
    onRemove: (id: string) => void;
}

/**
 * One question in the bank list. Dense by default, expandable for the full text,
 * sub-parts and marking scheme — a setter scans dozens of these per paper.
 */
export default function BankRow({ question, added, onAdd, onRemove }: BankRowProps) {
    const [expanded, setExpanded] = useState(false);

    const subPartMarks = (question.subParts || []).reduce((sum, p) => sum + (Number(p.marks) || 0), 0);
    const marks = subPartMarks > 0 ? subPartMarks : question.marks;

    return (
        <article className={`sheet p-3.5 ${added ? 'border-primary/50 bg-primary/[0.03]' : ''}`}>
            <div className="flex items-start gap-3">
                <button
                    type="button"
                    onClick={() => (added ? onRemove(question.id) : onAdd(question))}
                    className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition-colors ${
                        added
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border hover:border-primary hover:bg-primary/10 hover:text-primary'
                    }`}
                    aria-label={added ? 'Remove from paper' : 'Add to paper'}
                    aria-pressed={added}
                >
                    {added ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </button>

                <div className="min-w-0 flex-1">
                    <div className={expanded ? '' : 'line-clamp-2'}>
                        <LatexRenderer content={question.text} className="text-sm leading-relaxed" />
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span
                            className={`rounded px-1.5 py-0.5 font-semibold ${
                                DIFFICULTY_STYLES[question.difficulty] ?? 'bg-secondary'
                            }`}
                        >
                            {question.difficulty}
                        </span>
                        <span className="badge-marks">{marks} mk</span>
                        <span>{question.type}</span>
                        {question.topic && <span className="truncate">{question.topic}</span>}
                        {question.subParts && question.subParts.length > 0 && (
                            <span>{question.subParts.length} parts</span>
                        )}
                        {typeof question.usage_count === 'number' && question.usage_count > 0 && (
                            <span>used {question.usage_count}×</span>
                        )}
                    </div>

                    {expanded && (
                        <div className="mt-3 space-y-3 border-t border-border pt-3">
                            {question.options && question.options.length > 0 && (
                                <ol className="space-y-1 text-xs">
                                    {question.options.map((option, i) => (
                                        <li key={i} className="flex gap-2">
                                            <span className="font-semibold text-muted-foreground">
                                                {String.fromCharCode(65 + i)}.
                                            </span>
                                            <LatexRenderer content={option} />
                                        </li>
                                    ))}
                                </ol>
                            )}

                            {question.subParts && question.subParts.length > 0 && (
                                <ol className="space-y-1.5 text-xs">
                                    {question.subParts.map((part) => (
                                        <li key={part.id} className="flex gap-2">
                                            <span className="font-semibold text-muted-foreground">
                                                ({part.label})
                                            </span>
                                            <span className="flex-1">
                                                <LatexRenderer content={part.text} />
                                            </span>
                                            <span className="shrink-0 tabular-nums text-muted-foreground">
                                                {part.marks} mk
                                            </span>
                                        </li>
                                    ))}
                                </ol>
                            )}

                            {question.markingScheme && (
                                <div className="rounded-lg bg-secondary p-3">
                                    <p className="overline mb-1.5">Marking scheme</p>
                                    <LatexRenderer content={question.markingScheme} className="text-xs" />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    aria-label={expanded ? 'Collapse question' : 'Expand question'}
                    aria-expanded={expanded}
                >
                    {expanded ? <ChevronDown className="h-4 w-4 rotate-180" /> : <Eye className="h-4 w-4" />}
                </button>
            </div>
        </article>
    );
}
