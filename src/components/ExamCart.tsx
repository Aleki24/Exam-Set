'use client';

import React from 'react';
import { Question } from '@/types';
import LatexRenderer from './LatexRenderer';

interface ExamCartProps {
    selectedQuestions: Question[];
    examQuestions: Question[];
    onRemoveFromSelected: (id: string) => void;
    onMoveToExam: (q: Question) => void;
    onMoveAllToExam: () => void;
    onRemoveFromExam: (id: string) => void;
}

const ExamCart: React.FC<ExamCartProps> = ({
    selectedQuestions,
    examQuestions,
    onRemoveFromSelected,
    onMoveToExam,
    onMoveAllToExam,
    onRemoveFromExam,
}) => {
    const selectedMarks = selectedQuestions.reduce((sum, q) => sum + q.marks, 0);
    const examMarks = examQuestions.reduce((sum, q) => sum + q.marks, 0);
    const totalMarks = selectedMarks + examMarks;

    const getDifficultyStats = (questions: Question[]) => {
        const stats = { Easy: 0, Medium: 0, Difficult: 0 };
        questions.forEach(q => {
            stats[q.difficulty]++;
        });
        return stats;
    };

    const examStats = getDifficultyStats(examQuestions);

    return (
        <div className="h-full flex flex-col bg-card">
            {/* Cart Header - Summary Stats */}
            <div className="p-4 bg-zinc-950 text-white">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-black text-lg flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        Exam Cart
                    </h2>
                    <div className="bg-white/20 px-3 py-1 rounded-full text-xs font-bold">
                        {examQuestions.length} Questions
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white/10 rounded-xl p-3 relative group">
                        <p className="text-[10px] uppercase tracking-wider text-white/60 mb-1">Total Marks</p>
                        <p className="text-2xl font-black">{examMarks}</p>
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50">
                            <div className="bg-foreground text-background text-[10px] px-3 py-2 rounded-lg shadow-xl max-w-[200px] border border-white/10">
                                <p className="font-bold">Total Marks: {examMarks}</p>
                                <p className="text-muted-foreground">Easy: {examStats.Easy}</p>
                                <p className="text-muted-foreground">Medium: {examStats.Medium}</p>
                                <p className="text-muted-foreground">Difficult: {examStats.Difficult}</p>
                            </div>
                            <div className="absolute left-4 top-full -mt-1 w-2 h-2 bg-foreground rotate-45 border-r border-b border-white/10" />
                        </div>
                    </div>
                    <div className="bg-emerald-500/30 rounded-xl p-3">
                        <p className="text-[10px] uppercase tracking-wider text-white/60 mb-1">Easy</p>
                        <p className="text-2xl font-black">{examStats.Easy}</p>
                    </div>
                    <div className="bg-rose-500/30 rounded-xl p-3">
                        <p className="text-[10px] uppercase tracking-wider text-white/60 mb-1">Hard</p>
                        <p className="text-2xl font-black">{examStats.Difficult}</p>
                    </div>
                </div>
            </div>

            {/* Staging Area (Selected Questions) */}
            {selectedQuestions.length > 0 && (
                <div className="p-4 border-b border-border bg-primary/5">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-black uppercase text-primary tracking-wider">
                            Staging ({selectedQuestions.length})
                        </h3>
                        <span className="text-xs font-bold text-primary/60">{selectedMarks} pts</span>
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                        {selectedQuestions.map(q => (
                            <div key={q.id} className="bg-card rounded-xl p-3 shadow-sm flex items-start gap-3 group border border-border">
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-foreground truncate">
                                        <LatexRenderer content={q.text.slice(0, 60) + (q.text.length > 60 ? '...' : '')} />
                                    </p>
                                    <div className="flex gap-2 mt-1">
                                        <span className="text-[9px] font-bold text-muted-foreground">{q.marks} pts</span>
                                        <span className="text-[9px] font-bold text-primary">{q.topic}</span>
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => onMoveToExam(q)}
                                        className="p-1.5 text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors"
                                        title="Add to Exam"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={() => onRemoveFromSelected(q.id)}
                                        className="p-1.5 text-rose-400 hover:bg-rose-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                        title="Remove"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <button
                        onClick={onMoveAllToExam}
                        className="w-full mt-3 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-xl hover:opacity-90 transition-colors shadow-lg shadow-primary/20"
                    >
                        Add All to Exam →
                    </button>
                </div>
            )}

            {/* Exam Questions */}
            <div className="flex-1 overflow-y-auto p-4">
                <h3 className="text-xs font-black uppercase text-muted-foreground tracking-wider mb-3">
                    In Exam Paper
                </h3>
                {examQuestions.length === 0 ? (
                    <div className="text-center py-10 opacity-50">
                        <div className="w-16 h-16 bg-secondary rounded-full mx-auto mb-4 flex items-center justify-center text-muted-foreground">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <p className="text-sm font-bold text-muted-foreground">No questions yet</p>
                        <p className="text-xs text-muted-foreground/60 mt-1">Browse the bank and add questions</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {examQuestions.map((q, idx) => (
                            <div key={q.id} className="bg-secondary/50 rounded-xl p-3 flex items-start gap-3 group hover:bg-secondary transition-colors border border-border">
                                <span className="w-6 h-6 bg-secondary rounded-full flex items-center justify-center text-[10px] font-black text-muted-foreground shrink-0 border border-border">
                                    {idx + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-foreground truncate">
                                        <LatexRenderer content={q.text.slice(0, 50) + (q.text.length > 50 ? '...' : '')} />
                                    </p>
                                    <div className="flex gap-2 mt-1">
                                        <span className="text-[9px] font-bold text-muted-foreground">{q.marks} pts</span>
                                        <span className={`text-[9px] font-bold ${q.difficulty === 'Easy' ? 'text-emerald-500' : q.difficulty === 'Difficult' ? 'text-rose-500' : 'text-amber-500'}`}>
                                            {q.difficulty}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => onRemoveFromExam(q.id)}
                                    className="p-1.5 text-rose-400 hover:bg-rose-100 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                    title="Remove from Exam"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ExamCart;
