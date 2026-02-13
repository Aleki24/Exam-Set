'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
    Search,
    Filter,
    X,
    ChevronDown,
    Plus,
    Loader2,
    FileQuestion,
    ArrowLeft,
    SlidersHorizontal
} from 'lucide-react';
import { Question, Difficulty, QuestionType, BloomsLevel } from '@/types';
import { getCurriculums, getGrades, getSubjects } from '@/services/questionService';

interface SearchResultQuestion extends Question {
    curriculum_name?: string;
    grade_name?: string;
    subject_name?: string;
    blooms_level?: string;
}

interface SearchResult {
    questions: SearchResultQuestion[];
    total: number;
    hasMore: boolean;
}

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Difficult'];
const QUESTION_TYPES: QuestionType[] = [
    'Multiple Choice',
    'True/False',
    'Short Answer',
    'Structured',
    'Essay',
    'Numeric',
    'Fill-in-the-blank',
    'Matching'
];
const BLOOMS_LEVELS: BloomsLevel[] = [
    'Knowledge',
    'Understanding',
    'Application',
    'Analysis',
    'Evaluation',
    'Creation'
];

function SearchPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [query, setQuery] = useState(searchParams.get('q') || '');
    const [results, setResults] = useState<SearchResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [showFilters, setShowFilters] = useState(false);

    // Filter states
    const [curriculumId, setCurriculumId] = useState<string>('');
    const [gradeId, setGradeId] = useState<string>('');
    const [subjectId, setSubjectId] = useState<string>('');
    const [difficulty, setDifficulty] = useState<string>('');
    const [questionType, setQuestionType] = useState<string>('');
    const [bloomsLevel, setBloomsLevel] = useState<string>('');
    const [topic, setTopic] = useState<string>('');

    // Lookup data
    const [curriculums, setCurriculums] = useState<{ id: string; name: string }[]>([]);
    const [grades, setGrades] = useState<{ id: string; name: string }[]>([]);
    const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);

    // Load lookup data
    useEffect(() => {
        async function loadLookups() {
            const [currData, gradeData, subjectData] = await Promise.all([
                getCurriculums(),
                getGrades(),
                getSubjects(),
            ]);
            setCurriculums(currData);
            setGrades(gradeData);
            setSubjects(subjectData);
        }
        loadLookups();
    }, []);

    // Debounced search
    const performSearch = useCallback(async () => {
        setLoading(true);

        const params = new URLSearchParams();
        if (query) params.set('q', query);
        if (curriculumId) params.set('curriculum_id', curriculumId);
        if (gradeId) params.set('grade_id', gradeId);
        if (subjectId) params.set('subject_id', subjectId);
        if (difficulty) params.set('difficulty', difficulty);
        if (questionType) params.set('type', questionType);
        if (bloomsLevel) params.set('blooms_level', bloomsLevel);
        if (topic) params.set('topic', topic);

        try {
            const res = await fetch(`/api/questions/search?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setResults(data);
            }
        } catch (error) {
            console.error('Search failed:', error);
        } finally {
            setLoading(false);
        }
    }, [query, curriculumId, gradeId, subjectId, difficulty, questionType, bloomsLevel, topic]);

    // Auto-search on filter changes
    useEffect(() => {
        const debounce = setTimeout(() => {
            performSearch();
        }, 300);

        return () => clearTimeout(debounce);
    }, [performSearch]);

    const clearFilters = () => {
        setCurriculumId('');
        setGradeId('');
        setSubjectId('');
        setDifficulty('');
        setQuestionType('');
        setBloomsLevel('');
        setTopic('');
    };

    const activeFilterCount = [
        curriculumId,
        gradeId,
        subjectId,
        difficulty,
        questionType,
        bloomsLevel,
        topic
    ].filter(Boolean).length;

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
                <div className="max-w-6xl mx-auto px-4 py-4">
                    <div className="flex items-center gap-4 mb-4">
                        <Link
                            href="/app"
                            className="p-2 hover:bg-slate-100 rounded-lg text-slate-600"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <h1 className="text-xl font-semibold text-slate-800">
                            Question Search
                        </h1>
                    </div>

                    {/* Search Input */}
                    <div className="flex gap-2">
                        <div className="flex-1 relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search questions by text, topic, or keyword..."
                                className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                            {query && (
                                <button
                                    onClick={() => setQuery('')}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded"
                                >
                                    <X className="w-4 h-4 text-slate-400" />
                                </button>
                            )}
                        </div>
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`px-4 py-3 border rounded-xl flex items-center gap-2 transition-colors ${showFilters || activeFilterCount > 0
                                ? 'bg-blue-50 border-blue-200 text-blue-700'
                                : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                                }`}
                        >
                            <SlidersHorizontal className="w-5 h-5" />
                            <span className="hidden sm:inline">Filters</span>
                            {activeFilterCount > 0 && (
                                <span className="w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center">
                                    {activeFilterCount}
                                </span>
                            )}
                        </button>
                    </div>

                    {/* Filters Panel */}
                    <AnimatePresence>
                        {showFilters && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="pt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <select
                                        value={curriculumId}
                                        onChange={(e) => setCurriculumId(e.target.value)}
                                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                    >
                                        <option value="">All Curriculums</option>
                                        {curriculums.map((c) => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>

                                    <select
                                        value={gradeId}
                                        onChange={(e) => setGradeId(e.target.value)}
                                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                    >
                                        <option value="">All Grades</option>
                                        {grades.map((g) => (
                                            <option key={g.id} value={g.id}>{g.name}</option>
                                        ))}
                                    </select>

                                    <select
                                        value={subjectId}
                                        onChange={(e) => setSubjectId(e.target.value)}
                                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                    >
                                        <option value="">All Subjects</option>
                                        {subjects.map((s) => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                    </select>

                                    <select
                                        value={difficulty}
                                        onChange={(e) => setDifficulty(e.target.value)}
                                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                    >
                                        <option value="">All Difficulties</option>
                                        {DIFFICULTIES.map((d) => (
                                            <option key={d} value={d}>{d}</option>
                                        ))}
                                    </select>

                                    <select
                                        value={questionType}
                                        onChange={(e) => setQuestionType(e.target.value)}
                                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                    >
                                        <option value="">All Types</option>
                                        {QUESTION_TYPES.map((t) => (
                                            <option key={t} value={t}>{t}</option>
                                        ))}
                                    </select>

                                    <select
                                        value={bloomsLevel}
                                        onChange={(e) => setBloomsLevel(e.target.value)}
                                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                    >
                                        <option value="">All Bloom's Levels</option>
                                        {BLOOMS_LEVELS.map((b) => (
                                            <option key={b} value={b}>{b}</option>
                                        ))}
                                    </select>

                                    <input
                                        type="text"
                                        value={topic}
                                        onChange={(e) => setTopic(e.target.value)}
                                        placeholder="Topic filter..."
                                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                    />

                                    {activeFilterCount > 0 && (
                                        <button
                                            onClick={clearFilters}
                                            className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm"
                                        >
                                            Clear filters
                                        </button>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </header>

            {/* Results */}
            <main className="max-w-6xl mx-auto px-4 py-6">
                {/* Results header */}
                <div className="flex items-center justify-between mb-4">
                    <p className="text-sm text-slate-600">
                        {loading ? (
                            'Searching...'
                        ) : results ? (
                            `${results.total} question${results.total !== 1 ? 's' : ''} found`
                        ) : (
                            'Enter a search query'
                        )}
                    </p>
                </div>

                {/* Loading state */}
                {loading && (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                    </div>
                )}

                {/* Results grid */}
                {!loading && results && results.questions.length > 0 && (
                    <div className="space-y-4">
                        {results.questions.map((question) => (
                            <motion.div
                                key={question.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                                        <FileQuestion className="w-5 h-5 text-blue-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        {/* Meta tags */}
                                        <div className="flex flex-wrap gap-2 mb-2">
                                            <span className="px-2 py-1 text-xs bg-slate-100 text-slate-600 rounded">
                                                {question.type}
                                            </span>
                                            <span className={`px-2 py-1 text-xs rounded ${question.difficulty === 'Easy'
                                                ? 'bg-green-100 text-green-700'
                                                : question.difficulty === 'Medium'
                                                    ? 'bg-yellow-100 text-yellow-700'
                                                    : 'bg-red-100 text-red-700'
                                                }`}>
                                                {question.difficulty}
                                            </span>
                                            <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">
                                                {question.marks} mark{question.marks !== 1 ? 's' : ''}
                                            </span>
                                            {question.topic && (
                                                <span className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded">
                                                    {question.topic}
                                                </span>
                                            )}
                                        </div>

                                        {/* Question text */}
                                        <div
                                            className="text-slate-800 prose prose-sm max-w-none line-clamp-3"
                                            dangerouslySetInnerHTML={{ __html: question.text }}
                                        />

                                        {/* Footer */}
                                        <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                                            {question.subject_name && (
                                                <span>{question.subject_name}</span>
                                            )}
                                            {question.grade_name && (
                                                <span>{question.grade_name}</span>
                                            )}
                                            {question.blooms_level && (
                                                <span>{question.blooms_level}</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action button */}
                                    <button
                                        className="flex-shrink-0 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 flex items-center gap-1"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Add
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}

                {/* Empty state */}
                {!loading && results && results.questions.length === 0 && (
                    <div className="text-center py-12">
                        <FileQuestion className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-slate-800 mb-2">
                            No questions found
                        </h3>
                        <p className="text-slate-500">
                            Try adjusting your search query or filters
                        </p>
                    </div>
                )}
            </main>
        </div>
    );
}

export default function SearchPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        }>
            <SearchPageContent />
        </Suspense>
    );
}
