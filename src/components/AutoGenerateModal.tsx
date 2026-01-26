'use client';

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Question, Difficulty, DBCurriculum, DBGrade, DBSubject } from '@/types';
import { getCurriculums, getSubjects, getGrades } from '@/services/questionService';
import { generateQuestionsByFilter, generateQuestionsFromMaterial } from '@/services/aiService';

interface AutoGenerateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onGenerated: (questions: Question[]) => void;
    availableTopics: string[];
    availableSubjects: string[]; // Keeping primarily for fallback or mock compatibility
}

interface GenerationParams {
    totalCount: number;
    easyCount: number;
    mediumCount: number;
    hardCount: number;
    topics: string[];
    subjectId: string;
    curriculumId: string;
    gradeId: string;
}

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
        subjectId: '',
        curriculumId: '',
        gradeId: '',
    });

    // Database Lookup States
    const [dbCurriculums, setDbCurriculums] = useState<DBCurriculum[]>([]);
    const [dbSubjects, setDbSubjects] = useState<DBSubject[]>([]);
    const [dbGrades, setDbGrades] = useState<DBGrade[]>([]);

    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedQuestions, setGeneratedQuestions] = useState<Question[]>([]);
    const [step, setStep] = useState<'config' | 'preview'>('config');
    const [mode, setMode] = useState<'filters' | 'text' | 'url'>('filters');
    const [materialText, setMaterialText] = useState('');
    const [sourceUrl, setSourceUrl] = useState('');
    const [textCount, setTextCount] = useState(10);

    // Initial Data Fetch
    useEffect(() => {
        if (isOpen) {
            const fetchData = async () => {
                const [curriculums, subjects] = await Promise.all([
                    getCurriculums(),
                    getSubjects()
                ]);
                setDbCurriculums(curriculums);
                setDbSubjects(subjects);

                // Set defaults if data exists and not already set
                if (curriculums.length > 0 && !params.curriculumId) {
                    setParams(p => ({ ...p, curriculumId: curriculums[0].id }));
                }
                if (subjects.length > 0 && !params.subjectId) {
                    setParams(p => ({ ...p, subjectId: subjects[0].id }));
                }
            };
            fetchData();
        }
    }, [isOpen]);

    // Fetch grades when curriculum changes
    useEffect(() => {
        if (params.curriculumId) {
            getGrades(params.curriculumId).then(grades => {
                setDbGrades(grades);
                if (grades.length > 0) {
                    setParams(p => ({ ...p, gradeId: grades[0].id }));
                } else {
                    setParams(p => ({ ...p, gradeId: '' }));
                }
            });
        } else {
            setDbGrades([]);
        }
    }, [params.curriculumId]);

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

            // Get names for prompting (fallback to empty string if not found)
            const curriculumName = dbCurriculums.find(c => c.id === params.curriculumId)?.name || 'General';
            const subjectName = dbSubjects.find(s => s.id === params.subjectId)?.name || 'General';
            const gradeName = dbGrades.find(g => g.id === params.gradeId)?.name || 'Any';

            if (mode === 'filters') {
                const commonFilter = {
                    curriculum: curriculumName,
                    subject: subjectName,
                    term: 'Mid Term 1', // Default, could be made selectable
                    grade: gradeName,
                    topic: params.topics.length > 0 ? params.topics[0] : 'General',
                    // Pass IDs for database saving
                    curriculum_id: params.curriculumId,
                    subject_id: params.subjectId,
                    grade_id: params.gradeId,
                };

                if (params.easyCount > 0) {
                    const easyQuestions = await generateQuestionsByFilter({
                        ...commonFilter,
                        blooms: 'Knowledge',
                    }, params.easyCount);
                    allQuestions.push(...easyQuestions.map(q => ({ ...q, difficulty: 'Easy' as Difficulty })));
                }

                if (params.mediumCount > 0) {
                    const mediumQuestions = await generateQuestionsByFilter({
                        ...commonFilter,
                        blooms: 'Application',
                    }, params.mediumCount);
                    allQuestions.push(...mediumQuestions.map(q => ({ ...q, difficulty: 'Medium' as Difficulty })));
                }

                if (params.hardCount > 0) {
                    const hardQuestions = await generateQuestionsByFilter({
                        ...commonFilter,
                        blooms: 'Analysis',
                    }, params.hardCount);
                    allQuestions.push(...hardQuestions.map(q => ({ ...q, difficulty: 'Difficult' as Difficulty })));
                }
            } else if (mode === 'text') {
                // Text Mode
                const result = await generateQuestionsFromMaterial(materialText, [], textCount);
                allQuestions = result.questions;
            } else {
                // URL Mode
                const result = await generateQuestionsFromMaterial('', [], textCount, sourceUrl);
                allQuestions = result.questions;
            }

            setGeneratedQuestions(allQuestions);
            setStep('preview');
        } catch (error) {
            console.error('Generation failed:', error);
            toast.error('Question generation failed. Please try again.');
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
                            <button
                                onClick={() => setMode('url')}
                                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${mode === 'url' ? 'bg-background text-primary shadow-sm' : 'text-primary-foreground/60 hover:bg-background/10'}`}
                            >
                                From URL
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
                                                value={params.subjectId}
                                                onChange={e => setParams(p => ({ ...p, subjectId: e.target.value }))}
                                                className="w-full p-3 bg-secondary border border-border rounded-xl text-sm font-bold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none"
                                            >
                                                {dbSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                                {dbSubjects.length === 0 && <option value="">Loading subjects...</option>}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-2">Curriculum</label>
                                            <select
                                                value={params.curriculumId}
                                                onChange={e => setParams(p => ({ ...p, curriculumId: e.target.value }))}
                                                className="w-full p-3 bg-secondary border border-border rounded-xl text-sm font-bold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none"
                                            >
                                                {dbCurriculums.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                {dbCurriculums.length === 0 && <option value="">Loading curriculums...</option>}
                                            </select>
                                        </div>
                                    </div>

                                    {/* Grade */}
                                    <div>
                                        <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-2">Grade / Year</label>
                                        <select
                                            value={params.gradeId}
                                            onChange={e => setParams(p => ({ ...p, gradeId: e.target.value }))}
                                            className="w-full p-3 bg-secondary border border-border rounded-xl text-sm font-bold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none"
                                        >
                                            {dbGrades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                            {dbGrades.length === 0 && <option value="">{params.curriculumId ? 'No grades found' : 'Select curriculum first'}</option>}
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
                            ) : mode === 'text' ? (
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
                            ) : (
                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-2">Resource URL (e.g. PapaCambridge, Syllabus PDF)</label>
                                        <div className="relative">
                                            <input
                                                type="url"
                                                value={sourceUrl}
                                                onChange={e => setSourceUrl(e.target.value)}
                                                placeholder="https://pastpapers.papacambridge.com/..."
                                                className="w-full p-4 bg-secondary border border-border rounded-xl text-sm font-medium focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none"
                                            />
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-primary">
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                                </svg>
                                            </div>
                                        </div>
                                        <p className="mt-2 text-[10px] text-muted-foreground leading-relaxed">
                                            Enter a URL to a past paper page, syllabus document, or educational article. Our AI will fetch the content and generate curriculum-aligned questions.
                                        </p>
                                    </div>

                                    <div className="bg-primary/5 rounded-2xl p-4 border border-primary/10">
                                        <h4 className="text-[10px] font-bold uppercase text-primary mb-3">Suggested Sources</h4>
                                        <div className="flex flex-wrap gap-2">
                                            <a href="https://pastpapers.papacambridge.com/" target="_blank" rel="noreferrer" className="text-[10px] font-medium bg-background border border-border px-3 py-1.5 rounded-lg hover:border-primary transition-colors flex items-center gap-1">
                                                <span>PapaCambridge</span>
                                                <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6m4-3h6m0 0v6m0-6L10 14" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                            </a>
                                            <a href="https://www.savemyexams.com/igcse/" target="_blank" rel="noreferrer" className="text-[10px] font-medium bg-background border border-border px-3 py-1.5 rounded-lg hover:border-primary transition-colors flex items-center gap-1">
                                                <span>SaveMyExams</span>
                                                <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6m4-3h6m0 0v6m0-6L10 14" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                            </a>
                                        </div>
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
