'use client';

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Question, QuestionType, Difficulty, BloomsLevel, DBCurriculum, DBGrade, DBSubject } from '@/types';
import { getCurriculums, getGrades, getSubjects } from '@/services/questionService';
import { Button } from '@/components/ui/button';
import { X, Plus, Trash2 } from 'lucide-react';

interface QuestionEntryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (question: Question) => void;
    initialQuestion?: Partial<Question>;
}

const QUESTION_TYPES: QuestionType[] = [
    'Multiple Choice', 'True/False', 'Matching', 'Fill-in-the-blank',
    'Numeric', 'Structured', 'Short Answer', 'Essay', 'Practical', 'Oral'
];

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Difficult'];
const BLOOMS_LEVELS: BloomsLevel[] = ['Knowledge', 'Understanding', 'Application', 'Analysis', 'Evaluation', 'Creation'];

export default function QuestionEntryModal({
    isOpen,
    onClose,
    onSave,
    initialQuestion
}: QuestionEntryModalProps) {
    // Form state
    const [text, setText] = useState(initialQuestion?.text || '');
    const [marks, setMarks] = useState(initialQuestion?.marks || 1);
    const [difficulty, setDifficulty] = useState<Difficulty>(initialQuestion?.difficulty || 'Medium');
    const [type, setType] = useState<QuestionType>(initialQuestion?.type || 'Structured');
    const [topic, setTopic] = useState(initialQuestion?.topic || '');
    const [subtopic, setSubtopic] = useState(initialQuestion?.subtopic || '');
    const [markingScheme, setMarkingScheme] = useState(initialQuestion?.markingScheme || '');
    const [bloomsLevel, setBloomsLevel] = useState<BloomsLevel>(initialQuestion?.bloomsLevel || 'Knowledge');
    const [options, setOptions] = useState<string[]>(initialQuestion?.options || ['', '', '', '']);
    const [matchingPairs, setMatchingPairs] = useState<{ left: string; right: string }[]>(
        initialQuestion?.matchingPairs || [{ left: '', right: '' }]
    );

    // Hierarchy state
    const [curriculums, setCurriculums] = useState<DBCurriculum[]>([]);
    const [grades, setGrades] = useState<DBGrade[]>([]);
    const [subjects, setSubjects] = useState<DBSubject[]>([]);
    const [selectedCurriculum, setSelectedCurriculum] = useState<string>('');
    const [selectedGrade, setSelectedGrade] = useState<string>('');
    const [selectedSubject, setSelectedSubject] = useState<string>('');

    const [isSaving, setIsSaving] = useState(false);

    // Load lookup data
    useEffect(() => {
        const loadData = async () => {
            try {
                const [currData, subData] = await Promise.all([
                    getCurriculums(),
                    getSubjects()
                ]);
                setCurriculums(currData);
                setSubjects(subData);
            } catch (error) {
                console.error('Failed to load lookup data:', error);
            }
        };
        loadData();
    }, []);

    // Load grades when curriculum changes
    useEffect(() => {
        const loadGrades = async () => {
            if (selectedCurriculum) {
                const gradeData = await getGrades(selectedCurriculum);
                setGrades(gradeData);
            } else {
                setGrades([]);
                setSelectedGrade('');
            }
        };
        loadGrades();
    }, [selectedCurriculum]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!text.trim()) {
            toast.error('Question text is required');
            return;
        }

        if (!topic.trim()) {
            toast.error('Topic is required');
            return;
        }

        setIsSaving(true);

        try {
            // Build question object
            const question: any = {
                text: text.trim(),
                marks,
                difficulty,
                type,
                topic: topic.trim(),
                subtopic: subtopic.trim() || undefined,
                markingScheme: markingScheme.trim() || undefined,
                bloomsLevel,
                curriculum_id: selectedCurriculum || undefined,
                grade_id: selectedGrade || undefined,
                subject_id: selectedSubject || undefined,
            };

            // Add type-specific fields
            if (type === 'Multiple Choice' && options.some(o => o.trim())) {
                question.options = options.filter(o => o.trim());
            }

            if (type === 'Matching' && matchingPairs.some(p => p.left.trim() || p.right.trim())) {
                question.matchingPairs = matchingPairs.filter(p => p.left.trim() && p.right.trim());
            }

            // Save to database
            const response = await fetch('/api/questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(question),
            });

            if (!response.ok) {
                throw new Error('Failed to save question');
            }

            const result = await response.json();
            toast.success('Question saved successfully!');
            onSave(result.questions[0]);
            onClose();
        } catch (error) {
            console.error('Failed to save question:', error);
            toast.error('Failed to save question');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" style={{ maxHeight: '90vh' }}>
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-purple-600 to-indigo-600 text-white shrink-0">
                    <h2 className="text-xl font-bold">Add New Question</h2>
                    <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-4" style={{ overflowY: 'auto' }}>
                    {/* Question Text */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Question Text *</label>
                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            rows={3}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            placeholder="Enter the question text..."
                            required
                        />
                    </div>

                    {/* Row: Type, Marks, Difficulty */}
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                            <select
                                value={type}
                                onChange={(e) => setType(e.target.value as QuestionType)}
                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                            >
                                {QUESTION_TYPES.map(t => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Marks</label>
                            <input
                                type="number"
                                min={1}
                                value={marks}
                                onChange={(e) => setMarks(parseInt(e.target.value) || 1)}
                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Difficulty</label>
                            <select
                                value={difficulty}
                                onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                            >
                                {DIFFICULTIES.map(d => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* MCQ Options */}
                    {type === 'Multiple Choice' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Options</label>
                            {options.map((opt, idx) => (
                                <div key={idx} className="flex gap-2 mb-2">
                                    <span className="w-6 h-9 flex items-center justify-center text-sm font-medium text-gray-500">
                                        {String.fromCharCode(65 + idx)}.
                                    </span>
                                    <input
                                        type="text"
                                        value={opt}
                                        onChange={(e) => {
                                            const newOpts = [...options];
                                            newOpts[idx] = e.target.value;
                                            setOptions(newOpts);
                                        }}
                                        className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                                        placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                                    />
                                </div>
                            ))}
                            {options.length < 6 && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setOptions([...options, ''])}
                                >
                                    <Plus className="w-4 h-4 mr-1" /> Add Option
                                </Button>
                            )}
                        </div>
                    )}

                    {/* Matching Pairs */}
                    {type === 'Matching' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Matching Pairs</label>
                            {matchingPairs.map((pair, idx) => (
                                <div key={idx} className="flex gap-2 mb-2 items-center">
                                    <input
                                        type="text"
                                        value={pair.left}
                                        onChange={(e) => {
                                            const newPairs = [...matchingPairs];
                                            newPairs[idx].left = e.target.value;
                                            setMatchingPairs(newPairs);
                                        }}
                                        className="flex-1 p-2 border border-gray-300 rounded-lg"
                                        placeholder="Left item"
                                    />
                                    <span className="text-gray-400">→</span>
                                    <input
                                        type="text"
                                        value={pair.right}
                                        onChange={(e) => {
                                            const newPairs = [...matchingPairs];
                                            newPairs[idx].right = e.target.value;
                                            setMatchingPairs(newPairs);
                                        }}
                                        className="flex-1 p-2 border border-gray-300 rounded-lg"
                                        placeholder="Right item"
                                    />
                                    {matchingPairs.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => setMatchingPairs(matchingPairs.filter((_, i) => i !== idx))}
                                            className="p-2 text-red-500 hover:bg-red-50 rounded"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            ))}
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setMatchingPairs([...matchingPairs, { left: '', right: '' }])}
                            >
                                <Plus className="w-4 h-4 mr-1" /> Add Pair
                            </Button>
                        </div>
                    )}

                    {/* Hierarchy: Curriculum, Grade, Subject */}
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Curriculum</label>
                            <select
                                value={selectedCurriculum}
                                onChange={(e) => setSelectedCurriculum(e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                            >
                                <option value="">Select...</option>
                                {curriculums.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Grade</label>
                            <select
                                value={selectedGrade}
                                onChange={(e) => setSelectedGrade(e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                                disabled={!selectedCurriculum}
                            >
                                <option value="">Select...</option>
                                {grades.map(g => (
                                    <option key={g.id} value={g.id}>{g.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                            <select
                                value={selectedSubject}
                                onChange={(e) => setSelectedSubject(e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                            >
                                <option value="">Select...</option>
                                {subjects.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Topic & Subtopic */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Topic *</label>
                            <input
                                type="text"
                                value={topic}
                                onChange={(e) => setTopic(e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                                placeholder="e.g., Kinematics"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Subtopic</label>
                            <input
                                type="text"
                                value={subtopic}
                                onChange={(e) => setSubtopic(e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                                placeholder="e.g., Speed and Velocity"
                            />
                        </div>
                    </div>

                    {/* Bloom's Level */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Bloom's Level</label>
                        <select
                            value={bloomsLevel}
                            onChange={(e) => setBloomsLevel(e.target.value as BloomsLevel)}
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                        >
                            {BLOOMS_LEVELS.map(b => (
                                <option key={b} value={b}>{b}</option>
                            ))}
                        </select>
                    </div>

                    {/* Marking Scheme */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Marking Scheme</label>
                        <textarea
                            value={markingScheme}
                            onChange={(e) => setMarkingScheme(e.target.value)}
                            rows={2}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                            placeholder="Enter the marking scheme or correct answer..."
                        />
                    </div>
                </form>

                {/* Footer */}
                <div className="flex justify-end gap-3 p-4 border-t bg-gray-50">
                    <Button variant="outline" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={isSaving}>
                        {isSaving ? 'Saving...' : 'Save Question'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
