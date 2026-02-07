'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { X, Save, Loader2, Plus, Trash2, ChevronDown, ChevronUp, Image as ImageIcon } from 'lucide-react';
import RichTextEditor from '@/components/ui/RichTextEditor';
import { QuestionSubPart } from '@/types';

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
    imageCaption: ''
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
    const [error, setError] = useState<string | null>(null);

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

    const handleSave = async () => {
        if (!formData.text?.trim()) {
            setError('Question text is required');
            return;
        }
        if (!formData.topic?.trim()) {
            setError('Topic is required');
            return;
        }

        setIsSaving(true);
        setError(null);
        try {
            await onSave(formData);
            onClose();
        } catch (err) {
            setError('Failed to save question');
        } finally {
            setIsSaving(false);
        }
    };

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

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                        Add New Question
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Error */}
                {error && (
                    <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                        {error}
                    </div>
                )}

                <div className="p-6 space-y-6">
                    {/* Question Text */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Question Text <span className="text-red-500">*</span>
                        </label>
                        <div className="min-h-[200px]">
                            <RichTextEditor
                                value={formData.text}
                                onChange={(content) => setFormData({ ...formData, text: content })}
                                placeholder="Enter the question text..."
                            />
                        </div>
                    </div>

                    {/* Image Upload */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Question Image (Optional)
                        </label>
                        <div className="flex items-start gap-4">
                            {formData.imagePath ? (
                                <div className="relative group">
                                    <img
                                        src={formData.imagePath}
                                        alt="Preview"
                                        className="h-32 rounded-lg border border-gray-200 dark:border-gray-700 object-contain bg-gray-50 dark:bg-gray-900"
                                    />
                                    <button
                                        onClick={() => setFormData({ ...formData, imagePath: '', imageCaption: '' })}
                                        className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <div className="w-32 h-32 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center text-gray-400 hover:border-primary hover:text-primary transition-colors bg-gray-50 dark:bg-gray-800/50">
                                    {isUploading ? (
                                        <Loader2 className="w-6 h-6 animate-spin" />
                                    ) : (
                                        <>
                                            <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
                                            <span className="text-xs font-medium">Upload Image</span>
                                        </>
                                    )}
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleImageUpload}
                                        className="absolute inset-0 opacity-0 cursor-pointer w-32 h-32"
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
                                        placeholder="Add a caption (e.g., Figure 1.1)"
                                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Sub-parts Toggle */}
                    <div className="border border-gray-200 dark:border-gray-600 rounded-xl p-4 bg-gray-50 dark:bg-gray-700/30">
                        <div className="flex items-center justify-between">
                            <div>
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Question has multiple parts
                                </label>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    Enable to add parts (a, b, c, etc.) with individual marks
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => toggleSubParts(!hasSubParts)}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${hasSubParts ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
                                    }`}
                            >
                                <span
                                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${hasSubParts ? 'translate-x-6' : 'translate-x-1'
                                        }`}
                                />
                            </button>
                        </div>

                        {/* Sub-parts Editor */}
                        {hasSubParts && (
                            <div className="mt-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Question Parts ({formData.sub_parts.length})
                                    </span>
                                    <span className="text-xs font-bold text-primary">
                                        Total: {subPartsTotal} marks
                                    </span>
                                </div>

                                {formData.sub_parts.map((part, index) => (
                                    <div
                                        key={part.id}
                                        className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-3"
                                    >
                                        <div className="flex items-start gap-3">
                                            {/* Part Label */}
                                            <span className="shrink-0 w-8 h-8 bg-primary/10 text-primary rounded-full flex items-center justify-center text-sm font-bold">
                                                {part.label}
                                            </span>

                                            {/* Part Text */}
                                            <div className="flex-1 min-w-0">
                                                <textarea
                                                    value={part.text}
                                                    onChange={(e) => updateSubPart(index, 'text', e.target.value)}
                                                    placeholder={`Enter part (${part.label}) text...`}
                                                    rows={2}
                                                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                                                />
                                            </div>

                                            {/* Marks Input */}
                                            <div className="shrink-0 w-20">
                                                <label className="text-[10px] text-gray-500 dark:text-gray-400 font-medium block mb-1">
                                                    Marks
                                                </label>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    value={part.marks}
                                                    onChange={(e) => updateSubPart(index, 'marks', parseInt(e.target.value) || 1)}
                                                    className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-center"
                                                />
                                            </div>

                                            {/* Remove Button */}
                                            {formData.sub_parts.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => removeSubPart(index)}
                                                    className="shrink-0 p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors mt-1"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                {/* Add Part Button */}
                                <button
                                    type="button"
                                    onClick={addSubPart}
                                    className="w-full py-2.5 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2"
                                >
                                    <Plus className="w-4 h-4" />
                                    Add Part ({getPartLabel(formData.sub_parts.length)})
                                </button>
                            </div>
                        )}
                    </div>

                    {/* CBC Logic: Level/Band Selectors */}
                    {isCBC && levels.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Level
                                </label>
                                <select
                                    value={selectedLevel}
                                    onChange={(e) => {
                                        setSelectedLevel(e.target.value);
                                        setSelectedBand('');
                                        setFormData(prev => ({ ...prev, grade_id: '' }));
                                    }}
                                    className="w-full px-3 py-2 border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50/50 dark:bg-blue-900/20 text-gray-900 dark:text-white"
                                >
                                    <option value="">Select Level...</option>
                                    {levels.map(l => (
                                        <option key={l} value={l as string}>{l}</option>
                                    ))}
                                </select>
                            </div>
                            {levels.length > 0 && bands.length > 0 && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Band
                                    </label>
                                    <select
                                        value={selectedBand}
                                        onChange={(e) => {
                                            setSelectedBand(e.target.value);
                                            setFormData(prev => ({ ...prev, grade_id: '' }));
                                        }}
                                        className="w-full px-3 py-2 border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50/50 dark:bg-blue-900/20 text-gray-900 dark:text-white"
                                    >
                                        <option value="">Select Band...</option>
                                        {bands.map(b => (
                                            <option key={b} value={b as string}>{b?.replace('_', ' ')}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Curriculum, Grade, Subject */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {curriculums.length > 1 && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Curriculum
                                </label>
                                <select
                                    value={formData.curriculum_id}
                                    onChange={(e) => setFormData({ ...formData, curriculum_id: e.target.value, grade_id: '' })}
                                    className="w-full px-3 py-2 border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50/50 dark:bg-blue-900/20 text-gray-900 dark:text-white"
                                >
                                    <option value="">Select...</option>
                                    {curriculums.map((c) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Grade
                            </label>
                            <select
                                value={formData.grade_id}
                                onChange={(e) => setFormData({ ...formData, grade_id: e.target.value })}
                                disabled={!formData.curriculum_id}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                            >
                                <option value="">Select...</option>
                                {filteredGrades.map((g) => (
                                    <option key={g.id} value={g.id}>{g.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Subject
                            </label>
                            <select
                                value={formData.subject_id}
                                onChange={(e) => setFormData({ ...formData, subject_id: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            >
                                <option value="">Select...</option>
                                {availableSubjects.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.name} {s.code ? `(${s.code})` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Type and Difficulty */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Question Type
                            </label>
                            <select
                                value={formData.type}
                                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            >
                                {QUESTION_TYPES.map((t) => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Difficulty
                            </label>
                            <select
                                value={formData.difficulty}
                                onChange={(e) => setFormData({ ...formData, difficulty: e.target.value as any })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            >
                                {DIFFICULTY_LEVELS.map((d) => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* MCQ Options */}
                    {formData.type === 'Multiple Choice' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Options (first one is correct answer)
                            </label>
                            <div className="space-y-2">
                                {formData.options.map((opt, idx) => (
                                    <input
                                        key={idx}
                                        type="text"
                                        value={opt}
                                        onChange={(e) => updateOption(idx, e.target.value)}
                                        placeholder={`Option ${idx + 1}${idx === 0 ? ' (correct)' : ''}`}
                                        className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${idx === 0 ? 'border-green-300 dark:border-green-600' : 'border-gray-300 dark:border-gray-600'
                                            }`}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Matching Pairs */}
                    {formData.type === 'Matching' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Matching Pairs
                            </label>
                            <div className="space-y-2">
                                {formData.matching_pairs.map((pair, idx) => (
                                    <div key={idx} className="flex gap-2">
                                        <input
                                            type="text"
                                            value={pair.left}
                                            onChange={(e) => updateMatchingPair(idx, 'left', e.target.value)}
                                            placeholder="Left item"
                                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                        <span className="flex items-center text-gray-400">→</span>
                                        <input
                                            type="text"
                                            value={pair.right}
                                            onChange={(e) => updateMatchingPair(idx, 'right', e.target.value)}
                                            placeholder="Right item"
                                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                        {formData.matching_pairs.length > 1 && (
                                            <button
                                                onClick={() => removeMatchingPair(idx)}
                                                className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                                <button
                                    onClick={addMatchingPair}
                                    className="text-sm text-blue-600 hover:underline"
                                >
                                    + Add pair
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Topic and Subtopic */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Topic <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={formData.topic}
                                onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                placeholder="e.g., Algebra, Photosynthesis"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Subtopic
                            </label>
                            <input
                                type="text"
                                value={formData.subtopic}
                                onChange={(e) => setFormData({ ...formData, subtopic: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                placeholder="e.g., Linear Equations"
                            />
                        </div>
                    </div>

                    {/* Marks, Bloom's, Term */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Marks {hasSubParts && <span className="text-xs text-gray-400 font-normal">(auto-calculated)</span>}
                            </label>
                            <input
                                type="number"
                                min={1}
                                value={formData.marks}
                                onChange={(e) => setFormData({ ...formData, marks: parseInt(e.target.value) || 1 })}
                                disabled={hasSubParts}
                                className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${hasSubParts ? 'opacity-60 cursor-not-allowed' : ''}`}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Bloom's Level
                            </label>
                            <select
                                value={formData.blooms_level}
                                onChange={(e) => setFormData({ ...formData, blooms_level: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            >
                                {BLOOMS_LEVELS.map((b) => (
                                    <option key={b} value={b}>{b}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Term
                            </label>
                            <select
                                value={formData.term}
                                onChange={(e) => setFormData({ ...formData, term: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            >
                                <option value="">Select...</option>
                                {TERMS.map((t) => (
                                    <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Marking Scheme */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Marking Scheme / Answer
                        </label>
                        <textarea
                            value={formData.marking_scheme}
                            onChange={(e) => setFormData({ ...formData, marking_scheme: e.target.value })}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            placeholder="Enter the expected answer or marking guide..."
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 sticky bottom-0 bg-white dark:bg-gray-800">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
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
