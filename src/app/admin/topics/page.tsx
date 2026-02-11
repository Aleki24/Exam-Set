'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
    Tag,
    Upload,
    CheckSquare,
    Square,
    AlertCircle
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

interface Topic {
    id: string;
    subject_id: string;
    topic_number: number;
    name: string;
    description?: string;
    subject_name?: string;
}

// CBC Level labels
const LEVEL_LABELS: Record<string, string> = {
    'primary': 'Primary',
    'junior': 'JSS (Junior Secondary)',
    'senior': 'SSS (Senior Secondary)'
};

export default function TopicsPage() {
    // All data
    const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
    const [allGrades, setAllGrades] = useState<Grade[]>([]);
    const [topics, setTopics] = useState<Topic[]>([]);

    // Selections
    const [selectedLevel, setSelectedLevel] = useState<string>('primary');
    const [selectedGrade, setSelectedGrade] = useState<string>('');
    const [selectedSubject, setSelectedSubject] = useState<string>('');

    // UI states
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Bulk Form state
    const [showBulkForm, setShowBulkForm] = useState(false);
    const [bulkStep, setBulkStep] = useState<'input' | 'review'>('input');
    const [bulkTopicsText, setBulkTopicsText] = useState('');
    const [parsedTopics, setParsedTopics] = useState<{
        id: string; // temp id for key
        name: string;
        topic_number?: number;
        selected: boolean;
        error?: string;
    }[]>([]);

    // Form state
    const [showForm, setShowForm] = useState(false);
    const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        topic_number: 1
    });

    // Show notification
    const showNotification = (type: 'success' | 'error', message: string) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 4000);
    };

    // Filter grades by selected level
    const filteredGrades = useMemo(() => {
        if (!selectedLevel) return allGrades;
        return allGrades.filter(g => g.level === selectedLevel);
    }, [allGrades, selectedLevel]);

    // For now, show all subjects (since subjects are shared across levels)
    // In a full implementation, you'd filter subjects by grade_subjects table
    const filteredSubjects = allSubjects;

    // Fetch initial data (grades and subjects)
    const fetchInitialData = useCallback(async () => {
        try {
            const [gradesRes, subjRes] = await Promise.all([
                fetch('/api/admin/lookup?type=grades'),
                fetch('/api/admin/lookup?type=subjects')
            ]);

            if (gradesRes.ok) {
                const data = await gradesRes.json();
                setAllGrades(data.grades || []);
            }

            if (subjRes.ok) {
                const data = await subjRes.json();
                setAllSubjects(data.subjects || []);
            }
        } catch (error) {
            console.error('Error fetching data:', error);
        }
    }, []);

    // Fetch topics
    const fetchTopics = useCallback(async () => {
        setIsLoading(true);
        try {
            const url = selectedSubject
                ? `/api/admin/topics?subject_id=${selectedSubject}`
                : '/api/admin/topics';
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                setTopics(data.topics || []);
            }
        } catch (error) {
            console.error('Error fetching topics:', error);
            showNotification('error', 'Failed to fetch topics');
        } finally {
            setIsLoading(false);
        }
    }, [selectedSubject]);

    useEffect(() => {
        fetchInitialData();
    }, [fetchInitialData]);

    useEffect(() => {
        fetchTopics();
    }, [fetchTopics]);

    // Handle level change - reset grade and subject selections
    const handleLevelChange = (level: string) => {
        setSelectedLevel(level);
        setSelectedGrade('');
        setSelectedSubject('');
    };

    // Filter topics by search
    const filteredTopics = topics.filter(t =>
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Open form for new topic
    const handleNewTopic = () => {
        if (!selectedSubject) {
            showNotification('error', 'Please select a subject first');
            return;
        }
        setEditingTopic(null);
        setFormData({ name: '', description: '', topic_number: topics.length + 1 });
        setShowForm(true);
    };

    // Open form for editing
    const handleEdit = (topic: Topic) => {
        setEditingTopic(topic);
        setFormData({
            name: topic.name,
            description: topic.description || '',
            topic_number: topic.topic_number
        });
        setShowForm(true);
    };

    // Submit form
    const handleSubmit = async () => {
        if (!formData.name.trim()) {
            showNotification('error', 'Topic name is required');
            return;
        }

        setIsSaving(true);
        try {
            const method = editingTopic ? 'PUT' : 'POST';
            const body = editingTopic
                ? { id: editingTopic.id, ...formData }
                : { subject_id: selectedSubject, ...formData };

            const res = await fetch('/api/admin/topics', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                showNotification('success', editingTopic ? 'Topic updated' : 'Topic created');
                setShowForm(false);
                fetchTopics();
            } else {
                const data = await res.json();
                showNotification('error', data.error || 'Failed to save topic');
            }
        } catch (error) {
            showNotification('error', 'Failed to save topic');
        } finally {
            setIsSaving(false);
        }
    };

    // Bulk Upload Handlers
    const handleParseBulk = () => {
        if (!bulkTopicsText.trim()) {
            showNotification('error', 'Please enter some topics');
            return;
        }

        const lines = bulkTopicsText.split('\n').filter(line => line.trim());
        const parsed = lines.map((line, index) => {
            let name = line.trim();
            let topic_number: number | undefined;

            // Try to extract number if present "1. Topic Name" or "1 Topic Name"
            const match = line.match(/^(\d+)[\.\s]+(.*)/);
            if (match) {
                topic_number = parseInt(match[1]);
                name = match[2].trim();
            }

            return {
                id: `temp-${index}-${Date.now()}`,
                name,
                topic_number,
                selected: true,
                error: name.length > 200 ? 'Name too long (max 200 chars)' : undefined
            };
        });

        if (parsed.length === 0) {
            showNotification('error', 'No valid topics found');
            return;
        }

        setParsedTopics(parsed);
        setBulkStep('review');
    };

    const handleBulkUpload = async () => {
        const selectedTopics = parsedTopics.filter(t => t.selected);

        if (selectedTopics.length === 0) {
            showNotification('error', 'No topics selected');
            return;
        }

        if (selectedTopics.some(t => t.error)) {
            showNotification('error', 'Some selected topics have errors. Please fix them first.');
            return;
        }

        if (!selectedSubject) {
            showNotification('error', 'Please select a subject first');
            return;
        }

        setIsSaving(true);
        try {
            const res = await fetch('/api/admin/topics/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subject_id: selectedSubject,
                    topics: selectedTopics.map(t => ({
                        name: t.name,
                        topic_number: t.topic_number
                    }))
                })
            });

            if (res.ok) {
                const data = await res.json();
                showNotification('success', data.message || 'Topics added successfully');
                setShowBulkForm(false);
                setBulkTopicsText('');
                setBulkStep('input');
                setParsedTopics([]);
                fetchTopics();
            } else {
                const data = await res.json();
                showNotification('error', data.error || 'Failed to upload topics');
            }
        } catch (error) {
            console.error('Bulk upload error:', error);
            showNotification('error', 'Failed to upload topics');
        } finally {
            setIsSaving(false);
        }
    };

    const toggleTopicSelection = (id: string) => {
        setParsedTopics(prev => prev.map(t =>
            t.id === id ? { ...t, selected: !t.selected } : t
        ));
    };

    const updateParsedTopic = (id: string, updates: Partial<typeof parsedTopics[0]>) => {
        setParsedTopics(prev => prev.map(t => {
            if (t.id !== id) return t;
            const updated = { ...t, ...updates };
            // Re-validate
            if (updated.name.length > 200) updated.error = 'Name too long (max 200 chars)';
            else updated.error = undefined;
            return updated;
        }));
    };

    // Delete topic
    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this topic?')) return;

        try {
            const res = await fetch(`/api/admin/topics?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                showNotification('success', 'Topic deleted');
                fetchTopics();
            } else {
                showNotification('error', 'Failed to delete topic');
            }
        } catch (error) {
            showNotification('error', 'Failed to delete topic');
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
                            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Topics & Strands</h1>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Manage subject-specific topics</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => {
                                if (!selectedSubject) {
                                    showNotification('error', 'Please select a subject first');
                                    return;
                                }
                                setBulkStep('input');
                                setShowBulkForm(true);
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg font-medium transition-colors"
                        >
                            <Upload className="w-4 h-4" />
                            Bulk Add
                        </button>
                        <button
                            onClick={handleNewTopic}
                            className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            Add Topic
                        </button>
                    </div>
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
                {/* Level Tabs */}
                <div className="flex gap-2 mb-6">
                    {Object.entries(LEVEL_LABELS).map(([value, label]) => (
                        <button
                            key={value}
                            onClick={() => handleLevelChange(value)}
                            className={`px-4 py-2 rounded-lg font-medium transition-colors ${selectedLevel === value
                                ? 'bg-teal-600 text-white'
                                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                                }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {/* Filters */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6">
                    <div className="flex flex-col sm:flex-row gap-4">
                        {/* Grade Filter */}
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Grade
                            </label>
                            <select
                                value={selectedGrade}
                                onChange={(e) => setSelectedGrade(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            >
                                <option value="">All Grades</option>
                                {filteredGrades.map(g => (
                                    <option key={g.id} value={g.id}>{g.name}</option>
                                ))}
                            </select>
                        </div>
                        {/* Subject Filter */}
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Subject
                            </label>
                            <select
                                value={selectedSubject}
                                onChange={(e) => setSelectedSubject(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            >
                                <option value="">All Subjects</option>
                                {filteredSubjects.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </div>
                        {/* Search */}
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Search
                            </label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search topics..."
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Topics List */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
                        </div>
                    ) : filteredTopics.length === 0 ? (
                        <div className="text-center py-12">
                            <Tag className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
                            <p className="text-gray-500 dark:text-gray-400">No topics found</p>
                            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                                {selectedSubject ? 'Add a topic to get started' : 'Select a subject first'}
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-200 dark:divide-gray-700">
                            {filteredTopics.map((topic) => (
                                <div
                                    key={topic.id}
                                    className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-start gap-4">
                                            <div className="w-10 h-10 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center text-teal-600 font-bold">
                                                {topic.topic_number}
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-gray-900 dark:text-white">
                                                    {topic.name}
                                                </h3>
                                                {topic.description && (
                                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                                        {topic.description}
                                                    </p>
                                                )}
                                                {topic.subject_name && (
                                                    <span className="inline-block mt-2 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs rounded">
                                                        {topic.subject_name}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleEdit(topic)}
                                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg text-gray-500 hover:text-blue-600"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(topic.id)}
                                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg text-gray-500 hover:text-red-600"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
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
                        className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
                        onClick={() => setShowForm(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                    {editingTopic ? 'Edit Topic' : 'New Topic'}
                                </h2>
                                <button
                                    onClick={() => setShowForm(false)}
                                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                >
                                    <X className="w-5 h-5 text-gray-500" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Topic Number
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={formData.topic_number}
                                        onChange={(e) => setFormData({ ...formData, topic_number: parseInt(e.target.value) || 1 })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Topic Name <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="e.g., Natural & Built Environment"
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Description
                                    </label>
                                    <textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        rows={3}
                                        placeholder="Brief description of this topic..."
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    onClick={() => setShowForm(false)}
                                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    disabled={isSaving}
                                    className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                                >
                                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    {editingTopic ? 'Update' : 'Create'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Bulk Upload Modal */}
            <AnimatePresence>
                {showBulkForm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
                        onClick={() => setShowBulkForm(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full p-6"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                    {bulkStep === 'input' ? 'Bulk Add Topics' : 'Review Topics'}
                                </h2>
                                <button
                                    onClick={() => setShowBulkForm(false)}
                                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                >
                                    <X className="w-5 h-5 text-gray-500" />
                                </button>
                            </div>

                            {bulkStep === 'input' ? (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Paste Topics (One per line)
                                        </label>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                            Format: "Topic Name" or "1. Topic Name"
                                        </p>
                                        <textarea
                                            value={bulkTopicsText}
                                            onChange={(e) => setBulkTopicsText(e.target.value)}
                                            rows={10}
                                            placeholder="Introduction to Science&#10;2. Measurement&#10;Forces"
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none font-mono text-sm"
                                        />
                                    </div>
                                    <div className="flex justify-end gap-3 mt-6">
                                        <button
                                            onClick={() => setShowBulkForm(false)}
                                            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleParseBulk}
                                            className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors"
                                        >
                                            Review & Select
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col h-[60vh]">
                                    <div className="flex-1 overflow-y-auto pr-2 space-y-2 mb-4">
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                                            Review the topics below. Uncheck any you don't want to import. Edit names if they are too long.
                                        </p>
                                        {parsedTopics.map((topic) => (
                                            <div
                                                key={topic.id}
                                                className={`flex items-start gap-3 p-3 rounded-lg border ${topic.error
                                                    ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
                                                    : topic.selected
                                                        ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30'
                                                        : 'border-transparent opacity-60'
                                                    }`}
                                            >
                                                <button
                                                    onClick={() => toggleTopicSelection(topic.id)}
                                                    className="mt-2 text-gray-500 hover:text-teal-600 focus:outline-none"
                                                >
                                                    {topic.selected ? (
                                                        <CheckSquare className="w-5 h-5 text-teal-600" />
                                                    ) : (
                                                        <Square className="w-5 h-5" />
                                                    )}
                                                </button>

                                                <div className="flex-1 space-y-2">
                                                    <div className="flex gap-2">
                                                        <input
                                                            type="number"
                                                            placeholder="#"
                                                            className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                                                            value={topic.topic_number || ''}
                                                            onChange={(e) => updateParsedTopic(topic.id, { topic_number: parseInt(e.target.value) || undefined })}
                                                        />
                                                        <input
                                                            type="text"
                                                            className={`flex-1 px-2 py-1 text-sm border rounded bg-white dark:bg-gray-700 ${topic.error ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300 dark:border-gray-600'
                                                                }`}
                                                            value={topic.name}
                                                            onChange={(e) => updateParsedTopic(topic.id, { name: e.target.value })}
                                                        />
                                                    </div>

                                                    {topic.error && (
                                                        <div className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                                                            <AlertCircle className="w-3 h-3" />
                                                            {topic.error}
                                                        </div>
                                                    )}

                                                    {!topic.error && topic.name.length > 180 && (
                                                        <div className="text-xs text-orange-500">
                                                            Length: {topic.name.length}/200
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="flex justify-between items-center border-t border-gray-200 dark:border-gray-700 pt-4 mt-auto">
                                        <div className="text-sm text-gray-500">
                                            {parsedTopics.filter(t => t.selected).length} selected
                                        </div>
                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => setBulkStep('input')}
                                                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium transition-colors"
                                            >
                                                Back
                                            </button>
                                            <button
                                                onClick={handleBulkUpload}
                                                disabled={isSaving || parsedTopics.some(t => t.selected && t.error)}
                                                className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                                Upload Selected
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
