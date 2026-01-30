'use client';

import React, { useState } from 'react';
import { Question, BloomsLevel } from '@/types';
import LatexRenderer from './LatexRenderer';

interface QuestionCardProps {
    question: Question;
    onAdd?: (q: Question) => void;
    onRemove?: (id: string) => void;
    onUpdate?: (id: string, updates: Partial<Question>) => void;
    variant?: 'bank' | 'exam' | 'selected';
    addedToExam?: boolean;
}

const BLOOMS_LEVELS: BloomsLevel[] = ['Knowledge', 'Understanding', 'Application', 'Analysis', 'Evaluation', 'Creation'];

const QuestionCard: React.FC<QuestionCardProps> = ({ question, onAdd, onRemove, onUpdate, variant = 'bank', addedToExam }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [showAnswer, setShowAnswer] = useState(false);
    const [editState, setEditState] = useState(question);

    const getDifficultyColor = (diff: string) => {
        switch (diff) {
            case 'Easy': return 'bg-accent-green/10 text-accent-green';
            case 'Medium': return 'bg-accent-orange/10 text-accent-orange';
            case 'Difficult': return 'bg-destructive/10 text-destructive';
            default: return 'bg-secondary text-muted-foreground';
        }
    };

    const getBloomsColor = (level?: string) => {
        return 'text-primary bg-primary/10 border-primary/20';
    };

    const handleSave = () => {
        if (onUpdate) {
            onUpdate(question.id, editState);
        }
        setIsEditing(false);
    };

    // --- EDIT MODE ---
    if (isEditing) {
        return (
            <div className="bg-card rounded-3xl p-6 shadow-xl border-2 border-primary relative z-20">
                <h3 className="text-sm font-black uppercase text-primary mb-4">Editing Question</h3>
                <div className="space-y-4">
                    <div>
                        <label className="text-[10px] font-bold uppercase text-muted-foreground">Question Text</label>
                        <textarea
                            value={editState.text}
                            onChange={e => setEditState({ ...editState, text: e.target.value })}
                            className="w-full p-3 border border-border bg-background rounded-2xl text-sm font-medium focus:ring-4 focus:ring-primary/10 outline-none transition-all"
                            rows={3}
                        />
                    </div>

                    <div>
                        <label className="text-[10px] font-bold uppercase text-muted-foreground">Topic</label>
                        <input
                            value={editState.topic}
                            onChange={e => setEditState({ ...editState, topic: e.target.value })}
                            className="w-full p-3 border border-border bg-background rounded-xl text-xs font-bold mb-2"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-bold uppercase text-muted-foreground">Marks</label>
                            <input
                                type="number"
                                value={editState.marks}
                                onChange={e => setEditState({ ...editState, marks: parseInt(e.target.value) || 0 })}
                                className="w-full p-3 border border-border bg-background rounded-xl text-xs font-bold"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold uppercase text-muted-foreground">Answer Lines</label>
                            <input
                                type="number"
                                value={editState.answerLines || 0}
                                onChange={e => setEditState({ ...editState, answerLines: parseInt(e.target.value) || 0 })}
                                className="w-full p-3 border border-border bg-background rounded-xl text-xs font-bold"
                                placeholder="Auto"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-accent rounded-xl transition-colors">Cancel</button>
                        <button onClick={handleSave} className="px-6 py-2 text-xs font-bold bg-primary text-primary-foreground rounded-xl hover:opacity-90 shadow-lg shadow-primary/20 transition-transform active:scale-95">Save Changes</button>
                    </div>
                </div>
            </div>
        );
    }

    // --- VIEW MODE ---
    return (
        <div className={`group bg-card rounded-[2rem] p-6 transition-all duration-300 relative flex flex-col h-full ${variant === 'selected' ? 'shadow-lg border-2 border-transparent ring-2 ring-primary/20' : 'shadow-sm hover:shadow-xl hover:-translate-y-1 border border-border/50 hover:border-primary/20'}`}>

            {/* Header: Tags & Marks */}
            <div className="flex justify-between items-start mb-5">
                <div className="flex flex-wrap gap-2">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wide ${getDifficultyColor(question.difficulty)}`}>
                        {question.difficulty}
                    </span>
                    <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wide bg-primary/10 text-primary">
                        {question.topic}
                    </span>
                    {/* Sub-parts badge */}
                    {question.subParts && question.subParts.length > 0 && (
                        <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wide bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                            {question.subParts.length} parts
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs font-black text-muted-foreground/50">
                        {question.marks} PTS
                    </span>
                    <button onClick={() => setIsEditing(true)} className="text-muted-foreground/30 hover:text-primary transition-colors p-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>
                </div>
            </div>

            {/* Question Body */}
            <div className="flex-1 mb-6">
                <div className="text-foreground text-sm font-semibold leading-relaxed mb-4">
                    <LatexRenderer content={question.text} />
                </div>

                {question.graphSvg && (
                    <div className="my-4 p-6 bg-secondary/50 rounded-2xl flex justify-center border border-border" dangerouslySetInnerHTML={{ __html: question.graphSvg }} />
                )}

                {/* Image Support */}
                {question.imagePath && (
                    <div className="my-4 rounded-2xl overflow-hidden border border-border">
                        <img src={question.imagePath} alt={question.imageCaption || 'Question diagram'} className="w-full object-contain max-h-48" />
                        {question.imageCaption && (
                            <p className="text-xs text-muted-foreground text-center p-2 bg-secondary">{question.imageCaption}</p>
                        )}
                    </div>
                )}

                {question.options && (
                    <div className="space-y-2.5">
                        {question.options.map((opt, i) => (
                            <div key={i} className="flex items-center gap-3 p-2 rounded-xl hover:bg-accent transition-colors group/opt cursor-default">
                                <span className="w-6 h-6 rounded-full bg-secondary text-muted-foreground text-[10px] font-black flex items-center justify-center group-hover/opt:bg-primary/10 group-hover/opt:text-primary transition-colors">{String.fromCharCode(65 + i)}</span>
                                <span className="text-xs text-foreground font-medium">{opt}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Actions Footer */}
            <div className="mt-auto pt-4 border-t border-border flex gap-3">
                {variant === 'bank' && onAdd && (
                    <button
                        onClick={() => onAdd(question)}
                        disabled={addedToExam}
                        className={`flex-1 text-xs font-bold py-3 rounded-xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 ${addedToExam ? 'bg-green-500/10 text-green-600 cursor-default opacity-100 shadow-none' : 'bg-primary text-primary-foreground hover:opacity-90 shadow-primary/20'}`}
                    >
                        {addedToExam ? (
                            <>
                                <span>Added</span>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                            </>
                        ) : (
                            <>
                                <span>Add to Exam</span>
                                <svg className="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                            </>
                        )}
                    </button>
                )}



                {variant === 'exam' && onRemove && (
                    <button
                        onClick={() => onRemove(question.id)}
                        className="w-full py-2 text-xs font-bold text-destructive bg-destructive/10 hover:bg-destructive/20 rounded-xl transition-colors"
                    >
                        Remove
                    </button>
                )}
            </div>
        </div>
    );
};

export default QuestionCard;
