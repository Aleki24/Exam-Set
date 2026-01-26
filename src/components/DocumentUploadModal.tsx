'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { Question, QuestionType, Difficulty, DBCurriculum, DBGrade, DBSubject } from '@/types';
import { Button } from '@/components/ui/button';
import { X, FileText, Loader2, Check, Edit2, Trash2 } from 'lucide-react';

interface ExtractedQuestion {
    text: string;
    marks: number;
    difficulty: Difficulty;
    topic: string;
    subtopic?: string;
    type: QuestionType;
    options?: string[];
    matchingPairs?: { left: string; right: string }[];
    markingScheme?: string;
    selected: boolean;
    editing: boolean;
}

interface DocumentUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaveQuestions: (questions: Question[]) => void;
    curriculums: DBCurriculum[];
    grades: DBGrade[];
    subjects: DBSubject[];
}

export default function DocumentUploadModal({
    isOpen,
    onClose,
    onSaveQuestions,
    curriculums,
    grades,
    subjects
}: DocumentUploadModalProps) {
    const [step, setStep] = useState<'upload' | 'extracting' | 'review'>('upload');
    const [textInput, setTextInput] = useState('');
    const [extractedQuestions, setExtractedQuestions] = useState<ExtractedQuestion[]>([]);
    const [metadata, setMetadata] = useState<{ documentTitle?: string; estimatedSubject?: string }>({});

    // Hierarchy for saving
    const [selectedCurriculum, setSelectedCurriculum] = useState('');
    const [selectedGrade, setSelectedGrade] = useState('');
    const [selectedSubject, setSelectedSubject] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleExtract = async () => {
        if (!textInput.trim()) {
            toast.error('Please paste text to extract questions from');
            return;
        }

        setStep('extracting');

        try {
            const formData = new FormData();
            formData.append('text', textInput);

            const response = await fetch('/api/questions/extract', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (!response.ok) {
                // Show error message from API
                const errorMsg = result.error || 'Extraction failed';
                const suggestion = result.suggestion;
                toast.error(errorMsg, {
                    duration: 6000,
                    description: suggestion
                });
                setStep('upload');
                return;
            }

            if (!result.questions || result.questions.length === 0) {
                toast.error('No questions found in the text');
                setStep('upload');
                return;
            }

            // Add selection state to each question
            const questionsWithState = result.questions.map((q: any) => ({
                ...q,
                selected: true,
                editing: false,
            }));

            setExtractedQuestions(questionsWithState);
            setMetadata(result.metadata || {});
            setStep('review');
            toast.success(`Found ${result.questions.length} questions!`);
        } catch (error) {
            console.error('Extraction error:', error);
            toast.error('Failed to extract questions. Please try again.');
            setStep('upload');
        }
    };

    const toggleQuestion = (index: number) => {
        setExtractedQuestions(prev =>
            prev.map((q, i) => i === index ? { ...q, selected: !q.selected } : q)
        );
    };

    const updateQuestion = (index: number, updates: Partial<ExtractedQuestion>) => {
        setExtractedQuestions(prev =>
            prev.map((q, i) => i === index ? { ...q, ...updates } : q)
        );
    };

    const deleteQuestion = (index: number) => {
        setExtractedQuestions(prev => prev.filter((_, i) => i !== index));
    };

    const handleSaveSelected = async () => {
        const selected = extractedQuestions.filter(q => q.selected);

        if (selected.length === 0) {
            toast.error('No questions selected');
            return;
        }

        setIsSaving(true);

        try {
            // Prepare questions for saving
            const questionsToSave = selected.map(q => ({
                text: q.text,
                marks: q.marks,
                difficulty: q.difficulty,
                topic: q.topic,
                subtopic: q.subtopic,
                type: q.type,
                options: q.options,
                matchingPairs: q.matchingPairs,
                markingScheme: q.markingScheme,
                curriculum_id: selectedCurriculum || undefined,
                grade_id: selectedGrade || undefined,
                subject_id: selectedSubject || undefined,
                isAiGenerated: true,
            }));

            const response = await fetch('/api/questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ questions: questionsToSave }),
            });

            if (!response.ok) {
                throw new Error('Failed to save questions');
            }

            const result = await response.json();
            toast.success(`Saved ${result.count} questions to database!`);
            onSaveQuestions(result.questions);
            onClose();
        } catch (error) {
            console.error('Save error:', error);
            toast.error('Failed to save questions');
        } finally {
            setIsSaving(false);
        }
    };

    const resetModal = useCallback(() => {
        setStep('upload');
        setTextInput('');
        setExtractedQuestions([]);
        setMetadata({});
        setSelectedCurriculum('');
        setSelectedGrade('');
        setSelectedSubject('');
    }, []);

    useEffect(() => {
        if (isOpen) {
            resetModal();
        }
    }, [isOpen, resetModal]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
                    <div>
                        <h2 className="text-xl font-bold">
                            {step === 'upload' && 'Import Text'}
                            {step === 'extracting' && 'Extracting Questions...'}
                            {step === 'review' && 'Review Extracted Questions'}
                        </h2>
                        {metadata.documentTitle && (
                            <p className="text-sm text-white/70">{metadata.documentTitle}</p>
                        )}
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
                    {/* Upload Step */}
                    {step === 'upload' && (
                        <div className="space-y-6">
                            {/* Paste Text */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Paste Exam Text
                                </label>
                                <textarea
                                    value={textInput}
                                    onChange={(e) => setTextInput(e.target.value)}
                                    rows={12}
                                    className="w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
                                    placeholder="Paste your exam text here. The AI will analyze it to find questions..."
                                />
                                <p className="text-xs text-gray-500 mt-2">
                                    Tip: Copy text from your PDF or Word document and paste it here.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Extracting Step */}
                    {step === 'extracting' && (
                        <div className="flex flex-col items-center justify-center py-12">
                            <Loader2 className="w-12 h-12 text-purple-600 animate-spin mb-4" />
                            <p className="text-lg font-medium text-gray-700">Analyzing text...</p>
                            <p className="text-sm text-gray-500">Identifying questions...</p>
                        </div>
                    )}

                    {/* Review Step */}
                    {step === 'review' && (
                        <div className="space-y-4">
                            {/* Hierarchy Selection */}
                            <div className="bg-gray-50 p-4 rounded-xl">
                                <p className="text-sm font-medium text-gray-700 mb-3">
                                    Assign to (optional):
                                </p>
                                <div className="grid grid-cols-3 gap-4">
                                    <select
                                        value={selectedCurriculum}
                                        onChange={(e) => setSelectedCurriculum(e.target.value)}
                                        className="p-2 border border-gray-300 rounded-lg"
                                    >
                                        <option value="">Curriculum...</option>
                                        {curriculums.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                    <select
                                        value={selectedGrade}
                                        onChange={(e) => setSelectedGrade(e.target.value)}
                                        className="p-2 border border-gray-300 rounded-lg"
                                    >
                                        <option value="">Grade...</option>
                                        {grades.filter(g => !selectedCurriculum || g.curriculum_id === selectedCurriculum).map(g => (
                                            <option key={g.id} value={g.id}>{g.name}</option>
                                        ))}
                                    </select>
                                    <select
                                        value={selectedSubject}
                                        onChange={(e) => setSelectedSubject(e.target.value)}
                                        className="p-2 border border-gray-300 rounded-lg"
                                    >
                                        <option value="">Subject...</option>
                                        {subjects.map(s => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Questions List */}
                            <div className="space-y-3">
                                {extractedQuestions.map((q, idx) => (
                                    <div
                                        key={idx}
                                        className={`p-4 rounded-xl border-2 transition ${q.selected
                                            ? 'border-purple-300 bg-purple-50'
                                            : 'border-gray-200 bg-gray-50 opacity-60'
                                            }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            {/* Checkbox */}
                                            <button
                                                onClick={() => toggleQuestion(idx)}
                                                className={`mt-1 w-5 h-5 rounded border-2 flex items-center justify-center ${q.selected ? 'bg-purple-600 border-purple-600' : 'border-gray-400'
                                                    }`}
                                            >
                                                {q.selected && <Check className="w-3 h-3 text-white" />}
                                            </button>

                                            {/* Question Content */}
                                            <div className="flex-1 min-w-0">
                                                {q.editing ? (
                                                    <textarea
                                                        value={q.text}
                                                        onChange={(e) => updateQuestion(idx, { text: e.target.value })}
                                                        className="w-full p-2 border rounded-lg text-sm"
                                                        rows={3}
                                                    />
                                                ) : (
                                                    <p className="text-sm text-gray-800">{q.text}</p>
                                                )}

                                                {/* Meta Row */}
                                                <div className="flex flex-wrap gap-2 mt-2">
                                                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                                                        {q.type}
                                                    </span>
                                                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                                                        {q.marks} marks
                                                    </span>
                                                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">
                                                        {q.difficulty}
                                                    </span>
                                                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                                                        {q.topic}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={() => updateQuestion(idx, { editing: !q.editing })}
                                                    className="p-1.5 hover:bg-gray-200 rounded"
                                                >
                                                    <Edit2 className="w-4 h-4 text-gray-500" />
                                                </button>
                                                <button
                                                    onClick={() => deleteQuestion(idx)}
                                                    className="p-1.5 hover:bg-red-100 rounded"
                                                >
                                                    <Trash2 className="w-4 h-4 text-red-500" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Summary */}
                            <div className="text-center text-sm text-gray-500">
                                {extractedQuestions.filter(q => q.selected).length} of {extractedQuestions.length} questions selected
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-between gap-3 p-4 border-t bg-gray-50">
                    <div>
                        {step === 'review' && (
                            <Button variant="outline" onClick={resetModal}>
                                Back
                            </Button>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <Button variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        {step === 'upload' && (
                            <Button onClick={handleExtract} disabled={!textInput.trim()}>
                                <FileText className="w-4 h-4 mr-2" />
                                Extract from Text
                            </Button>
                        )}
                        {step === 'review' && (
                            <Button onClick={handleSaveSelected} disabled={isSaving}>
                                {isSaving ? 'Saving...' : `Save ${extractedQuestions.filter(q => q.selected).length} Questions`}
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
