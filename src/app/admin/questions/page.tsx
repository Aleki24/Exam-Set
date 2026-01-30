'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Plus,
    Search,
    Filter,
    Trash2,
    Edit2,
    ChevronLeft,
    ChevronRight,
    X,
    Save,
    Loader2,
    AlertCircle,
    CheckCircle,
    Upload,
    CheckSquare,
    Square,
} from 'lucide-react';
import RichTextEditor from '@/components/ui/RichTextEditor';
import { findBestTopic, Topic as MatcherTopic } from '@/utils/topicMatcher';

// Types
interface Question {
    id: string;
    text: string;
    marks: number;
    difficulty: 'Easy' | 'Medium' | 'Difficult';
    topic: string;
    subtopic?: string;
    type: string;
    options?: string[];
    matching_pairs?: { left: string; right: string }[];
    unit?: string;
    marking_scheme?: string;
    blooms_level?: string;
    curriculum_id?: string;
    grade_id?: string;
    subject_id?: string;
    curriculum_name?: string;
    grade_name?: string;
    subject_name?: string;
    term?: string;
    is_ai_generated?: boolean;

    created_at?: string;
    answerLines?: number;
}

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

interface Topic {
    id: string;
    subject_id: string;
    topic_number: number;
    name: string;
    description?: string;
}

interface QuestionTemplate {
    id: string;
    name: string;
    description?: string;
    type: string;
    marks: number;
    difficulty: string;
    blooms_level: string;
    subject_id?: string;
    grade_id?: string;
    topic?: string;
    is_system: boolean;
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

// CBC Level display names - Static for instant loading
const CBC_LEVELS = ['primary', 'junior', 'senior'] as const;
const LEVEL_LABELS: Record<string, string> = {
    'primary': 'Primary',
    'junior': 'JSS',
    'senior': 'SSS',
};

export default function AdminQuestionsPage() {
    // Data states
    const [questions, setQuestions] = useState<Question[]>([]);
    const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
    const [grades, setGrades] = useState<Grade[]>([]);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [topics, setTopics] = useState<Topic[]>([]);
    const [questionTemplates, setQuestionTemplates] = useState<QuestionTemplate[]>([]);

    // UI states
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
    const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Bulk import states
    const [showBulkImport, setShowBulkImport] = useState(false);
    const [bulkText, setBulkText] = useState('');
    const [isBulkImporting, setIsBulkImporting] = useState(false);
    const [bulkSubjectId, setBulkSubjectId] = useState('');
    const [bulkGradeId, setBulkGradeId] = useState('');
    const [bulkTopics, setBulkTopics] = useState<Topic[]>([]);
    const [parsedQuestions, setParsedQuestions] = useState<{ text: string; marks: number; topic: string; topicConfidence: number }[]>([]);
    const [showPreview, setShowPreview] = useState(false);

    // Batch selection states
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [showBatchEdit, setShowBatchEdit] = useState(false);
    const [batchData, setBatchData] = useState({
        subject_id: '',
        grade_id: '',
        topic: '',
        difficulty: '',
    });

    // Keyboard navigation state
    const [focusedIndex, setFocusedIndex] = useState<number>(-1);
    const [showShortcuts, setShowShortcuts] = useState(false);

    // Filter states
    const [filters, setFilters] = useState({
        curriculum_id: '',
        grade_id: '',
        subject_id: '',
        topic_id: '',
        difficulty: '',
        type: '',
        search: '',
    });
    const [showFilters, setShowFilters] = useState(false);

    // CBC specific filter states
    const [filterLevel, setFilterLevel] = useState('');
    const [filterBand, setFilterBand] = useState('');
    const [availableSubjects, setAvailableSubjects] = useState<Subject[]>([]);
    const [formTopics, setFormTopics] = useState<Topic[]>([]);

    // Load initial subjects
    useEffect(() => {
        setAvailableSubjects(subjects);
    }, [subjects]);

    // Pagination
    const [page, setPage] = useState(0);
    const [totalCount, setTotalCount] = useState(0);
    const limit = 20;

    // Form state
    const [formData, setFormData] = useState<Partial<Question>>({
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
        answerLines: 0,
    });

    // Fetch topics when form subject changes
    useEffect(() => {
        if (formData.subject_id) {
            fetch(`/api/admin/lookup?type=topics&subject_id=${formData.subject_id}`)
                .then(res => res.json())
                .then(data => setFormTopics(data.topics || []))
                .catch(err => console.error('Error fetching form topics:', err));
        } else {
            setFormTopics([]);
        }
    }, [formData.subject_id]);

    // Fetch topics for bulk import when subject changes
    useEffect(() => {
        if (bulkSubjectId) {
            fetch(`/api/admin/lookup?type=topics&subject_id=${bulkSubjectId}`)
                .then(res => res.json())
                .then(data => setBulkTopics(data.topics || []))
                .catch(err => console.error('Error fetching bulk topics:', err));
        } else {
            setBulkTopics([]);
        }
    }, [bulkSubjectId]);

    // Show notification
    const showNotification = (type: 'success' | 'error', message: string) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 4000);
    };

    // Fetch lookup data
    const fetchLookupData = useCallback(async () => {
        try {
            // Fetch everything in parallel
            const [currRes, subjRes, gradesRes, templatesRes] = await Promise.all([
                fetch('/api/admin/lookup?type=curriculums'),
                fetch('/api/admin/lookup?type=subjects'),
                fetch('/api/admin/lookup?type=grades'), // Fetch all grades initially
                fetch('/api/admin/question-templates'), // Fetch question templates
            ]);

            if (currRes.ok) {
                const data = await currRes.json();
                setCurriculums(data.curriculums || []);
            }

            if (subjRes.ok) {
                const data = await subjRes.json();
                setSubjects(data.subjects || []);
            }

            if (gradesRes.ok) {
                const data = await gradesRes.json();
                setGrades(data.grades || []);
            }

            if (templatesRes.ok) {
                const data = await templatesRes.json();
                setQuestionTemplates(data.templates || []);
            }
        } catch (error) {
            console.error('Error fetching lookup data:', error);
        }
    }, []);

    // Grades are loaded once in fetchLookupData - no need to refetch

    // Fetch topics when subject changes
    useEffect(() => {
        if (filters.subject_id) {
            fetch(`/api/admin/lookup?type=topics&subject_id=${filters.subject_id}`)
                .then(res => res.json())
                .then(data => setTopics(data.topics || []))
                .catch(err => console.error('Error fetching topics:', err));
        } else {
            setTopics([]);
        }
        // Reset topic filter when subject changes
        setFilters(prev => ({ ...prev, topic_id: '' }));
    }, [filters.subject_id]);

    // Fetch questions
    const fetchQuestions = useCallback(async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('limit', limit.toString());
            params.set('offset', (page * limit).toString());

            if (filters.curriculum_id) params.set('curriculum_id', filters.curriculum_id);
            if (filters.grade_id) params.set('grade_id', filters.grade_id);
            if (filters.subject_id) params.set('subject_id', filters.subject_id);
            if (filters.topic_id) params.set('topic_id', filters.topic_id);
            if (filters.difficulty) params.set('difficulty', filters.difficulty);
            if (filters.type) params.set('type', filters.type);
            if (filters.search) params.set('search', filters.search);

            const res = await fetch(`/api/questions?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setQuestions(data.questions || []);
                setTotalCount(data.count || 0);
            } else {
                showNotification('error', 'Failed to fetch questions');
            }
        } catch (error) {
            console.error('Error fetching questions:', error);
            showNotification('error', 'Error loading questions');
        } finally {
            setIsLoading(false);
        }
    }, [page, filters]);

    // Debounce timer ref for filter changes
    const debounceTimer = useRef<NodeJS.Timeout | null>(null);

    // Initial load
    useEffect(() => {
        fetchLookupData();
    }, [fetchLookupData]);

    // Debounced fetch when filters change (300ms delay to batch rapid changes)
    useEffect(() => {
        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
        }
        debounceTimer.current = setTimeout(() => {
            fetchQuestions();
        }, 300);

        return () => {
            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current);
            }
        };
    }, [fetchQuestions]);

    // Keyboard shortcuts handler
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't trigger shortcuts when typing in inputs
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
                // Only allow Escape and Ctrl+S in form fields
                if (e.key === 'Escape') {
                    setShowForm(false);
                    setShowShortcuts(false);
                    setShowBulkImport(false);
                    return;
                }
                if ((e.ctrlKey || e.metaKey) && e.key === 's' && showForm) {
                    e.preventDefault();
                    // Trigger form submit
                    const form = document.querySelector('form');
                    if (form) form.requestSubmit();
                    return;
                }
                return;
            }

            // Global shortcuts
            switch (e.key) {
                case 'n':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        handleNewQuestion();
                    }
                    break;
                case 's':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        if (showForm) {
                            const form = document.querySelector('form');
                            if (form) form.requestSubmit();
                        }
                    }
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    setFocusedIndex(prev => Math.min(prev + 1, questions.length - 1));
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    setFocusedIndex(prev => Math.max(prev - 1, 0));
                    break;
                case 'e':
                case 'Enter':
                    if (focusedIndex >= 0 && focusedIndex < questions.length && !showForm) {
                        e.preventDefault();
                        handleEditQuestion(questions[focusedIndex]);
                    }
                    break;
                case 'Escape':
                    setShowForm(false);
                    setShowShortcuts(false);
                    setShowBulkImport(false);
                    setFocusedIndex(-1);
                    break;
                case '?':
                    if (!showForm) {
                        e.preventDefault();
                        setShowShortcuts(prev => !prev);
                    }
                    break;
                case ' ':
                    // Space to toggle selection
                    if (focusedIndex >= 0 && focusedIndex < questions.length && !showForm) {
                        e.preventDefault();
                        const q = questions[focusedIndex];
                        toggleSelection(q.id);
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [questions, focusedIndex, showForm]);

    // Use static CBC levels for instant dropdown loading
    const levels = CBC_LEVELS;
    const bands = useMemo(() => Array.from(new Set(grades.filter(g => g.level === filterLevel).map(g => g.band).filter(Boolean))), [grades, filterLevel]);

    const filteredGrades = useMemo(() => {
        if (!grades.length) return [];
        return grades.filter(g => {
            if (filterLevel && g.level !== filterLevel) return false;
            if (filterBand && g.band !== filterBand) return false;
            return true;
        });
    }, [grades, filterLevel, filterBand]);

    // Auto-select CBC curriculum
    useEffect(() => {
        if (curriculums.length > 0 && !filters.curriculum_id) {
            const cbc = curriculums.find(c => c.name === 'CBC');
            if (cbc) {
                setFilters(prev => ({ ...prev, curriculum_id: cbc.id }));
            } else {
                setFilters(prev => ({ ...prev, curriculum_id: curriculums[0].id }));
            }
        }
    }, [curriculums, filters.curriculum_id]);

    // Check if CBC is selected
    const isCBC = useMemo(() => {
        const curr = curriculums.find(c => c.id === filters.curriculum_id);
        return curr?.name === 'CBC' || (curriculums.length === 1 && curriculums[0].name === 'CBC');
    }, [filters.curriculum_id, curriculums]);

    // Grades are loaded once - no need to refetch on filter change

    // Subjects are already synced via useEffect above - no extra filtering needed

    // No need to refetch grades on form curriculum change - already loaded

    // Reset form
    const resetForm = () => {
        setFormData({
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
        });
        setEditingQuestion(null);
    };

    // Open form for new question
    const handleNewQuestion = () => {
        resetForm();
        setShowForm(true);
    };

    // Open form for editing
    const handleEditQuestion = (question: Question) => {
        setEditingQuestion(question);
        setFormData({
            text: question.text,
            marks: question.marks,
            difficulty: question.difficulty,
            topic: question.topic,
            subtopic: question.subtopic || '',
            type: question.type,
            options: question.options?.length ? question.options : ['', '', '', ''],
            matching_pairs: question.matching_pairs?.length ? question.matching_pairs : [{ left: '', right: '' }],
            unit: question.unit || '',
            marking_scheme: question.marking_scheme || '',
            blooms_level: question.blooms_level || 'Knowledge',
            curriculum_id: question.curriculum_id || '',
            grade_id: question.grade_id || '',
            subject_id: question.subject_id || '',

            term: question.term || '',
            answerLines: question.answerLines || 0,
        });
        setShowForm(true);
    };

    // Save question
    const handleSaveQuestion = async () => {
        if (!formData.text?.trim()) {
            showNotification('error', 'Question text is required');
            return;
        }
        if (!formData.topic?.trim()) {
            showNotification('error', 'Topic is required');
            return;
        }

        setIsSaving(true);
        try {
            const payload = {
                ...formData,
                options: formData.type === 'Multiple Choice' ? formData.options?.filter(o => o.trim()) : [],
                matching_pairs: formData.type === 'Matching' ? formData.matching_pairs?.filter(p => p.left.trim() && p.right.trim()) : [],
            };

            let res;
            if (editingQuestion) {
                res = await fetch(`/api/questions/${editingQuestion.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            } else {
                res = await fetch('/api/questions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            }

            if (res.ok) {
                showNotification('success', editingQuestion ? 'Question updated!' : 'Question created!');
                setShowForm(false);
                resetForm();
                fetchQuestions();
            } else {
                const err = await res.json();
                showNotification('error', err.error || 'Failed to save question');
            }
        } catch (error) {
            console.error('Error saving question:', error);
            showNotification('error', 'Error saving question');
        } finally {
            setIsSaving(false);
        }
    };

    // Delete question
    const handleDeleteQuestion = async (id: string) => {
        if (!confirm('Are you sure you want to delete this question?')) return;

        try {
            const res = await fetch(`/api/questions/${id}`, { method: 'DELETE' });
            if (res.ok) {
                showNotification('success', 'Question deleted');
                fetchQuestions();
            } else {
                showNotification('error', 'Failed to delete question');
            }
        } catch (error) {
            showNotification('error', 'Error deleting question');
        }
    };

    // Update MCQ options
    const updateOption = (index: number, value: string) => {
        const newOptions = [...(formData.options || ['', '', '', ''])];
        newOptions[index] = value;
        setFormData({ ...formData, options: newOptions });
    };

    // Apply a question template to the form
    const applyTemplate = (template: QuestionTemplate) => {
        setFormData({
            ...formData,
            type: template.type,
            marks: template.marks,
            difficulty: template.difficulty as 'Easy' | 'Medium' | 'Difficult',
            blooms_level: template.blooms_level,
            subject_id: template.subject_id || formData.subject_id,
            grade_id: template.grade_id || formData.grade_id,
            topic: template.topic || formData.topic,
        });
        setEditingQuestion(null);
        setShowForm(true);

        // Increment template usage count
        fetch('/api/admin/question-templates', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: template.id, increment_usage: true }),
        }).catch(err => console.error('Failed to update template usage:', err));

        showNotification('success', `Template "${template.name}" applied!`);
    };

    // Add matching pair
    const addMatchingPair = () => {
        setFormData({
            ...formData,
            matching_pairs: [...(formData.matching_pairs || []), { left: '', right: '' }],
        });
    };

    // Update matching pair
    const updateMatchingPair = (index: number, side: 'left' | 'right', value: string) => {
        const pairs = [...(formData.matching_pairs || [])];
        pairs[index] = { ...pairs[index], [side]: value };
        setFormData({ ...formData, matching_pairs: pairs });
    };

    // Remove matching pair
    const removeMatchingPair = (index: number) => {
        const pairs = [...(formData.matching_pairs || [])];
        pairs.splice(index, 1);
        setFormData({ ...formData, matching_pairs: pairs });
    };

    // Batch update selected questions
    const handleBatchUpdate = async () => {
        if (selectedIds.size === 0) return;

        const updates: Record<string, any> = {};
        if (batchData.subject_id) updates.subject_id = batchData.subject_id;
        if (batchData.grade_id) updates.grade_id = batchData.grade_id;
        if (batchData.topic) updates.topic = batchData.topic;
        if (batchData.difficulty) updates.difficulty = batchData.difficulty;

        if (Object.keys(updates).length === 0) {
            showNotification('error', 'Please select at least one field to update');
            return;
        }

        setIsSaving(true);
        try {
            const results = await Promise.all(
                Array.from(selectedIds).map(id =>
                    fetch(`/api/questions/${id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(updates),
                    })
                )
            );

            const allOk = results.every(res => res.ok);
            if (allOk) {
                showNotification('success', `Updated ${selectedIds.size} questions`);
                setSelectedIds(new Set());
                setBatchData({ subject_id: '', grade_id: '', topic: '', difficulty: '' });
                fetchQuestions();
            } else {
                showNotification('error', 'Some questions failed to update');
            }
        } catch (error) {
            console.error('Batch update error:', error);
            showNotification('error', 'Error updating questions');
        } finally {
            setIsSaving(false);
        }
    };

    // Toggle selection for a question
    const toggleSelection = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

    // Toggle all selections
    const toggleAllSelection = () => {
        if (selectedIds.size === questions.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(questions.map(q => q.id)));
        }
    };

    // Parse questions and auto-assign topics for preview
    const parseAndPreviewQuestions = () => {
        if (!bulkText.trim()) {
            showNotification('error', 'Please enter some questions');
            return;
        }

        const lines = bulkText.split('\n').filter(line => line.trim());
        const parsed = lines.map(line => {
            // Extract marks from end of line like "What is 2+2? [2]"
            const marksMatch = line.match(/\[(\d+)\]\s*$/);
            const marks = marksMatch ? parseInt(marksMatch[1]) : 1;
            const text = marksMatch ? line.replace(/\[(\d+)\]\s*$/, '').trim() : line.trim();

            // Auto-match topic if topics are available
            let topic = 'General';
            let topicConfidence = 0;

            if (bulkTopics.length > 0) {
                const match = findBestTopic(text, bulkTopics as MatcherTopic[]);
                if (match.confidence > 0.1) {
                    topic = match.topicName;
                    topicConfidence = match.confidence;
                }
            }

            return { text, marks, topic, topicConfidence };
        });

        setParsedQuestions(parsed);
        setShowPreview(true);
    };

    // Update a parsed question's topic
    const updateParsedQuestionTopic = (index: number, newTopic: string) => {
        const updated = [...parsedQuestions];
        updated[index] = { ...updated[index], topic: newTopic, topicConfidence: 1 };
        setParsedQuestions(updated);
    };

    // Bulk import questions (submit parsed questions)
    const handleBulkImport = async () => {
        if (parsedQuestions.length === 0) {
            showNotification('error', 'No questions to import');
            return;
        }

        setIsBulkImporting(true);
        try {
            const questions = parsedQuestions.map(q => ({
                text: q.text,
                marks: q.marks,
                topic: q.topic,
                difficulty: 'Medium',
                type: 'Structured',
                subject_id: bulkSubjectId || null,
                grade_id: bulkGradeId || null,
            }));

            const res = await fetch('/api/questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ questions }),
            });

            if (res.ok) {
                const data = await res.json();
                showNotification('success', `Imported ${data.count} questions!`);
                setShowBulkImport(false);
                setShowPreview(false);
                setBulkText('');
                setParsedQuestions([]);
                setBulkSubjectId('');
                setBulkGradeId('');
                fetchQuestions();
            } else {
                const err = await res.json();
                showNotification('error', err.error || 'Failed to import questions');
            }
        } catch (error) {
            console.error('Bulk import error:', error);
            showNotification('error', 'Error importing questions');
        } finally {
            setIsBulkImporting(false);
        }
    };


    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            {/* Header */}
            <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <a
                                href="/admin"
                                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            >
                                ← Admin
                            </a>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                                    Question Bank
                                </h1>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    Manage questions for exam generation
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {/* Template selector dropdown */}
                            {questionTemplates.length > 0 && (
                                <div className="relative">
                                    <select
                                        onChange={(e) => {
                                            const template = questionTemplates.find(t => t.id === e.target.value);
                                            if (template) applyTemplate(template);
                                            e.target.value = ''; // Reset select
                                        }}
                                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm"
                                        defaultValue=""
                                    >
                                        <option value="" disabled>📋 Use Template...</option>
                                        {questionTemplates.filter(t => t.is_system).length > 0 && (
                                            <optgroup label="System Templates">
                                                {questionTemplates.filter(t => t.is_system).map(t => (
                                                    <option key={t.id} value={t.id}>{t.name}</option>
                                                ))}
                                            </optgroup>
                                        )}
                                        {questionTemplates.filter(t => !t.is_system).length > 0 && (
                                            <optgroup label="Custom Templates">
                                                {questionTemplates.filter(t => !t.is_system).map(t => (
                                                    <option key={t.id} value={t.id}>{t.name}</option>
                                                ))}
                                            </optgroup>
                                        )}
                                    </select>
                                </div>
                            )}
                            <button
                                onClick={() => setShowBulkImport(true)}
                                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                                <Upload className="w-4 h-4" />
                                Bulk Import
                            </button>
                            <button
                                onClick={handleNewQuestion}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                            >
                                <Plus className="w-4 h-4" />
                                Add Question
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Notification */}
            {notification && (
                <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg ${notification.type === 'success'
                    ? 'bg-green-50 text-green-800 border border-green-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                    }`}>
                    {notification.type === 'success' ? (
                        <CheckCircle className="w-5 h-5" />
                    ) : (
                        <AlertCircle className="w-5 h-5" />
                    )}
                    {notification.message}
                </div>
            )}

            {/* Bulk Import Modal */}
            {showBulkImport && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Bulk Import Questions {showPreview && '- Preview'}
                            </h2>
                            <button
                                onClick={() => { setShowBulkImport(false); setShowPreview(false); setParsedQuestions([]); }}
                                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {!showPreview ? (
                            <>
                                <div className="p-4 space-y-4 overflow-y-auto">
                                    {/* Subject and Grade Selection */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Subject (for auto-topic matching)
                                            </label>
                                            <select
                                                value={bulkSubjectId}
                                                onChange={(e) => setBulkSubjectId(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                            >
                                                <option value="">Select Subject...</option>
                                                {subjects.map((s) => (
                                                    <option key={s.id} value={s.id}>{s.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Grade
                                            </label>
                                            <select
                                                value={bulkGradeId}
                                                onChange={(e) => setBulkGradeId(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                            >
                                                <option value="">Select Grade...</option>
                                                {grades.map((g) => (
                                                    <option key={g.id} value={g.id}>{g.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {bulkTopics.length > 0 && (
                                        <p className="text-sm text-green-600 dark:text-green-400">
                                            ✓ {bulkTopics.length} topics loaded - questions will be auto-matched
                                        </p>
                                    )}

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Questions (one per line)
                                        </label>
                                        <p className="text-xs text-gray-500 mb-2">
                                            Format: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">Question text [marks]</code>
                                        </p>
                                        <textarea
                                            value={bulkText}
                                            onChange={(e) => setBulkText(e.target.value)}
                                            placeholder="What is photosynthesis? [2]&#10;Explain the water cycle [3]&#10;Define osmosis [1]"
                                            className="w-full h-48 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-blue-500"
                                        />
                                        <p className="text-xs text-gray-500 mt-2">
                                            {bulkText.split('\n').filter(l => l.trim()).length} questions detected
                                        </p>
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
                                    <button
                                        onClick={() => setShowBulkImport(false)}
                                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={parseAndPreviewQuestions}
                                        disabled={!bulkText.trim()}
                                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Preview & Assign Topics →
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="p-4 overflow-y-auto flex-1">
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                                        Review auto-assigned topics. Click on a topic to change it.
                                    </p>
                                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50 dark:bg-gray-700/50">
                                                <tr>
                                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Question</th>
                                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-16">Marks</th>
                                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-48">Topic</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                {parsedQuestions.map((q, idx) => (
                                                    <tr key={idx} className={q.topicConfidence > 0.5 ? 'bg-green-50 dark:bg-green-900/10' : q.topicConfidence > 0 ? 'bg-yellow-50 dark:bg-yellow-900/10' : ''}>
                                                        <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                                                        <td className="px-3 py-2 text-gray-900 dark:text-white max-w-md truncate">{q.text}</td>
                                                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{q.marks}</td>
                                                        <td className="px-3 py-2">
                                                            {bulkTopics.length > 0 ? (
                                                                <select
                                                                    value={q.topic}
                                                                    onChange={(e) => updateParsedQuestionTopic(idx, e.target.value)}
                                                                    className={`w-full px-2 py-1 border rounded text-sm ${q.topicConfidence > 0.5 ? 'border-green-300 bg-green-50 dark:bg-green-900/20' :
                                                                        q.topicConfidence > 0 ? 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20' :
                                                                            'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
                                                                        }`}
                                                                >
                                                                    <option value="General">General</option>
                                                                    {bulkTopics.map((t) => (
                                                                        <option key={t.id} value={t.name}>{t.name}</option>
                                                                    ))}
                                                                </select>
                                                            ) : (
                                                                <input
                                                                    type="text"
                                                                    value={q.topic}
                                                                    onChange={(e) => updateParsedQuestionTopic(idx, e.target.value)}
                                                                    className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700"
                                                                />
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                <div className="flex justify-between gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
                                    <button
                                        onClick={() => setShowPreview(false)}
                                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                                    >
                                        ← Back
                                    </button>
                                    <button
                                        onClick={handleBulkImport}
                                        disabled={isBulkImporting}
                                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        {isBulkImporting && <Loader2 className="w-4 h-4 animate-spin" />}
                                        Import {parsedQuestions.length} Questions
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Batch Actions Toolbar */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4 z-40 flex items-center gap-4">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {selectedIds.size} selected
                    </span>
                    <div className="h-4 w-px bg-gray-300 dark:bg-gray-600" />
                    <select
                        value={batchData.subject_id}
                        onChange={(e) => setBatchData({ ...batchData, subject_id: e.target.value })}
                        className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                    >
                        <option value="">Set Subject...</option>
                        {subjects.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                    <select
                        value={batchData.grade_id}
                        onChange={(e) => setBatchData({ ...batchData, grade_id: e.target.value })}
                        className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                    >
                        <option value="">Set Grade...</option>
                        {grades.map((g) => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                    </select>
                    <input
                        type="text"
                        value={batchData.topic}
                        onChange={(e) => setBatchData({ ...batchData, topic: e.target.value })}
                        placeholder="Set Topic..."
                        className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm w-32"
                    />
                    <select
                        value={batchData.difficulty}
                        onChange={(e) => setBatchData({ ...batchData, difficulty: e.target.value })}
                        className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                    >
                        <option value="">Set Difficulty...</option>
                        {DIFFICULTY_LEVELS.map((d) => (
                            <option key={d} value={d}>{d}</option>
                        ))}
                    </select>
                    <button
                        onClick={handleBatchUpdate}
                        disabled={isSaving}
                        className="px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm flex items-center gap-2 disabled:opacity-50"
                    >
                        {isSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                        Apply
                    </button>
                    <button
                        onClick={() => setSelectedIds(new Set())}
                        className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Main content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {/* Search and filters */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6">
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search questions..."
                                value={filters.search}
                                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`inline-flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors ${showFilters
                                ? 'bg-blue-50 border-blue-300 text-blue-700'
                                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                }`}
                        >
                            <Filter className="w-4 h-4" />
                            Filters
                        </button>
                    </div>

                    {/* Filter dropdowns */}
                    {showFilters && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                            {/* Level Filter - Primary filter for CBC */}
                            <select
                                value={filterLevel}
                                onChange={(e) => {
                                    setFilterLevel(e.target.value);
                                    setFilterBand('');
                                    setFilters({ ...filters, grade_id: '', subject_id: '' });
                                }}
                                className="px-3 py-2 border border-blue-300 dark:border-blue-700 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-gray-900 dark:text-white font-medium"
                            >
                                <option value="">All Levels</option>
                                {levels.map(l => (
                                    <option key={l} value={l as string}>{LEVEL_LABELS[l as string] || l}</option>
                                ))}
                            </select>

                            {/* Band Filter - Only show for Primary level */}
                            {filterLevel === 'primary' && bands.length > 0 && (
                                <select
                                    value={filterBand}
                                    onChange={(e) => {
                                        setFilterBand(e.target.value);
                                        setFilters({ ...filters, grade_id: '' });
                                    }}
                                    className="px-3 py-2 border border-purple-300 dark:border-purple-700 rounded-lg bg-purple-50 dark:bg-purple-900/30 text-gray-900 dark:text-white"
                                >
                                    <option value="">All Bands</option>
                                    {bands.map(b => (
                                        <option key={b} value={b as string}>{(b as string)?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
                                    ))}
                                </select>
                            )}

                            <select
                                value={filters.grade_id}
                                onChange={(e) => setFilters({ ...filters, grade_id: e.target.value })}
                                className="px-3 py-2 border border-green-300 dark:border-green-700 rounded-lg bg-green-50 dark:bg-green-900/30 text-gray-900 dark:text-white"
                            >
                                <option value="">All Grades</option>
                                {filteredGrades.map((g) => (
                                    <option key={g.id} value={g.id}>{g.name}</option>
                                ))}
                            </select>
                            <select
                                value={filters.subject_id}
                                onChange={(e) => setFilters({ ...filters, subject_id: e.target.value })}
                                className="px-3 py-2 border border-amber-300 dark:border-amber-700 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-gray-900 dark:text-white"
                            >
                                <option value="">All Subjects</option>
                                {availableSubjects.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.name} {s.code ? `(${s.code})` : ''}
                                    </option>
                                ))}
                            </select>
                            {/* Topic Filter - Only show when subject has topics */}
                            {topics.length > 0 && (
                                <select
                                    value={filters.topic_id}
                                    onChange={(e) => setFilters({ ...filters, topic_id: e.target.value })}
                                    className="px-3 py-2 border border-teal-300 dark:border-teal-700 rounded-lg bg-teal-50 dark:bg-teal-900/30 text-gray-900 dark:text-white"
                                >
                                    <option value="">All Topics/Strands</option>
                                    {topics.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.topic_number}. {t.name}
                                        </option>
                                    ))}
                                </select>
                            )}
                            <select
                                value={filters.difficulty}
                                onChange={(e) => setFilters({ ...filters, difficulty: e.target.value })}
                                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            >
                                <option value="">All Difficulties</option>
                                {DIFFICULTY_LEVELS.map((d) => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                {/* Questions list */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                        </div>
                    ) : questions.length === 0 ? (
                        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                            <p className="text-lg">No questions found</p>
                            <p className="text-sm mt-1">Try adjusting your filters or add a new question</p>
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-gray-50 dark:bg-gray-700/50">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-10">
                                                <button
                                                    onClick={toggleAllSelection}
                                                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                                                    title={selectedIds.size === questions.length ? 'Deselect all' : 'Select all'}
                                                >
                                                    {selectedIds.size === questions.length && questions.length > 0 ? (
                                                        <CheckSquare className="w-4 h-4 text-blue-600" />
                                                    ) : (
                                                        <Square className="w-4 h-4" />
                                                    )}
                                                </button>
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                Question
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                Type
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                Topic
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                Difficulty
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                Marks
                                            </th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                        {questions.map((q, index) => (
                                            <tr
                                                key={q.id}
                                                className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-shadow ${selectedIds.has(q.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''} ${focusedIndex === index ? 'ring-2 ring-blue-500 ring-inset bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
                                            >
                                                <td className="px-4 py-4 w-10">
                                                    <button
                                                        onClick={() => toggleSelection(q.id)}
                                                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                                                    >
                                                        {selectedIds.has(q.id) ? (
                                                            <CheckSquare className="w-4 h-4 text-blue-600" />
                                                        ) : (
                                                            <Square className="w-4 h-4 text-gray-400" />
                                                        )}
                                                    </button>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="max-w-md">
                                                        <div
                                                            className="text-sm text-gray-900 dark:text-white line-clamp-2 prose dark:prose-invert max-w-none"
                                                            dangerouslySetInnerHTML={{ __html: q.text }}
                                                        />
                                                        {(q.grade_name || q.subject_name) && (
                                                            <p className="text-xs text-gray-500 mt-1">
                                                                {q.grade_name}{q.grade_name && q.subject_name ? ' • ' : ''}{q.subject_name}
                                                            </p>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-300">
                                                    {q.type}
                                                </td>
                                                <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-300">
                                                    {q.topic}
                                                </td>
                                                <td className="px-4 py-4">
                                                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${q.difficulty === 'Easy'
                                                        ? 'bg-green-100 text-green-800'
                                                        : q.difficulty === 'Medium'
                                                            ? 'bg-yellow-100 text-yellow-800'
                                                            : 'bg-red-100 text-red-800'
                                                        }`}>
                                                        {q.difficulty}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-300">
                                                    {q.marks}
                                                </td>
                                                <td className="px-4 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => handleEditQuestion(q)}
                                                            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                            title="Edit"
                                                        >
                                                            <Edit2 className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteQuestion(q.id)}
                                                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="Delete"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-lg">
                                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                                    <div>
                                        <p className="text-sm text-gray-700 dark:text-gray-300">
                                            Showing <span className="font-medium">{Math.min(page * limit + 1, totalCount)}</span> to <span className="font-medium">{Math.min((page + 1) * limit, totalCount)}</span> of <span className="font-medium">{totalCount}</span> results
                                        </p>
                                    </div>
                                    <div>
                                        <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                                            <button
                                                onClick={() => setPage(Math.max(0, page - 1))}
                                                disabled={page === 0}
                                                className="relative inline-flex items-center px-4 py-2 rounded-l-md border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-800 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                            >
                                                <ChevronLeft className="h-4 w-4 mr-2" />
                                                Previous
                                            </button>
                                            <span className="relative inline-flex items-center px-4 py-2 border-t border-b border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-gray-800/80 text-sm font-medium text-blue-800 dark:text-blue-200">
                                                Page {page + 1} of {Math.max(1, Math.ceil(totalCount / limit))}
                                            </span>
                                            <button
                                                onClick={() => setPage(page + 1)}
                                                disabled={(page + 1) * limit >= totalCount}
                                                className="relative inline-flex items-center px-4 py-2 rounded-r-md border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-800 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                            >
                                                Next
                                                <ChevronRight className="h-4 w-4 ml-2" />
                                            </button>
                                        </nav>
                                    </div>
                                </div>
                                {/* Mobile view simplified */}
                                <div className="flex items-center justify-between w-full sm:hidden">
                                    <button
                                        onClick={() => setPage(Math.max(0, page - 1))}
                                        disabled={page === 0}
                                        className="relative inline-flex items-center px-4 py-2 border border-blue-300 dark:border-blue-700 text-sm font-medium rounded-md text-blue-700 dark:text-blue-300 bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Previous
                                    </button>
                                    <span className="text-sm text-gray-700 dark:text-gray-300">
                                        Page {page + 1}
                                    </span>
                                    <button
                                        onClick={() => setPage(page + 1)}
                                        disabled={(page + 1) * limit >= totalCount}
                                        className="ml-3 relative inline-flex items-center px-4 py-2 border border-blue-300 dark:border-blue-700 text-sm font-medium rounded-md text-blue-700 dark:text-blue-300 bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </main>

            {/* Question Form Modal */}
            {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800">
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                                {editingQuestion ? 'Edit Question' : 'New Question'}
                            </h2>
                            <button
                                onClick={() => { setShowForm(false); resetForm(); }}
                                className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Question Text */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Question Text <span className="text-red-500">*</span>
                                </label>
                                <div className="min-h-[200px]">
                                    <RichTextEditor
                                        value={formData.text || ''}
                                        onChange={(content) => setFormData({ ...formData, text: content })}
                                        placeholder="Enter the question text..."
                                    />
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
                                        {(formData.options || ['', '', '', '']).map((opt, idx) => (
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
                                        {(formData.matching_pairs || []).map((pair, idx) => (
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
                                                {(formData.matching_pairs?.length || 0) > 1 && (
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
                                    {formTopics.length > 0 ? (
                                        <select
                                            value={formData.topic}
                                            onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                                            className="w-full px-3 py-2 border border-teal-300 dark:border-teal-600 rounded-lg bg-teal-50 dark:bg-teal-900/30 text-gray-900 dark:text-white"
                                        >
                                            <option value="">Select Topic...</option>
                                            {formTopics.map((t) => (
                                                <option key={t.id} value={t.name}>
                                                    {t.topic_number}. {t.name}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input
                                            type="text"
                                            value={formData.topic}
                                            onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                            placeholder={formData.subject_id ? "No topics created - type here" : "Select a subject first"}
                                        />
                                    )}
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

                            {/* Marks, Bloom's Level, Answer Lines */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Marks
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={formData.marks}
                                        onChange={(e) => setFormData({ ...formData, marks: parseInt(e.target.value) || 1 })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Answer Lines (0 = default)
                                    </label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={formData.answerLines}
                                        onChange={(e) => setFormData({ ...formData, answerLines: parseInt(e.target.value) || 0 })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        placeholder="Auto"
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
                            </div>

                            {/* Level, Grade, Subject */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Level <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        value={formData.curriculum_id ? (grades.find(g => g.id === formData.grade_id)?.level || '') : ''}
                                        onChange={(e) => {
                                            // When level changes, reset grade and filter grades
                                            setFormData({ ...formData, grade_id: '', subject_id: '' });
                                            setFilterLevel(e.target.value);
                                        }}
                                        className="w-full px-3 py-2 border border-blue-300 dark:border-blue-600 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-gray-900 dark:text-white"
                                    >
                                        <option value="">Select Level...</option>
                                        {levels.map((l) => (
                                            <option key={l} value={l as string}>{LEVEL_LABELS[l as string] || l}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Grade <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        value={formData.grade_id}
                                        onChange={(e) => setFormData({ ...formData, grade_id: e.target.value, subject_id: '' })}
                                        className="w-full px-3 py-2 border border-green-300 dark:border-green-600 rounded-lg bg-green-50 dark:bg-green-900/30 text-gray-900 dark:text-white"
                                    >
                                        <option value="">Select Grade...</option>
                                        {filteredGrades.map((g) => (
                                            <option key={g.id} value={g.id}>{g.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Subject <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        value={formData.subject_id}
                                        onChange={(e) => setFormData({ ...formData, subject_id: e.target.value })}
                                        className="w-full px-3 py-2 border border-amber-300 dark:border-amber-600 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-gray-900 dark:text-white"
                                    >
                                        <option value="">Select Subject...</option>
                                        {availableSubjects.map((s) => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Term */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Term
                                </label>
                                <select
                                    value={formData.term}
                                    onChange={(e) => setFormData({ ...formData, term: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                >
                                    <option value="">No term</option>
                                    {TERMS.map((t) => (
                                        <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Marking Scheme */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Marking Scheme
                                </label>
                                <textarea
                                    value={formData.marking_scheme}
                                    onChange={(e) => setFormData({ ...formData, marking_scheme: e.target.value })}
                                    rows={3}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    placeholder="Describe how this question should be marked..."
                                />
                            </div>
                        </div>

                        {/* Form footer */}
                        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 sticky bottom-0 bg-white dark:bg-gray-800">
                            <button
                                onClick={() => { setShowForm(false); resetForm(); }}
                                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveQuestion}
                                disabled={isSaving}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                            >
                                {isSaving ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Save className="w-4 h-4" />
                                )}
                                {editingQuestion ? 'Update' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Keyboard Shortcuts Help Modal */}
            {showShortcuts && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowShortcuts(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">⌨️ Keyboard Shortcuts</h2>
                            <button onClick={() => setShowShortcuts(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2 text-sm">
                                <div className="flex items-center gap-2">
                                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono">Ctrl+N</kbd>
                                    <span className="text-gray-600 dark:text-gray-400">New question</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono">Ctrl+S</kbd>
                                    <span className="text-gray-600 dark:text-gray-400">Save question</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono">↑ ↓</kbd>
                                    <span className="text-gray-600 dark:text-gray-400">Navigate list</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono">E</kbd>
                                    <span className="text-gray-600 dark:text-gray-400">Edit selected</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono">Space</kbd>
                                    <span className="text-gray-600 dark:text-gray-400">Toggle select</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono">Esc</kbd>
                                    <span className="text-gray-600 dark:text-gray-400">Close/Cancel</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono">?</kbd>
                                    <span className="text-gray-600 dark:text-gray-400">Show shortcuts</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Keyboard shortcuts hint */}
            <button
                onClick={() => setShowShortcuts(true)}
                className="fixed bottom-4 right-4 p-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-xs"
                title="Keyboard shortcuts"
            >
                ⌨️ ?
            </button>
        </div>
    );
}
