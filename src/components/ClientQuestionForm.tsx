'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { X, Save, Loader2, Plus, Trash2, ChevronDown, ChevronUp, Image as ImageIcon, Settings, ArrowRight } from 'lucide-react';
import RichTextEditor from '@/components/ui/RichTextEditor';
import SingleQuestionPreview from './SingleQuestionPreview';
import { QuestionSubPart, Question } from '@/types';

const STORAGE_KEY = 'exam-set-question-form-defaults';

interface Curriculum {
    id: string;
    name: string;
}

interface Grade {
    id: string;
    curriculum_id: string;
    name: string;
    level?: string;
    band?: string;
}

interface Subject {
    id: string;
    name: string;
    code?: string;
}

interface QuestionFormData {
    text: string;
    marks: number;
    difficulty: 'Easy' | 'Medium' | 'Difficult';
    topic: string;
    subtopic: string;
    type: string;
    options: string[];
    matching_pairs: { left: string; right: string }[];
    unit: string;
    marking_scheme: string;
    blooms_level: string;
    curriculum_id: string;
    grade_id: string;
    subject_id: string;
    term: string;
    sub_parts: QuestionSubPart[];
    imagePath?: string;
    imageCaption?: string;
    answerLines?: number;
}

interface ClientQuestionFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (question: QuestionFormData) => Promise<void>;
    curriculums: Curriculum[];
    subjects: Subject[];
}

const QUESTION_TYPES = [
    'Multiple Choice',
    'True/False',
    'Matching',
    'Fill-in-the-blank',
    'Numeric',
    'Structured',
    'Short Answer',
    'Essay',
    'Practical',
    'Oral',
];

const DIFFICULTY_LEVELS = ['Easy', 'Medium', 'Difficult'] as const;
const BLOOMS_LEVELS = ['Knowledge', 'Understanding', 'Application', 'Analysis', 'Evaluation', 'Creation'];
const TERMS = [
    { value: 'opener', label: 'Opener' },
    { value: 'mid_term_1', label: 'Mid Term 1' },
    { value: 'end_term_1', label: 'End of Term 1' },
    { value: 'mid_term_2', label: 'Mid Term 2' },
    { value: 'end_term_2', label: 'End of Term 2' },
    { value: 'mid_term_3', label: 'Mid Term 3' },
    { value: 'end_term_3', label: 'End of Term 3' },
];

const DEFAULT_FORM_DATA: QuestionFormData = {
    text: '',
    marks: 1,
    difficulty: 'Medium',
    topic: '',
    subtopic: '',
    type: 'Structured',
    options: ['', '', '', ''],
    matching_pairs: [{ left: '', right: '' }],
    unit: '',
    marking_scheme: '',
    blooms_level: 'Knowledge',
    curriculum_id: '',
    grade_id: '',
    subject_id: '',
    term: '',
    sub_parts: [],
    imagePath: '',
    imageCaption: '',
    answerLines: 4
};

// Generate labels for sub-parts (a, b, c, ..., z, aa, ab, ...)
const getPartLabel = (index: number): string => {
    if (index < 26) return String.fromCharCode(97 + index); // a-z
    return String.fromCharCode(97 + Math.floor(index / 26) - 1) + String.fromCharCode(97 + (index % 26)); // aa, ab, ...
};

export default function ClientQuestionForm({
    isOpen,
    onClose,
    onSave,
    curriculums,
    subjects,
}: ClientQuestionFormProps) {
    const [formData, setFormData] = useState<QuestionFormData>(DEFAULT_FORM_DATA);
    const [grades, setGrades] = useState<Grade[]>([]);
    const [isUploading, setIsUploading] = useState(false);

    // CBC Specific State
    const [selectedLevel, setSelectedLevel] = useState<string>('');
    const [selectedBand, setSelectedBand] = useState<string>('');
    const [availableSubjects, setAvailableSubjects] = useState<Subject[]>(subjects);

    const [isSaving, setIsSaving] = useState(false);
    const [isSaveAndAdd, setIsSaveAndAdd] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Load defaults from local storage
    useEffect(() => {
        if (isOpen) {
            const savedDetails = localStorage.getItem(STORAGE_KEY);
            if (savedDetails) {
                try {
                    const parsed = JSON.parse(savedDetails);
                    setFormData(prev => ({
                        ...prev,
                        curriculum_id: parsed.curriculum_id || '',
                        grade_id: parsed.grade_id || '',
                        subject_id: parsed.subject_id || '',
                        topic: parsed.topic || '',
                        term: parsed.term || '',
                        subtopic: parsed.subtopic || '',
                        blooms_level: parsed.blooms_level || 'Knowledge',
                        difficulty: parsed.difficulty || 'Medium'
                    }));
                } catch (e) {
                    console.error('Failed to parse saved form defaults', e);
                }
            }
        }
    }, [isOpen]);

    // Fetch grades when curriculum changes
    const fetchGrades = useCallback(async (curriculumId: string) => {
        if (!curriculumId) {
            setGrades([]);
            return;
        }
        try {
            const res = await fetch(`/api/admin/lookup?type=grades&curriculum_id=${curriculumId}`);
            if (res.ok) {
                const data = await res.json();
                setGrades(data.grades || []);
            }
        } catch (error) {
            console.error('Error fetching grades:', error);
        }
    }, []);

    useEffect(() => {
        if (formData.curriculum_id) {
            fetchGrades(formData.curriculum_id);
        }
    }, [formData.curriculum_id, fetchGrades]);

    // Filter grades based on level/band
    const filteredGrades = useMemo(() => {
        if (!grades.length) return [];
        return grades.filter(g => {
            if (selectedLevel && g.level !== selectedLevel) return false;
            // Only check band if it's selected (some levels might not have bands)
            if (selectedBand && g.band !== selectedBand) return false;
            return true;
        });
    }, [grades, selectedLevel, selectedBand]);

    // Derived lists for dropdowns
    const levels = useMemo(() => Array.from(new Set(grades.map(g => g.level).filter(Boolean))), [grades]);
    const bands = useMemo(() => Array.from(new Set(grades.filter(g => g.level === selectedLevel).map(g => g.band).filter(Boolean))), [grades, selectedLevel]);

    // Auto-select curriculum if only one exists
    useEffect(() => {
        if (curriculums.length === 1 && !formData.curriculum_id) {
            setFormData(prev => ({ ...prev, curriculum_id: curriculums[0].id }));
        }
    }, [curriculums, formData.curriculum_id]);

    // Check if current curriculum is CBC
    const isCBC = useMemo(() => {
        const curr = curriculums.find(c => c.id === formData.curriculum_id);
        return curr?.name === 'CBC' || (curriculums.length === 1 && curriculums[0].name === 'CBC');
    }, [formData.curriculum_id, curriculums]);

    // Fetch subjects when grade changes
    useEffect(() => {
        const fetchSubjects = async () => {
            if (!formData.grade_id) {
                setAvailableSubjects(subjects); // fallback to all
                return;
            }
            try {
                const res = await fetch(`/api/admin/lookup?type=subjects&grade_id=${formData.grade_id}`);
                if (res.ok) {
                    const data = await res.json();
                    setAvailableSubjects(data.subjects || []);
                }
            } catch (error) {
                console.error('Error fetching subjects:', error);
            }
        };
        fetchSubjects();
    }, [formData.grade_id, subjects]);

    // Reset loop logic
    useEffect(() => {
        if (isOpen) {
            setFormData(DEFAULT_FORM_DATA);
            setSelectedLevel('');
            setSelectedBand('');
            setError(null);
        }
    }, [isOpen]);

    // Reset Level/Band when curriculum changes
    useEffect(() => {
        setSelectedLevel('');
        setSelectedBand('');
    }, [formData.curriculum_id]);

    const saveToStorage = (data: QuestionFormData) => {
        const toSave = {
            curriculum_id: data.curriculum_id,
            grade_id: data.grade_id,
            subject_id: data.subject_id,
            topic: data.topic,
            subtopic: data.subtopic,
            term: data.term,
            blooms_level: data.blooms_level,
            difficulty: data.difficulty
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    };

    const executeSave = async (shouldClose: boolean) => {
        if (!formData.text?.trim()) {
            setError('Question text is required');
            return;
        }
        if (!formData.topic?.trim()) {
            setError('Topic is required');
            return;
        }

        if (shouldClose) setIsSaving(true);
        else setIsSaveAndAdd(true);

        setError(null);
        try {
            await onSave(formData);
            saveToStorage(formData);

            if (shouldClose) {
                onClose();
            } else {
                // Keep context but reset content
                setFormData(prev => ({
                    ...DEFAULT_FORM_DATA,
                    curriculum_id: prev.curriculum_id,
                    grade_id: prev.grade_id,
                    subject_id: prev.subject_id,
                    topic: prev.topic,
                    subtopic: prev.subtopic,
                    term: prev.term,
                    blooms_level: prev.blooms_level,
                    difficulty: prev.difficulty,
                    type: prev.type
                }));
            }
        } catch (err) {
            setError('Failed to save question');
        } finally {
            setIsSaving(false);
            setIsSaveAndAdd(false);
        }
    };

    const handleSave = () => executeSave(true);
    const handleSaveAndAdd = () => executeSave(false);

    const updateOption = (index: number, value: string) => {
        const newOptions = [...formData.options];
        newOptions[index] = value;
        setFormData({ ...formData, options: newOptions });
    };

    const addMatchingPair = () => {
        setFormData({
            ...formData,
            matching_pairs: [...formData.matching_pairs, { left: '', right: '' }],
        });
    };

    const updateMatchingPair = (index: number, side: 'left' | 'right', value: string) => {
        const pairs = [...formData.matching_pairs];
        pairs[index] = { ...pairs[index], [side]: value };
        setFormData({ ...formData, matching_pairs: pairs });
    };

    const removeMatchingPair = (index: number) => {
        const pairs = [...formData.matching_pairs];
        pairs.splice(index, 1);
        setFormData({ ...formData, matching_pairs: pairs });
    };

    // Sub-parts state and handlers
    const [hasSubParts, setHasSubParts] = useState(false);

    // Calculate total marks from sub-parts
    const subPartsTotal = useMemo(() => {
        return formData.sub_parts.reduce((sum, part) => sum + part.marks, 0);
    }, [formData.sub_parts]);

    // Sync marks when sub-parts change
    useEffect(() => {
        if (hasSubParts && formData.sub_parts.length > 0) {
            setFormData(prev => ({ ...prev, marks: subPartsTotal }));
        }
    }, [subPartsTotal, hasSubParts]);

    const addSubPart = () => {
        const newPart: QuestionSubPart = {
            id: `part-${Date.now()}`,
            label: getPartLabel(formData.sub_parts.length),
            text: '',
            marks: 1,
        };
        setFormData({
            ...formData,
            sub_parts: [...formData.sub_parts, newPart],
        });
    };

    const updateSubPart = (index: number, field: keyof QuestionSubPart, value: string | number) => {
        const parts = [...formData.sub_parts];
        parts[index] = { ...parts[index], [field]: value };
        setFormData({ ...formData, sub_parts: parts });
    };

    const removeSubPart = (index: number) => {
        const parts = [...formData.sub_parts];
        parts.splice(index, 1);
        // Re-label remaining parts
        const relabeled = parts.map((p, i) => ({ ...p, label: getPartLabel(i) }));
        setFormData({ ...formData, sub_parts: relabeled });
    };

    const toggleSubParts = (enabled: boolean) => {
        setHasSubParts(enabled);
        if (enabled && formData.sub_parts.length === 0) {
            // Add initial sub-parts
            setFormData({
                ...formData,
                sub_parts: [
                    { id: `part-${Date.now()}-a`, label: 'a', text: '', marks: 1 },
                    { id: `part-${Date.now()}-b`, label: 'b', text: '', marks: 1 },
                ],
            });
        } else if (!enabled) {
            setFormData({ ...formData, sub_parts: [] });
        }
    };

    // Reset hasSubParts when form resets
    useEffect(() => {
        if (isOpen) {
            setHasSubParts(false);
        }
    }, [isOpen]);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch('/api/storage/upload', {
                method: 'POST',
                body: formData
            });

            if (!res.ok) throw new Error('Upload failed');

            const data = await res.json();
            if (data.success && data.url) {
                setFormData(prev => ({ ...prev, imagePath: data.url }));
            }
        } catch (err) {
            console.error(err);
            setError('Failed to upload image');
        } finally {
            setIsUploading(false);
        }
    };

    // Preview object derived from form data
    const previewQuestion: Question = useMemo(() => ({
        id: 'preview',
        text: formData.text || 'Question text will appear here...',
        marks: formData.marks,
        type: formData.type as any,
        difficulty: formData.difficulty,
        topic: formData.topic || 'Topic',
        options: formData.options,
        matchingPairs: formData.matching_pairs,
        subParts: formData.sub_parts,
        imagePath: formData.imagePath,
        imageCaption: formData.imageCaption,
        answerLines: formData.answerLines,
        // Defaults
        subtopic: formData.subtopic,
        term: formData.term,
        bloomsLevel: formData.blooms_level as any,
    }), [formData]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col font-sans" style={{ maxHeight: '90vh' }}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <Plus className="w-5 h-5 text-primary" />
                            Add New Question
                        </h2>
                        <p className="text-xs text-muted-foreground mt-1">
                            Fill in the details below. The preview on the right shows how it will appear on paper.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Main Content - Scrollable */}
                <div className="flex-1 min-h-0 overflow-y-auto" style={{ overflowY: 'auto' }}>
                    <div className="min-h-0 flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-gray-200 dark:divide-gray-700">

                        {/* LEFT: FORM */}
                        <div className="flex-1 p-6 space-y-6">

                            {/* Error */}
                            {error && (
                                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                    {error}
                                </div>
                            )}

                            {/* Question Text */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">
                                        Question Text <span className="text-red-500">*</span>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => setShowAdvanced(!showAdvanced)}
                                        className="text-xs flex items-center gap-1 text-primary hover:underline font-bold bg-primary/5 px-2 py-1 rounded-full transition-colors"
                                    >
                                        <Settings className="w-3 h-3" />
                                        {showAdvanced ? 'Hide Advanced Options' : 'Show Advanced Options'}
                                    </button>
                                </div>
                                <div className="min-h-[150px] border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary/20 transition-shadow">
                                    <RichTextEditor
                                        value={formData.text}
                                        onChange={(content) => setFormData({ ...formData, text: content })}
                                        placeholder="Type your question here..."
                                    />
                                </div>
                            </div>

                            {/* Marks & Type Row */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                <div className="col-span-1">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                        Marks
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={formData.marks}
                                        onChange={e => setFormData({ ...formData, marks: parseInt(e.target.value) || 1 })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg font-bold text-center"
                                    />
                                </div>
                                <div className="col-span-1 sm:col-span-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                        Type
                                    </label>
                                    <select
                                        value={formData.type}
                                        onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                                    >
                                        {QUESTION_TYPES.map((t) => (
                                            <option key={t} value={t}>{t}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="col-span-1">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                        Diff.
                                    </label>
                                    <select
                                        value={formData.difficulty}
                                        onChange={(e) => setFormData({ ...formData, difficulty: e.target.value as any })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                                    >
                                        {DIFFICULTY_LEVELS.map((d) => (
                                            <option key={d} value={d}>{d}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Advanced: Image Upload */}
                            {showAdvanced && (
                                <div className="animate-in fade-in slide-in-from-top-4 duration-300 space-y-6 border-l-2 border-primary/20 pl-4 py-2">

                                    {/* Image Section */}
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                                            Diagram / Image
                                        </label>
                                        <div className="flex items-start gap-4">
                                            {formData.imagePath ? (
                                                <div className="relative group">
                                                    <img
                                                        src={formData.imagePath}
                                                        alt="Preview"
                                                        className="h-24 rounded-lg border border-gray-200 object-contain bg-gray-50"
                                                    />
                                                    <button
                                                        onClick={() => setFormData({ ...formData, imagePath: '', imageCaption: '' })}
                                                        className="absolute -top-2 -right-2 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm scale-75 hover:scale-100"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 hover:border-primary cursor-pointer flex flex-col items-center justify-center text-gray-400 hover:text-primary transition-all bg-gray-50 relative">
                                                    {isUploading ? (
                                                        <Loader2 className="w-5 h-5 animate-spin" />
                                                    ) : (
                                                        <>
                                                            <ImageIcon className="w-6 h-6 mb-1" />
                                                            <span className="text-[10px]">Upload</span>
                                                        </>
                                                    )}
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={handleImageUpload}
                                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                                        disabled={isUploading}
                                                    />
                                                </div>
                                            )}

                                            {formData.imagePath && (
                                                <div className="flex-1">
                                                    <input
                                                        type="text"
                                                        value={formData.imageCaption || ''}
                                                        onChange={e => setFormData({ ...formData, imageCaption: e.target.value })}
                                                        placeholder="Image caption (e.g. Figure 1.1)"
                                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Sub-parts Section */}
                                    <div>
                                        <div className="flex items-center justify-between mb-4">
                                            <div>
                                                <label className="text-sm font-bold text-gray-700">Sub-parts</label>
                                                <p className="text-xs text-muted-foreground">Split question into (a), (b), (c)...</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => toggleSubParts(!hasSubParts)}
                                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${hasSubParts ? 'bg-primary' : 'bg-gray-300'}`}
                                            >
                                                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${hasSubParts ? 'translate-x-4.5' : 'translate-x-1'}`} />
                                            </button>
                                        </div>

                                        {hasSubParts && (
                                            <div className="space-y-3 bg-gray-50/50 p-3 rounded-xl border border-dashed border-gray-200">
                                                {formData.sub_parts.map((part, index) => (
                                                    <div key={part.id} className="flex gap-2 items-start">
                                                        <span className="w-6 h-8 flex items-center justify-center text-sm font-bold text-muted-foreground bg-white border rounded shrink-0">{part.label}</span>
                                                        <textarea
                                                            value={part.text}
                                                            onChange={(e) => updateSubPart(index, 'text', e.target.value)}
                                                            placeholder="Part text..."
                                                            rows={1}
                                                            className="flex-1 px-3 py-1.5 text-sm border rounded bg-white min-h-[32px] resize-y"
                                                        />
                                                        <input
                                                            type="number"
                                                            value={part.marks}
                                                            onChange={(e) => updateSubPart(index, 'marks', parseInt(e.target.value) || 1)}
                                                            className="w-14 px-1 py-1.5 text-sm border rounded text-center shrink-0"
                                                        />
                                                        {formData.sub_parts.length > 1 && (
                                                            <button onClick={() => removeSubPart(index)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded shrink-0">
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                                <button onClick={addSubPart} className="w-full py-2 border border-dashed border-gray-300 rounded text-xs font-bold text-gray-500 hover:text-primary hover:border-primary hover:bg-primary/5 transition-all">
                                                    + Add Part
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Answer Lines / Spacing */}
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">
                                            Answer Space (Lines)
                                        </label>
                                        <div className="flex items-center gap-4">
                                            <input
                                                type="range"
                                                min="0"
                                                max="15"
                                                value={formData.answerLines || 0}
                                                onChange={(e) => setFormData({ ...formData, answerLines: parseInt(e.target.value) })}
                                                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary"
                                            />
                                            <span className="w-8 text-center font-bold text-sm">{formData.answerLines}</span>
                                        </div>
                                        <p className="text-[10px] text-gray-500 mt-1">
                                            Adjust the number of blank lines rendered for the answer.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* MCQ Options */}
                            {formData.type === 'Multiple Choice' && (
                                <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                                    <label className="block text-xs font-bold text-blue-800 uppercase tracking-wider mb-3">
                                        Answer Options
                                    </label>
                                    <div className="grid grid-cols-1 gap-3">
                                        {formData.options.map((opt, idx) => (
                                            <div key={idx} className="relative group">
                                                <div className={`absolute left-0 top-0 bottom-0 w-8 flex items-center justify-center font-bold text-xs border-r ${idx === 0 ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'} rounded-l-lg`}>
                                                    {String.fromCharCode(65 + idx)}
                                                </div>
                                                <input
                                                    type="text"
                                                    value={opt}
                                                    onChange={(e) => updateOption(idx, e.target.value)}
                                                    placeholder={`Option ${String.fromCharCode(65 + idx)} ${idx === 0 ? '(Correct Answer)' : ''}`}
                                                    className={`w-full pl-10 pr-3 py-2 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 ${idx === 0 ? 'border-green-300 bg-green-50/30' : 'border-gray-200 bg-white'}`}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Matching Pairs */}
                            {formData.type === 'Matching' && (
                                <div className="space-y-3">
                                    <label className="block text-sm font-bold text-gray-700">Matching Pairs</label>
                                    {formData.matching_pairs.map((pair, idx) => (
                                        <div key={idx} className="flex gap-2 items-center">
                                            <input
                                                type="text"
                                                value={pair.left}
                                                onChange={(e) => updateMatchingPair(idx, 'left', e.target.value)}
                                                placeholder="Question / Term"
                                                className="flex-1 px-3 py-2 text-sm border rounded-lg"
                                            />
                                            <span className="text-gray-400">↔</span>
                                            <input
                                                type="text"
                                                value={pair.right}
                                                onChange={(e) => updateMatchingPair(idx, 'right', e.target.value)}
                                                placeholder="Answer / Definition"
                                                className="flex-1 px-3 py-2 text-sm border rounded-lg"
                                            />
                                            <button onClick={() => removeMatchingPair(idx)} className="p-2 text-red-500 hover:bg-red-50 rounded">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                    <button onClick={addMatchingPair} className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                                        <Plus className="w-3 h-3" /> Add Pair
                                    </button>
                                </div>
                            )}

                            {/* Classification Fields (Curriculum, Grade, etc.) */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                                {/* CBC Logic */}
                                {isCBC && levels.length > 0 && (
                                    <>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 mb-1">Level</label>
                                            <select
                                                value={selectedLevel}
                                                onChange={(e) => { setSelectedLevel(e.target.value); setSelectedBand(''); setFormData(p => ({ ...p, grade_id: '' })); }}
                                                className="w-full px-2 py-1.5 text-sm border rounded-lg bg-gray-50"
                                            >
                                                <option value="">All Levels</option>
                                                {levels.map(l => <option key={l} value={l as string}>{l}</option>)}
                                            </select>
                                        </div>
                                        {/* Band omitted for brevity, logic remains in state */}
                                    </>
                                )}
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Subject</label>
                                    <select
                                        value={formData.subject_id}
                                        onChange={(e) => setFormData({ ...formData, subject_id: e.target.value })}
                                        className="w-full px-2 py-1.5 text-sm border rounded-lg bg-gray-50"
                                    >
                                        <option value="">Select Subject...</option>
                                        {availableSubjects.map((s) => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="col-span-1 sm:col-span-2">
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Topic</label>
                                    <input
                                        type="text"
                                        value={formData.topic}
                                        onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                                        placeholder="e.g. Algebra, Solar System"
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                                    />
                                </div>
                            </div>

                        </div>

                        {/* RIGHT: LIVE PREVIEW */}
                        <div className="w-full lg:w-[45%] bg-gray-100 dark:bg-gray-900 p-6 lg:border-l border-gray-200 dark:border-gray-700 shadow-inner flex flex-col">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                    Paper Preview
                                </h3>
                                <div className="text-[10px] text-gray-400">
                                    A4 / Portrait
                                </div>
                            </div>

                            {/* Preview Container - Scaled to fit if needed, but scrolling is better */}
                            <div className="flex-1 flex justify-center items-start">
                                <div className="scale-[0.85] origin-top shadow-xl transition-all duration-300">
                                    <SingleQuestionPreview question={previewQuestion} />
                                </div>
                            </div>

                            <div className="mt-6 p-4 bg-yellow-50 border border-yellow-100 rounded-lg text-xs text-yellow-700">
                                <p className="font-bold mb-1">💡 Tip</p>
                                <p>Check the preview to ensure your question fits cleanly on the page. Use "Custom Spacing" to add more lines for written answers.</p>
                            </div>
                        </div>

                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-b-xl flex items-center justify-between shrink-0">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSaveAndAdd}
                        disabled={isSaving || isSaveAndAdd}
                        className="inline-flex items-center gap-2 px-4 py-2 border border-blue-200 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 disabled:opacity-50"
                    >
                        {isSaveAndAdd ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Plus className="w-4 h-4" />
                                Save & Add Another
                            </>
                        )}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || isSaveAndAdd}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                Save Question
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
