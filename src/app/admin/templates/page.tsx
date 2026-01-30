'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft,
    Plus,
    Edit2,
    Trash2,
    Search,
    Loader2,
    Save,
    X,
    FileText,
    ChevronDown,
    ChevronUp,
    Copy,
    Play
} from 'lucide-react';

interface Subject {
    id: string;
    name: string;
}

interface Grade {
    id: string;
    name: string;
    level?: string;
}

interface SectionConfig {
    section_label: string;
    name: string;
    section_type: string;
    question_count: number;
    marks_per_question: number;
    topics?: number[];
    instructions?: string;
}

interface Template {
    id: string;
    name: string;
    description?: string;
    subject_id?: string;
    grade_id?: string;
    total_marks: number;
    time_limit?: string;
    sections: SectionConfig[];
    shuffle_within_sections: boolean;
    shuffle_sections: boolean;
    is_default: boolean;
    subject_name?: string;
    grade_name?: string;
}

const SECTION_TYPES = [
    { value: 'map_analysis', label: 'Map Analysis' },
    { value: 'spatial_awareness', label: 'Spatial Awareness' },
    { value: 'visual_identification', label: 'Visual Identification' },
    { value: 'conceptual_knowledge', label: 'Conceptual Knowledge' },
    { value: 'skills_drawing', label: 'Skills & Drawing' },
    { value: 'true_false', label: 'True/False' },
    { value: 'matching', label: 'Matching' },
    { value: 'multiple_choice', label: 'Multiple Choice' },
    { value: 'fill_blanks', label: 'Fill in the Blanks' },
    { value: 'structured', label: 'Structured' },
    { value: 'essay', label: 'Essay' },
    { value: 'practical', label: 'Practical' },
    { value: 'calculation', label: 'Calculation' },
    { value: 'word_puzzle', label: 'Word Puzzle' },
    { value: 'diagram_labeling', label: 'Diagram Labeling' },
    { value: 'comprehension', label: 'Comprehension' },
    { value: 'general', label: 'General' }
];

export default function TemplatesPage() {
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [grades, setGrades] = useState<Grade[]>([]);
    const [templates, setTemplates] = useState<Template[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);

    // Paper generation state
    const [isGenerating, setIsGenerating] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [generatedPaper, setGeneratedPaper] = useState<any>(null);
    const [generationWarnings, setGenerationWarnings] = useState<string[]>([]);

    // Form state
    const [showForm, setShowForm] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
    const [formData, setFormData] = useState<{
        name: string;
        description: string;
        subject_id: string;
        grade_id: string;
        total_marks: number;
        time_limit: string;
        shuffle_within_sections: boolean;
        shuffle_sections: boolean;
        is_default: boolean;
        sections: SectionConfig[];
    }>({
        name: '',
        description: '',
        subject_id: '',
        grade_id: '',
        total_marks: 40,
        time_limit: '1 hour',
        shuffle_within_sections: true,
        shuffle_sections: false,
        is_default: false,
        sections: []
    });

    // Show notification
    const showNotification = (type: 'success' | 'error', message: string) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 4000);
    };

    // Fetch data
    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [subjRes, gradeRes, templatesRes] = await Promise.all([
                fetch('/api/admin/lookup?type=subjects'),
                fetch('/api/admin/lookup?type=grades'),
                fetch('/api/admin/templates')
            ]);

            if (subjRes.ok) {
                const data = await subjRes.json();
                setSubjects(data.subjects || []);
            }
            if (gradeRes.ok) {
                const data = await gradeRes.json();
                setGrades(data.grades || []);
            }
            if (templatesRes.ok) {
                const data = await templatesRes.json();
                setTemplates(data.templates || []);
            }
        } catch (error) {
            console.error('Error fetching data:', error);
            showNotification('error', 'Failed to load data');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Filter templates
    const filteredTemplates = templates.filter(t =>
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Add new section to form
    const addSection = () => {
        const nextLabel = String.fromCharCode(65 + formData.sections.length); // A, B, C...
        setFormData({
            ...formData,
            sections: [...formData.sections, {
                section_label: nextLabel,
                name: '',
                section_type: 'general',
                question_count: 5,
                marks_per_question: 1,
                instructions: ''
            }]
        });
    };

    // Remove section
    const removeSection = (index: number) => {
        const newSections = formData.sections.filter((_, i) => i !== index);
        // Re-label sections
        newSections.forEach((s, i) => {
            s.section_label = String.fromCharCode(65 + i);
        });
        setFormData({ ...formData, sections: newSections });
    };

    // Update section
    const updateSection = (index: number, field: keyof SectionConfig, value: any) => {
        const newSections = [...formData.sections];
        (newSections[index] as any)[field] = value;
        setFormData({ ...formData, sections: newSections });
    };

    // Open form for new template
    const handleNewTemplate = () => {
        setEditingTemplate(null);
        setFormData({
            name: '',
            description: '',
            subject_id: '',
            grade_id: '',
            total_marks: 40,
            time_limit: '1 hour',
            shuffle_within_sections: true,
            shuffle_sections: false,
            is_default: false,
            sections: []
        });
        setShowForm(true);
    };

    // Open form for editing
    const handleEdit = (template: Template) => {
        setEditingTemplate(template);
        setFormData({
            name: template.name,
            description: template.description || '',
            subject_id: template.subject_id || '',
            grade_id: template.grade_id || '',
            total_marks: template.total_marks,
            time_limit: template.time_limit || '1 hour',
            shuffle_within_sections: template.shuffle_within_sections,
            shuffle_sections: template.shuffle_sections,
            is_default: template.is_default,
            sections: template.sections || []
        });
        setShowForm(true);
    };

    // Submit form
    const handleSubmit = async () => {
        if (!formData.name.trim()) {
            showNotification('error', 'Template name is required');
            return;
        }
        if (formData.sections.length === 0) {
            showNotification('error', 'At least one section is required');
            return;
        }

        setIsSaving(true);
        try {
            const method = editingTemplate ? 'PUT' : 'POST';
            const body = editingTemplate
                ? { id: editingTemplate.id, ...formData }
                : formData;

            const res = await fetch('/api/admin/templates', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                showNotification('success', editingTemplate ? 'Template updated' : 'Template created');
                setShowForm(false);
                fetchData();
            } else {
                const data = await res.json();
                showNotification('error', data.error || 'Failed to save template');
            }
        } catch (error) {
            showNotification('error', 'Failed to save template');
        } finally {
            setIsSaving(false);
        }
    };

    // Delete template
    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this template?')) return;

        try {
            const res = await fetch(`/api/admin/templates?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                showNotification('success', 'Template deleted');
                fetchData();
            } else {
                showNotification('error', 'Failed to delete template');
            }
        } catch (error) {
            showNotification('error', 'Failed to delete template');
        }
    };

    // Calculate total marks from sections
    const calculateTotalMarks = () => {
        return formData.sections.reduce((sum, s) => sum + (s.question_count * s.marks_per_question), 0);
    };

    // Generate paper from template
    const handleGeneratePaper = async (templateId: string) => {
        setIsGenerating(true);
        try {
            const res = await fetch('/api/paper/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ templateId })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setGeneratedPaper(data.paper);
                setGenerationWarnings(data.warnings || []);
                setShowPreview(true);
                if (data.isComplete) {
                    showNotification('success', 'Paper generated successfully!');
                } else {
                    showNotification('error', 'Paper incomplete - see warnings');
                }
            } else {
                showNotification('error', data.error || 'Failed to generate paper');
            }
        } catch (error) {
            console.error('Generation error:', error);
            showNotification('error', 'Failed to generate paper');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/admin" className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Paper Templates</h1>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Exam paper structures</p>
                        </div>
                    </div>
                    <button
                        onClick={handleNewTemplate}
                        className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        New Template
                    </button>
                </div>
            </header>

            {/* Notification */}
            <AnimatePresence>
                {notification && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className={`fixed top-20 right-4 z-50 px-4 py-3 rounded-lg shadow-lg ${notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'
                            } text-white font-medium`}
                    >
                        {notification.message}
                    </motion.div>
                )}
            </AnimatePresence>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Search */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6">
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search templates..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                    </div>
                </div>

                {/* Templates List */}
                <div className="space-y-4">
                    {isLoading ? (
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 flex items-center justify-center">
                            <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
                        </div>
                    ) : filteredTemplates.length === 0 ? (
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
                            <FileText className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
                            <p className="text-gray-500 dark:text-gray-400">No templates found</p>
                            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Create your first paper template</p>
                        </div>
                    ) : (
                        filteredTemplates.map((template) => (
                            <div
                                key={template.id}
                                className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
                            >
                                <div
                                    className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                                    onClick={() => setExpandedTemplate(expandedTemplate === template.id ? null : template.id)}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                                                <FileText className="w-6 h-6 text-violet-600" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-semibold text-gray-900 dark:text-white">{template.name}</h3>
                                                    {template.is_default && (
                                                        <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium rounded">
                                                            Default
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
                                                    <span>{template.sections?.length || 0} sections</span>
                                                    <span>•</span>
                                                    <span>{template.total_marks} marks</span>
                                                    <span>•</span>
                                                    <span>{template.time_limit}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleGeneratePaper(template.id); }}
                                                disabled={isGenerating}
                                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg text-gray-500 hover:text-green-600 disabled:opacity-50"
                                                title="Generate Paper"
                                            >
                                                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleEdit(template); }}
                                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg text-gray-500 hover:text-blue-600"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDelete(template.id); }}
                                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg text-gray-500 hover:text-red-600"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                            {expandedTemplate === template.id ? (
                                                <ChevronUp className="w-5 h-5 text-gray-400" />
                                            ) : (
                                                <ChevronDown className="w-5 h-5 text-gray-400" />
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded sections */}
                                <AnimatePresence>
                                    {expandedTemplate === template.id && (
                                        <motion.div
                                            initial={{ height: 0 }}
                                            animate={{ height: 'auto' }}
                                            exit={{ height: 0 }}
                                            className="overflow-hidden border-t border-gray-200 dark:border-gray-700"
                                        >
                                            <div className="p-4 bg-gray-50 dark:bg-gray-800/50">
                                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Sections</h4>
                                                <div className="space-y-2">
                                                    {template.sections?.map((section, idx) => (
                                                        <div key={idx} className="flex items-center justify-between p-3 bg-white dark:bg-gray-700 rounded-lg">
                                                            <div className="flex items-center gap-3">
                                                                <span className="w-8 h-8 flex items-center justify-center bg-violet-100 dark:bg-violet-900/30 text-violet-600 font-bold rounded">
                                                                    {section.section_label}
                                                                </span>
                                                                <div>
                                                                    <p className="font-medium text-gray-900 dark:text-white">{section.name || 'Untitled Section'}</p>
                                                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                                                        {SECTION_TYPES.find(t => t.value === section.section_type)?.label || section.section_type}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="text-right text-sm">
                                                                <p className="text-gray-900 dark:text-white font-medium">
                                                                    {section.question_count} Q × {section.marks_per_question} marks
                                                                </p>
                                                                <p className="text-gray-500 dark:text-gray-400">
                                                                    = {section.question_count * section.marks_per_question} marks
                                                                </p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        ))
                    )}
                </div>
            </main>

            {/* Add/Edit Modal */}
            <AnimatePresence>
                {showForm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto"
                        onClick={() => setShowForm(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-2xl w-full my-8"
                        >
                            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                        {editingTemplate ? 'Edit Template' : 'New Paper Template'}
                                    </h2>
                                    <button
                                        onClick={() => setShowForm(false)}
                                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                    >
                                        <X className="w-5 h-5 text-gray-500" />
                                    </button>
                                </div>
                            </div>

                            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-6">
                                {/* Basic Info */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="sm:col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Template Name <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="e.g., Grade 4 Social Studies Paper"
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject</label>
                                        <select
                                            value={formData.subject_id}
                                            onChange={(e) => setFormData({ ...formData, subject_id: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        >
                                            <option value="">All Subjects</option>
                                            {subjects.map(s => (
                                                <option key={s.id} value={s.id}>{s.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Grade</label>
                                        <select
                                            value={formData.grade_id}
                                            onChange={(e) => setFormData({ ...formData, grade_id: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        >
                                            <option value="">All Grades</option>
                                            {grades.map(g => (
                                                <option key={g.id} value={g.id}>{g.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Time Limit</label>
                                        <input
                                            type="text"
                                            value={formData.time_limit}
                                            onChange={(e) => setFormData({ ...formData, time_limit: e.target.value })}
                                            placeholder="e.g., 1 hour"
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={formData.shuffle_within_sections}
                                                onChange={(e) => setFormData({ ...formData, shuffle_within_sections: e.target.checked })}
                                                className="rounded"
                                            />
                                            <span className="text-sm text-gray-700 dark:text-gray-300">Shuffle questions</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={formData.is_default}
                                                onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                                                className="rounded"
                                            />
                                            <span className="text-sm text-gray-700 dark:text-gray-300">Default</span>
                                        </label>
                                    </div>
                                </div>

                                {/* Sections */}
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            Sections <span className="text-red-500">*</span>
                                        </label>
                                        <button
                                            type="button"
                                            onClick={addSection}
                                            className="text-sm text-violet-600 hover:text-violet-700 font-medium"
                                        >
                                            + Add Section
                                        </button>
                                    </div>

                                    <div className="space-y-3">
                                        {formData.sections.map((section, idx) => (
                                            <div key={idx} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                                <div className="flex items-center justify-between mb-3">
                                                    <span className="flex items-center gap-2">
                                                        <span className="w-8 h-8 flex items-center justify-center bg-violet-600 text-white font-bold rounded">
                                                            {section.section_label}
                                                        </span>
                                                        <span className="font-medium text-gray-900 dark:text-white">Section {section.section_label}</span>
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeSection(idx)}
                                                        className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                    <div className="col-span-2">
                                                        <input
                                                            type="text"
                                                            value={section.name}
                                                            onChange={(e) => updateSection(idx, 'name', e.target.value)}
                                                            placeholder="Section name"
                                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                        />
                                                    </div>
                                                    <div className="col-span-2">
                                                        <select
                                                            value={section.section_type}
                                                            onChange={(e) => updateSection(idx, 'section_type', e.target.value)}
                                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                        >
                                                            {SECTION_TYPES.map(t => (
                                                                <option key={t.value} value={t.value}>{t.label}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs text-gray-500 mb-1">Questions</label>
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            value={section.question_count}
                                                            onChange={(e) => updateSection(idx, 'question_count', parseInt(e.target.value) || 1)}
                                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs text-gray-500 mb-1">Marks each</label>
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            value={section.marks_per_question}
                                                            onChange={(e) => updateSection(idx, 'marks_per_question', parseInt(e.target.value) || 1)}
                                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                        />
                                                    </div>
                                                    <div className="col-span-2 text-right text-sm text-gray-500">
                                                        = {section.question_count * section.marks_per_question} marks
                                                    </div>
                                                </div>
                                            </div>
                                        ))}

                                        {formData.sections.length === 0 && (
                                            <div className="text-center py-8 text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                                                <p>No sections added yet</p>
                                                <button
                                                    type="button"
                                                    onClick={addSection}
                                                    className="mt-2 text-violet-600 font-medium"
                                                >
                                                    Add your first section
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Total marks summary */}
                                {formData.sections.length > 0 && (
                                    <div className="bg-violet-50 dark:bg-violet-900/20 rounded-lg p-4 flex items-center justify-between">
                                        <span className="font-medium text-violet-900 dark:text-violet-200">Total Marks</span>
                                        <span className="text-2xl font-bold text-violet-600">{calculateTotalMarks()}</span>
                                    </div>
                                )}
                            </div>

                            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                                <button
                                    onClick={() => setShowForm(false)}
                                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    disabled={isSaving}
                                    className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                                >
                                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    {editingTemplate ? 'Update' : 'Create'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Generated Paper Preview Modal */}
            <AnimatePresence>
                {showPreview && generatedPaper && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto"
                        onClick={() => setShowPreview(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-4xl w-full my-8"
                        >
                            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                            Generated Paper Preview
                                        </h2>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                            {generatedPaper.templateName} • {generatedPaper.subjectName || 'All Subjects'} • {generatedPaper.gradeName || 'All Grades'}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setShowPreview(false)}
                                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                    >
                                        <X className="w-5 h-5 text-gray-500" />
                                    </button>
                                </div>
                            </div>

                            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-6">
                                {/* Warnings */}
                                {generationWarnings.length > 0 && (
                                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                                        <h4 className="font-semibold text-amber-800 dark:text-amber-300 mb-2">⚠️ Warnings</h4>
                                        <ul className="list-disc list-inside text-sm text-amber-700 dark:text-amber-400 space-y-1">
                                            {generationWarnings.map((w, i) => (
                                                <li key={i}>{w}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Summary */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-center">
                                        <p className="text-2xl font-bold text-violet-600">{generatedPaper.sections?.length || 0}</p>
                                        <p className="text-xs text-gray-500">Sections</p>
                                    </div>
                                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-center">
                                        <p className="text-2xl font-bold text-blue-600">
                                            {generatedPaper.sections?.reduce((sum: number, s: any) => sum + s.questions.length, 0) || 0}
                                        </p>
                                        <p className="text-xs text-gray-500">Questions</p>
                                    </div>
                                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-center">
                                        <p className="text-2xl font-bold text-green-600">{generatedPaper.achievedTotalMarks}</p>
                                        <p className="text-xs text-gray-500">Total Marks</p>
                                    </div>
                                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-center">
                                        <p className="text-2xl font-bold text-gray-600">{generatedPaper.timeLimit}</p>
                                        <p className="text-xs text-gray-500">Duration</p>
                                    </div>
                                </div>

                                {/* Sections */}
                                {generatedPaper.sections?.map((section: any, idx: number) => (
                                    <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                                        <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <span className="w-8 h-8 flex items-center justify-center bg-violet-600 text-white font-bold rounded">
                                                    {section.label}
                                                </span>
                                                <div>
                                                    <p className="font-semibold text-gray-900 dark:text-white">{section.name}</p>
                                                    <p className="text-xs text-gray-500">
                                                        {section.actualCount}/{section.requiredCount} questions • {section.totalMarks} marks
                                                    </p>
                                                </div>
                                            </div>
                                            {section.actualCount < section.requiredCount && (
                                                <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-1 rounded">
                                                    Incomplete
                                                </span>
                                            )}
                                        </div>
                                        <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                            {section.questions.map((q: any, qIdx: number) => (
                                                <div key={q.id} className="px-4 py-3 flex gap-3">
                                                    <span className="text-sm font-medium text-gray-400 w-6">{qIdx + 1}.</span>
                                                    <div className="flex-1">
                                                        <p className="text-sm text-gray-900 dark:text-white" dangerouslySetInnerHTML={{ __html: q.text.substring(0, 200) + (q.text.length > 200 ? '...' : '') }} />
                                                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                                                            <span className="bg-gray-100 dark:bg-gray-600 px-2 py-0.5 rounded">{q.type}</span>
                                                            <span>{q.marks} mark{q.marks !== 1 ? 's' : ''}</span>
                                                            {q.topic && <span>• {q.topic}</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                            {section.questions.length === 0 && (
                                                <div className="px-4 py-6 text-center text-gray-400">
                                                    No questions available for this section
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-center gap-4">
                                <div className="text-sm text-gray-500 w-full sm:w-auto text-center sm:text-left">
                                    {generatedPaper.achievedTotalMarks} / {generatedPaper.targetTotalMarks} marks
                                </div>
                                <div className="flex gap-3 w-full sm:w-auto justify-center sm:justify-end">
                                    <button
                                        onClick={() => setShowPreview(false)}
                                        className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium"
                                    >
                                        Close
                                    </button>
                                    <button
                                        onClick={() => {
                                            // TODO: Navigate to exam builder with this paper
                                            showNotification('success', 'Paper ready for export!');
                                        }}
                                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium flex items-center gap-2"
                                    >
                                        <FileText className="w-4 h-4" />
                                        Use This Paper
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
