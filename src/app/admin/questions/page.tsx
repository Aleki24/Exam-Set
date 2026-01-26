'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import RichTextEditor from '@/components/ui/RichTextEditor';

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

export default function AdminQuestionsPage() {
    // Data states
    const [questions, setQuestions] = useState<Question[]>([]);
    const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
    const [grades, setGrades] = useState<Grade[]>([]);
    const [subjects, setSubjects] = useState<Subject[]>([]);

    // UI states
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
    const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Filter states
    const [filters, setFilters] = useState({
        curriculum_id: '',
        grade_id: '',
        subject_id: '',
        difficulty: '',
        type: '',
        search: '',
    });
    const [showFilters, setShowFilters] = useState(false);

    // CBC specific filter states
    const [filterLevel, setFilterLevel] = useState('');
    const [filterBand, setFilterBand] = useState('');
    const [availableSubjects, setAvailableSubjects] = useState<Subject[]>([]);

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
    });

    // Show notification
    const showNotification = (type: 'success' | 'error', message: string) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 4000);
    };

    // Fetch lookup data
    const fetchLookupData = useCallback(async () => {
        try {
            // Fetch curriculums
            const currRes = await fetch('/api/admin/lookup?type=curriculums');
            if (currRes.ok) {
                const data = await currRes.json();
                setCurriculums(data.curriculums || []);
            }

            // Fetch subjects
            const subjRes = await fetch('/api/admin/lookup?type=subjects');
            if (subjRes.ok) {
                const data = await subjRes.json();
                setSubjects(data.subjects || []);
            }
        } catch (error) {
            console.error('Error fetching lookup data:', error);
        }
    }, []);

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

    // Initial load
    useEffect(() => {
        fetchLookupData();
    }, [fetchLookupData]);

    useEffect(() => {
        fetchQuestions();
    }, [fetchQuestions]);

    // Derived lists for dropdowns (filters)
    const levels = useMemo(() => Array.from(new Set(grades.map(g => g.level).filter(Boolean))), [grades]);
    const bands = useMemo(() => Array.from(new Set(grades.filter(g => g.level === filterLevel).map(g => g.band).filter(Boolean))), [grades, filterLevel]);

    const filteredGrades = useMemo(() => {
        if (!grades.length) return [];
        return grades.filter(g => {
            if (filterLevel && g.level !== filterLevel) return false;
            if (filterBand && g.band !== filterBand) return false;
            return true;
        });
    }, [grades, filterLevel, filterBand]);

    // Check if CBC is selected
    const isCBC = useMemo(() => {
        const curr = curriculums.find(c => c.id === filters.curriculum_id);
        return curr?.name === 'CBC';
    }, [filters.curriculum_id, curriculums]);

    // Fetch grades when filter curriculum changes
    useEffect(() => {
        if (filters.curriculum_id) {
            fetchGrades(filters.curriculum_id);
            setFilterLevel('');
            setFilterBand('');
        } else {
            setGrades([]);
        }
    }, [filters.curriculum_id, fetchGrades]);

    // Fetch subjects when grade filter changes
    useEffect(() => {
        const fetchFilterSubjects = async () => {
            if (!filters.grade_id) {
                // If no grade selected, showing all subjects might be too much if we want strictly relevant ones,
                // but standard behavior is usually "All Subjects".
                // However, we can improve by fetching all subjects again if we want to reset.
                // For now, let's keep the initial list or fetch all.
                // Re-fetching all subjects:
                try {
                    const res = await fetch('/api/admin/lookup?type=subjects'); // Fetch all
                    if (res.ok) {
                        const data = await res.json();
                        setAvailableSubjects(data.subjects || []);
                    }
                } catch (e) { console.error(e); }
                return;
            }
            try {
                const res = await fetch(`/api/admin/lookup?type=subjects&grade_id=${filters.grade_id}`);
                if (res.ok) {
                    const data = await res.json();
                    setAvailableSubjects(data.subjects || []);
                }
            } catch (error) {
                console.error('Error fetching subjects:', error);
            }
        };
        fetchFilterSubjects();
    }, [filters.grade_id]);

    // Fetch grades when form curriculum changes
    useEffect(() => {
        if (formData.curriculum_id) {
            fetchGrades(formData.curriculum_id);
        }
    }, [formData.curriculum_id, fetchGrades]);

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
                        <button
                            onClick={handleNewQuestion}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                        >
                            <Plus className="w-4 h-4" />
                            Add Question
                        </button>
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                            <select
                                value={filters.curriculum_id}
                                onChange={(e) => setFilters({ ...filters, curriculum_id: e.target.value, grade_id: '' })}
                                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            >
                                <option value="">All Curriculums</option>
                                {curriculums.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                            {isCBC && levels.length > 0 && (
                                <select
                                    value={filterLevel}
                                    onChange={(e) => {
                                        setFilterLevel(e.target.value);
                                        setFilterBand('');
                                        setFilters({ ...filters, grade_id: '' });
                                    }}
                                    className="px-3 py-2 border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50/50 dark:bg-blue-900/20 text-gray-900 dark:text-white"
                                >
                                    <option value="">All Levels</option>
                                    {levels.map(l => (
                                        <option key={l} value={l as string}>{l}</option>
                                    ))}
                                </select>
                            )}

                            {isCBC && levels.length > 0 && bands.length > 0 && (
                                <select
                                    value={filterBand}
                                    onChange={(e) => {
                                        setFilterBand(e.target.value);
                                        setFilters({ ...filters, grade_id: '' });
                                    }}
                                    className="px-3 py-2 border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50/50 dark:bg-blue-900/20 text-gray-900 dark:text-white"
                                >
                                    <option value="">All Bands</option>
                                    {bands.map(b => (
                                        <option key={b} value={b as string}>{b?.replace('_', ' ')}</option>
                                    ))}
                                </select>
                            )}

                            <select
                                value={filters.grade_id}
                                onChange={(e) => setFilters({ ...filters, grade_id: e.target.value })}
                                disabled={!filters.curriculum_id}
                                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                            >
                                <option value="">All Grades</option>
                                {filteredGrades.map((g) => (
                                    <option key={g.id} value={g.id}>{g.name}</option>
                                ))}
                            </select>
                            <select
                                value={filters.subject_id}
                                onChange={(e) => setFilters({ ...filters, subject_id: e.target.value })}
                                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            >
                                <option value="">All Subjects</option>
                                {availableSubjects.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.name} {s.code ? `(${s.code})` : ''}
                                    </option>
                                ))}
                            </select>
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
                                        {questions.map((q) => (
                                            <tr key={q.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                                <td className="px-4 py-4">
                                                    <div className="max-w-md">
                                                        <div
                                                            className="text-sm text-gray-900 dark:text-white line-clamp-2 prose dark:prose-invert max-w-none"
                                                            dangerouslySetInnerHTML={{ __html: q.text }}
                                                        />
                                                        {q.curriculum_name && (
                                                            <p className="text-xs text-gray-500 mt-1">
                                                                {q.curriculum_name} • {q.grade_name} • {q.subject_name}
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
                            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    Showing {page * limit + 1} - {Math.min((page + 1) * limit, totalCount)} of {totalCount}
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setPage(Math.max(0, page - 1))}
                                        disabled={page === 0}
                                        className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setPage(page + 1)}
                                        disabled={(page + 1) * limit >= totalCount}
                                        className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <ChevronRight className="w-4 h-4" />
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

                            {/* Marks and Bloom's Level */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                            {/* Curriculum, Grade, Subject */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Curriculum
                                    </label>
                                    <select
                                        value={formData.curriculum_id}
                                        onChange={(e) => setFormData({ ...formData, curriculum_id: e.target.value, grade_id: '' })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="">Select...</option>
                                        {curriculums.map((c) => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
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
                                        {grades.map((g) => (
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
                                        {subjects.map((s) => (
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
        </div>
    );
}
