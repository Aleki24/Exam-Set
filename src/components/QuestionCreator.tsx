'use client';

import React, { useState, useEffect } from 'react';
import { Question, BloomsLevel } from '@/types';
import { getAiSuggestions } from '@/services/aiService';

interface QuestionCreatorProps {
    onSave: (q: Question) => void;
    onCancel: () => void;
    initialTopic?: string;
    grade?: string;
    curriculum?: string;
}

const BLOOMS_LEVELS: BloomsLevel[] = ['Knowledge', 'Understanding', 'Application', 'Analysis', 'Evaluation', 'Creation'];

const QuestionCreator: React.FC<QuestionCreatorProps> = ({ onSave, onCancel, initialTopic = 'General', grade, curriculum }) => {
    const [activeTab, setActiveTab] = useState<'manual' | 'ai'>('manual');
    const [loading, setLoading] = useState(false);
    const [subject, setSubject] = useState('');
    const [topic, setTopic] = useState(initialTopic === 'All' ? 'General' : initialTopic);
    const [marks, setMarks] = useState(1);
    const [difficulty, setDifficulty] = useState('Medium');
    const [bloomLevel, setBloomLevel] = useState('Knowledge');
    const [content, setContent] = useState('');
    const [answer, setAnswer] = useState('');

    const [draft, setDraft] = useState<Partial<Question>>({
        id: '', // Initialize empty to avoid hydration mismatch
        text: '',
        type: 'Multiple Choice',
        marks: 1,
        difficulty: 'Medium',
        topic: initialTopic === 'All' ? 'General' : initialTopic,
        options: ['', '', '', ''],
        markingScheme: '',
        graphSvg: '',
        bloomsLevel: 'Knowledge'
    });

    useEffect(() => {
        // Set ID on mount only
        setDraft(d => ({ ...d, id: `manual-${Date.now()}` }));
    }, []);

    const handleAiAssist = async () => {
        if (!draft.text || draft.text.length < 3) return;
        setLoading(true);
        try {
            const suggestions = await getAiSuggestions(
                draft.text || '',
                draft.type || 'Multiple Choice',
                draft.topic,
                grade,
                curriculum
            );
            if (suggestions) {
                setDraft(prev => ({
                    ...prev,
                    text: suggestions.refinedText,
                    marks: suggestions.suggestedMarks || prev.marks,
                    topic: suggestions.suggestedTopic || prev.topic,
                    options: (prev.type === 'Multiple Choice' && suggestions.options?.length) ? suggestions.options : prev.options,
                    markingScheme: suggestions.markingScheme || prev.markingScheme,
                    graphSvg: suggestions.graphSvg || prev.graphSvg,
                    bloomsLevel: suggestions.bloomsLevel || prev.bloomsLevel
                }));
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const save = () => {
        if (!draft.text) return;
        onSave(draft as Question);
    };

    const handleSubmit = () => {
        // Placeholder for AI generation submission
        console.log('Generate with AI:', { subject, topic, marks, difficulty, bloomLevel });
    };

    return (
        <div className="bg-card rounded-[2rem] border border-border shadow-sm overflow-hidden mb-8 animate-in fade-in slide-in-from-top-4 duration-300">
            {/* Tabs */}
            <div className="flex border-b border-border bg-secondary/50">
                <button
                    onClick={() => setActiveTab('manual')}
                    className={`flex-1 py-4 text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'manual' ? 'text-primary border-b-2 border-primary bg-card' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}
                >
                    Manual Input
                </button>
                <button
                    onClick={() => setActiveTab('ai')}
                    className={`flex-1 py-4 text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'ai' ? 'text-primary border-b-2 border-primary bg-card' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}
                >
                    AI Magic
                </button>
            </div>

            {activeTab === 'manual' ? (
                <div className="p-6 space-y-6">
                    {/* Type Selector */}
                    <div className="bg-secondary/50 border border-border rounded-xl flex flex-wrap gap-1 p-2">
                        {(['Multiple Choice', 'Structured', 'Essay'] as const).map(type => (
                            <button
                                key={type}
                                onClick={() => setDraft({ ...draft, type })}
                                className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wide transition-all ${draft.type === type
                                    ? 'bg-primary text-primary-foreground shadow-md'
                                    : 'text-muted-foreground hover:bg-card hover:text-primary'
                                    }`}
                            >
                                {type}
                            </button>
                        ))}
                    </div>

                    {/* Question Content */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-muted-foreground px-1 tracking-widest">Question Content</label>
                        <div className="relative">
                            <textarea
                                value={draft.text}
                                onChange={e => setDraft({ ...draft, text: e.target.value })}
                                placeholder="Type your question here..."
                                className="w-full min-h-[140px] p-4 rounded-2xl border border-border bg-secondary text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all resize-none leading-relaxed"
                            />
                            {/* AI Assist Button */}
                            <button
                                onClick={handleAiAssist}
                                disabled={loading || !draft.text}
                                className="absolute bottom-4 right-4 bg-gradient-to-r from-primary to-purple-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/30 hover:scale-105 transition-all disabled:opacity-50 disabled:scale-100"
                            >
                                {loading ? (
                                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                ) : (
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                )}
                                AI Assist
                            </button>
                        </div>
                    </div>

                    {/* Graph Preview if exists */}
                    {draft.graphSvg && (
                        <div className="p-4 bg-secondary rounded-xl border border-border">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">Graph / Diagram</label>
                                <button onClick={() => setDraft({ ...draft, graphSvg: '' })} className="text-rose-500 text-[10px] font-bold hover:underline">Remove</button>
                            </div>
                            <div className="flex justify-center" dangerouslySetInnerHTML={{ __html: draft.graphSvg }} />
                        </div>
                    )}

                    {/* Options for MC */}
                    {draft.type === 'Multiple Choice' && (
                        <div className="space-y-4 bg-secondary/30 p-5 rounded-2xl border border-border">
                            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Answer Options</label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {draft.options?.map((opt, idx) => (
                                    <div key={idx} className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-secondary border border-border text-primary flex items-center justify-center text-xs font-black shadow-sm">
                                            {String.fromCharCode(65 + idx)}
                                        </div>
                                        <input
                                            value={opt}
                                            onChange={e => {
                                                const newOpts = [...(draft.options || [])];
                                                newOpts[idx] = e.target.value;
                                                setDraft({ ...draft, options: newOpts });
                                            }}
                                            placeholder={`Option ${idx + 1}`}
                                            className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-card text-xs font-bold focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all shadow-sm"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Marking Scheme */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-muted-foreground px-1 tracking-widest">Marking Scheme / Answer Key</label>
                        <textarea
                            value={draft.markingScheme}
                            onChange={e => setDraft({ ...draft, markingScheme: e.target.value })}
                            placeholder="e.g. Correct Answer: B. Reason: Photosynthesis occurs in chloroplasts..."
                            className="w-full p-4 rounded-2xl border border-border bg-secondary text-xs font-medium focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all resize-none shadow-sm"
                            rows={3}
                        />
                    </div>

                    {/* Metadata Footer */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 border-t border-border pt-6">
                        <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase text-muted-foreground px-1">Marks</label>
                            <input
                                type="number"
                                value={draft.marks}
                                onChange={e => setDraft({ ...draft, marks: parseInt(e.target.value) || 0 })}
                                className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase text-muted-foreground px-1">Difficulty</label>
                            <select
                                value={draft.difficulty}
                                onChange={e => setDraft({ ...draft, difficulty: e.target.value as Question['difficulty'] })}
                                className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-primary/20 outline-none cursor-pointer"
                            >
                                <option>Easy</option>
                                <option>Medium</option>
                                <option>Difficult</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase text-muted-foreground px-1">Bloom&apos;s Level</label>
                            <select
                                value={draft.bloomsLevel}
                                onChange={e => setDraft({ ...draft, bloomsLevel: e.target.value as BloomsLevel })}
                                className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-primary/20 outline-none cursor-pointer"
                            >
                                {BLOOMS_LEVELS.map(level => (
                                    <option key={level} value={level}>{level}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase text-muted-foreground px-1">Topic</label>
                            <input
                                value={draft.topic}
                                onChange={e => setDraft({ ...draft, topic: e.target.value })}
                                className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                            />
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-4 justify-end pt-4">
                        <button onClick={onCancel} className="px-6 py-3 rounded-xl text-xs font-bold text-muted-foreground hover:bg-secondary transition-colors">
                            Cancel
                        </button>
                        <button
                            onClick={save}
                            className="px-10 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-primary-foreground bg-primary hover:opacity-90 shadow-lg shadow-primary/20 transition-all active:scale-95"
                        >
                            Save Question
                        </button>
                    </div>
                </div>
            ) : (
                <div className="p-8 flex flex-col items-center text-center">
                    <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                        <svg className="w-12 h-12 text-primary animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    </div>
                    <div className="max-w-md mb-8">
                        <h3 className="text-2xl font-black text-foreground mb-3">Generate with AI</h3>
                        <p className="text-sm text-muted-foreground">Describe what you need, and our AI will craft high-quality questions for you instantly.</p>
                    </div>

                    <div className="space-y-8 w-full max-w-xl">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2 text-left">
                                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Subject Area</label>
                                <input
                                    type="text"
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    className="w-full bg-secondary border border-border rounded-2xl px-5 py-4 text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                    placeholder="e.g. Mathematics"
                                />
                            </div>
                            <div className="space-y-2 text-left">
                                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Topic / Lesson</label>
                                <input
                                    type="text"
                                    value={topic}
                                    onChange={(e) => setTopic(e.target.value)}
                                    className="w-full bg-secondary border border-border rounded-2xl px-5 py-4 text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                    placeholder="e.g. Calculus"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[
                                { label: 'Bulk Generate', icon: '⚡' },
                                { label: 'Smart Props', icon: '💡' },
                                { label: 'Auto Bloom\'s', icon: '🧠' },
                                { label: 'Level Balance', icon: '⚖️' }
                            ].map((item) => (
                                <button key={item.label} className="bg-secondary/50 border border-border p-4 rounded-2xl flex flex-col items-center gap-2 hover:bg-accent transition-all group">
                                    <span className="text-2xl group-hover:scale-110 transition-transform">{item.icon}</span>
                                    <span className="text-[9px] font-black uppercase tracking-tighter text-muted-foreground">{item.label}</span>
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={handleSubmit}
                            className="w-full bg-primary text-primary-foreground py-5 rounded-2xl text-sm font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-xl shadow-primary/20 active:scale-[0.98]"
                        >
                            Generate Question Bank
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default QuestionCreator;
