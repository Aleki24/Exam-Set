'use client';

import React, { useState } from 'react';
import { Question, Difficulty, BloomsLevel } from '@/types';

import { generateQuestionsByFilter, generateQuestionsFromMaterial } from '@/services/aiService';

interface AutoGenerateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onGenerated: (questions: Question[]) => void;
    availableTopics: string[];
    availableSubjects: string[];
}

interface GenerationParams {
    totalCount: number;
    easyCount: number;
    mediumCount: number;
    hardCount: number;
    topics: string[];
    subject: string;
    curriculum: string;
    grade: string;
}

const CURRICULUMS = ['IGCSE', 'CBC', 'Pearson', 'Cambridge', 'National', 'IB'];
const GRADES = ['Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12', 'Year 9', 'Year 10', 'Year 11', 'Year 12'];

const AutoGenerateModal: React.FC<AutoGenerateModalProps> = ({
    isOpen,
    onClose,
    onGenerated,
    availableTopics,
    availableSubjects,
}) => {
    const [params, setParams] = useState<GenerationParams>({
        totalCount: 10,
        easyCount: 4,
        mediumCount: 4,
        hardCount: 2,
        topics: [],
        subject: 'Mathematics',
        curriculum: 'IGCSE',
        grade: 'Grade 10',
    });

    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedQuestions, setGeneratedQuestions] = useState<Question[]>([]);
    const [step, setStep] = useState<'config' | 'preview'>('config');
    const [mode, setMode] = useState<'filters' | 'text'>('filters');
    const [materialText, setMaterialText] = useState('');
    const [textCount, setTextCount] = useState(10);

    const updateDifficultyCount = (difficulty: 'easyCount' | 'mediumCount' | 'hardCount', value: number) => {
        const newValue = Math.max(0, value);
        const newParams = { ...params, [difficulty]: newValue };
        newParams.totalCount = newParams.easyCount + newParams.mediumCount + newParams.hardCount;
        setParams(newParams);
    };

    const handleGenerate = async () => {
        setIsGenerating(true);
        setGeneratedQuestions([]);

        try {
            let allQuestions: Question[] = [];

            if (mode === 'filters') {
                if (params.easyCount > 0) {
                    const easyQuestions = await generateQuestionsByFilter({
                        curriculum: params.curriculum,
                        subject: params.subject,
                        term: 'All',
                        grade: params.grade,
                        topic: params.topics.length > 0 ? params.topics[0] : 'General',
                        blooms: 'Knowledge',
                    }, params.easyCount);
                    allQuestions.push(...easyQuestions.map(q => ({ ...q, difficulty: 'Easy' as Difficulty })));
                }

                if (params.mediumCount > 0) {
                    const mediumQuestions = await generateQuestionsByFilter({
                        curriculum: params.curriculum,
                        subject: params.subject,
                        term: 'All',
                        grade: params.grade,
                        topic: params.topics.length > 0 ? params.topics[0] : 'General',
                        blooms: 'Application',
                    }, params.mediumCount);
                    allQuestions.push(...mediumQuestions.map(q => ({ ...q, difficulty: 'Medium' as Difficulty })));
                }

                if (params.hardCount > 0) {
                    const hardQuestions = await generateQuestionsByFilter({
                        curriculum: params.curriculum,
                        subject: params.subject,
                        term: 'All',
                        grade: params.grade,
                        topic: params.topics.length > 0 ? params.topics[0] : 'General',
                        blooms: 'Analysis',
                    }, params.hardCount);
                    allQuestions.push(...hardQuestions.map(q => ({ ...q, difficulty: 'Difficult' as Difficulty })));
                }
            } else {
                // Text Mode
                const result = await generateQuestionsFromMaterial(materialText, [], textCount);
                allQuestions = result.questions;
            }

            setGeneratedQuestions(allQuestions);
            setStep('preview');
        } catch (error) {
            console.error('Generation failed:', error);
            alert('Question generation failed. Please try again.');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleAcceptAll = () => {
        onGenerated(generatedQuestions);
        setGeneratedQuestions([]);
        setStep('config');
        onClose();
    };

    const handleRemoveQuestion = (id: string) => {
        setGeneratedQuestions(prev => prev.filter(q => q.id !== id));
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <div className="bg-card rounded-[2rem] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-border">
                {/* Header */}
                <div className="p-6 border-b border-border bg-gradient-to-r from-primary to-purple-600 text-primary-foreground">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-card rounded-xl flex items-center justify-center">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-xl font-black">Generate Paper</h2>
                                <p className="text-xs text-primary-foreground/70">AI-powered question generation</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {step === 'config' && (
                        <div className="flex gap-2">
                            <button
                                onClick={() => setMode('filters')}
                                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${mode === 'filters' ? 'bg-background text-primary shadow-sm' : 'text-primary-foreground/60 hover:bg-background/10'}`}
                            >
                                Topic Filters
                            </button>
                            <button
                                onClick={() => setMode('text')}
                                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${mode === 'text' ? 'bg-background text-primary shadow-sm' : 'text-primary-foreground/60 hover:bg-background/10'}`}
                            >
                                From Text
                            </button>
                        </div>
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {step === 'config' ? (
                        <div className="space-y-6">
                            {mode === 'filters' ? (
                                <>
                                    {/* Subject & Curriculum */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-2">Subject</label>
                                            <select
                                                value={params.subject}
                                                onChange={e => setParams(p => ({ ...p, subject: e.target.value }))}
                                                className="w-full p-3 bg-secondary border border-border rounded-xl text-sm font-bold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none"
                                            >
                                                {availableSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-2">Curriculum</label>
                                            <select
                                                value={params.curriculum}
                                                onChange={e => setParams(p => ({ ...p, curriculum: e.target.value }))}
                                                className="w-full p-3 bg-secondary border border-border rounded-xl text-sm font-bold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none"
                                            >
                                                {CURRICULUMS.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    {/* Grade */}
                                    <div>
                                        <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-2">Grade / Year</label>
                                        <select
                                            value={params.grade}
                                            onChange={e => setParams(p => ({ ...p, grade: e.target.value }))}
                                            className="w-full p-3 bg-secondary border border-border rounded-xl text-sm font-bold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none"
                                        >
                                            {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                                        </select>
                                    </div>

                                    {/* Difficulty Distribution */}
                                    <div>
                                        <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-4">Difficulty Distribution</label>
                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="bg-emerald-50 rounded-2xl p-4 text-center">
                                                <p className="text-[10px] font-bold uppercase text-emerald-600 mb-2">Easy</p>
                                                <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        onClick={() => updateDifficultyCount('easyCount', params.easyCount - 1)}
                                                        className="w-8 h-8 bg-background rounded-lg text-emerald-600 font-bold shadow-sm hover:bg-emerald-100"
                                                    >-</button>
                                                    <span className="text-2xl font-black text-emerald-700 w-8">{params.easyCount}</span>
                                                    <button
                                                        onClick={() => updateDifficultyCount('easyCount', params.easyCount + 1)}
                                                        className="w-8 h-8 bg-background rounded-lg text-emerald-600 font-bold shadow-sm hover:bg-emerald-100"
                                                    >+</button>
                                                </div>
                                            </div>
                                            <div className="bg-amber-50 rounded-2xl p-4 text-center">
                                                <p className="text-[10px] font-bold uppercase text-amber-600 mb-2">Medium</p>
                                                <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        onClick={() => updateDifficultyCount('mediumCount', params.mediumCount - 1)}
                                                        className="w-8 h-8 bg-background rounded-lg text-amber-600 font-bold shadow-sm hover:bg-amber-100"
                                                    >-</button>
                                                    <span className="text-2xl font-black text-amber-700 w-8">{params.mediumCount}</span>
                                                    <button
                                                        onClick={() => updateDifficultyCount('mediumCount', params.mediumCount + 1)}
                                                        className="w-8 h-8 bg-background rounded-lg text-amber-600 font-bold shadow-sm hover:bg-amber-100"
                                                    >+</button>
                                                </div>
                                            </div>
                                            <div className="bg-rose-50 rounded-2xl p-4 text-center">
                                                <p className="text-[10px] font-bold uppercase text-rose-600 mb-2">Hard</p>
                                                <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        onClick={() => updateDifficultyCount('hardCount', params.hardCount - 1)}
                                                        className="w-8 h-8 bg-background rounded-lg text-rose-600 font-bold shadow-sm hover:bg-rose-100"
                                                    >-</button>
                                                    <span className="text-2xl font-black text-rose-700 w-8">{params.hardCount}</span>
                                                    <button
                                                        onClick={() => updateDifficultyCount('hardCount', params.hardCount + 1)}
                                                        className="w-8 h-8 bg-background rounded-lg text-rose-600 font-bold shadow-sm hover:bg-rose-100"
                                                    >+</button>
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-center text-sm font-bold text-muted-foreground mt-4">
                                            Total: <span className="text-foreground">{params.totalCount}</span> questions
                                        </p>
                                    </div>
                                </>
                            ) : (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-2">Learning Material (Syllabus, Notes)</label>
                                        <textarea
                                            value={materialText}
                                            onChange={e => setMaterialText(e.target.value)}
                                            placeholder="Paste your content here..."
                                            className="w-full h-48 p-4 bg-secondary border border-border rounded-xl text-sm font-medium focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none resize-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-2">Number of Questions</label>
                                        <div className="flex items-center gap-4">
                                            <input
                                                type="range"
                                                min="1"
                                                max="30"
                                                value={textCount}
                                                onChange={e => setTextCount(Number(e.target.value))}
                                                className="flex-1 accent-primary"
                                            />
                                            <span className="text-xl font-black text-foreground w-8 text-center">{textCount}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-foreground">Generated Questions ({generatedQuestions.length})</h3>
                                <button
                                    onClick={() => setStep('config')}
                                    className="text-xs font-bold text-primary hover:underline"
                                >
                                    ← Back to Config
                                </button>
                            </div>
                            {generatedQuestions.map(q => (
                                <div key={q.id} className="bg-secondary rounded-xl p-4 flex items-start gap-3 group border border-border">
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-foreground mb-2">{q.text}</p>
                                        <div className="flex gap-2">
                                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${q.difficulty === 'Easy' ? 'bg-emerald-100 text-emerald-700' :
                                                q.difficulty === 'Medium' ? 'bg-amber-100 text-amber-700' :
                                                    'bg-rose-100 text-rose-700'
                                                }`}>{q.difficulty}</span>
                                            <span className="text-[9px] font-bold text-muted-foreground">{q.marks} pts</span>
                                            <span className="text-[9px] font-bold text-primary">{q.topic}</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleRemoveQuestion(q.id)}
                                        className="p-1.5 text-rose-400 hover:bg-rose-100 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-border bg-secondary flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 text-sm font-bold text-muted-foreground hover:bg-background rounded-xl transition-colors"
                    >
                        Cancel
                    </button>
                    {step === 'config' ? (
                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating || (mode === 'filters' && params.totalCount === 0) || (mode === 'text' && !materialText)}
                            className="flex-1 py-3 bg-gradient-to-r from-primary to-purple-600 text-primary-foreground text-sm font-bold rounded-xl shadow-lg shadow-primary/20 hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {isGenerating ? (
                                <>
                                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                                    </svg>
                                    Generate Magic ✨
                                </>
                            )}
                        </button>
                    ) : (
                        <button
                            onClick={handleAcceptAll}
                            disabled={generatedQuestions.length === 0}
                            className="flex-1 py-3 bg-emerald-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all disabled:opacity-50"
                        >
                            Add {generatedQuestions.length} to Bank
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AutoGenerateModal;
