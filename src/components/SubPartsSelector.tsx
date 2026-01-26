'use client';

import React, { useState, useMemo } from 'react';
import { X, Check, CheckSquare, Square } from 'lucide-react';
import { Question, QuestionSubPart } from '@/types';

interface SubPartsSelectorProps {
    isOpen: boolean;
    question: Question;
    onClose: () => void;
    onAddWithParts: (question: Question, selectedPartIds: string[]) => void;
}

export default function SubPartsSelector({
    isOpen,
    question,
    onClose,
    onAddWithParts,
}: SubPartsSelectorProps) {
    const [selectedPartIds, setSelectedPartIds] = useState<string[]>(() =>
        (question.subParts || []).map(p => p.id)
    );

    const subParts = question.subParts || [];

    const togglePart = (partId: string) => {
        setSelectedPartIds(prev =>
            prev.includes(partId)
                ? prev.filter(id => id !== partId)
                : [...prev, partId]
        );
    };

    const selectAll = () => {
        setSelectedPartIds(subParts.map(p => p.id));
    };

    const selectNone = () => {
        setSelectedPartIds([]);
    };

    const selectedMarks = useMemo(() => {
        return subParts
            .filter(p => selectedPartIds.includes(p.id))
            .reduce((sum, p) => sum + p.marks, 0);
    }, [subParts, selectedPartIds]);

    const totalMarks = useMemo(() => {
        return subParts.reduce((sum, p) => sum + p.marks, 0);
    }, [subParts]);

    const handleAddSelected = () => {
        if (selectedPartIds.length === 0) return;
        onAddWithParts(question, selectedPartIds);
        onClose();
    };

    const handleAddAll = () => {
        onAddWithParts(question, subParts.map(p => p.id));
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                            Select Question Parts
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                            Choose which parts to include in your exam
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Question Preview */}
                <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-600">
                    <div className="flex items-start gap-3">
                        <span className="shrink-0 w-8 h-8 bg-primary/10 text-primary rounded-lg flex items-center justify-center text-sm font-bold">
                            Q
                        </span>
                        <div className="flex-1 min-w-0">
                            <div
                                className="prose prose-sm dark:prose-invert max-w-none line-clamp-3"
                                dangerouslySetInnerHTML={{ __html: question.text }}
                            />
                            <div className="flex gap-2 mt-2">
                                <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded-full">
                                    {question.topic}
                                </span>
                                <span className="px-2 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-full">
                                    {totalMarks} marks total
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Selection Controls */}
                <div className="px-6 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-600">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={selectAll}
                            className="text-sm text-primary hover:underline font-medium"
                        >
                            Select All
                        </button>
                        <span className="text-gray-300 dark:text-gray-600">|</span>
                        <button
                            onClick={selectNone}
                            className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-medium"
                        >
                            Clear
                        </button>
                    </div>
                    <div className="text-sm">
                        <span className="text-gray-500 dark:text-gray-400">Selected: </span>
                        <span className="font-bold text-gray-900 dark:text-white">
                            {selectedPartIds.length}/{subParts.length} parts
                        </span>
                        <span className="text-gray-400 mx-2">•</span>
                        <span className="font-bold text-primary">{selectedMarks} marks</span>
                    </div>
                </div>

                {/* Parts List */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                    {subParts.map((part) => {
                        const isSelected = selectedPartIds.includes(part.id);
                        return (
                            <div
                                key={part.id}
                                onClick={() => togglePart(part.id)}
                                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${isSelected
                                        ? 'border-primary bg-primary/5 dark:bg-primary/10'
                                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                                    }`}
                            >
                                <div className="flex items-start gap-3">
                                    {/* Checkbox */}
                                    <div className={`shrink-0 mt-0.5 ${isSelected ? 'text-primary' : 'text-gray-400'}`}>
                                        {isSelected ? (
                                            <CheckSquare className="w-5 h-5" />
                                        ) : (
                                            <Square className="w-5 h-5" />
                                        )}
                                    </div>

                                    {/* Part Label */}
                                    <span className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isSelected
                                            ? 'bg-primary text-white'
                                            : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                                        }`}>
                                        {part.label}
                                    </span>

                                    {/* Part Content */}
                                    <div className="flex-1 min-w-0">
                                        <div
                                            className="prose prose-sm dark:prose-invert max-w-none"
                                            dangerouslySetInnerHTML={{ __html: part.text }}
                                        />
                                    </div>

                                    {/* Marks Badge */}
                                    <span className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold ${isSelected
                                            ? 'bg-primary/20 text-primary'
                                            : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                                        }`}>
                                        {part.marks} {part.marks === 1 ? 'mark' : 'marks'}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    <button
                        onClick={onClose}
                        className="px-4 py-2.5 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors"
                    >
                        Cancel
                    </button>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleAddAll}
                            className="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 font-medium transition-colors"
                        >
                            Add All Parts ({totalMarks} marks)
                        </button>
                        <button
                            onClick={handleAddSelected}
                            disabled={selectedPartIds.length === 0}
                            className="px-5 py-2.5 bg-primary text-white rounded-xl hover:bg-primary/90 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <Check className="w-4 h-4" />
                            Add Selected ({selectedMarks} marks)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
