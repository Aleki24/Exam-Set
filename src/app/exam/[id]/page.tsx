'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Clock,
    ChevronLeft,
    ChevronRight,
    Flag,
    CheckCircle,
    AlertTriangle,
    Send,
    Loader2,
    ArrowLeft,
    List,
    X
} from 'lucide-react';
import { Question, ExamSession, ExamResponse } from '@/types';

interface ExamData {
    session: ExamSession & {
        exams: {
            id: string;
            title: string;
            subject: string;
            question_count: number;
            total_marks: number;
            time_limit: string;
            instructions?: string;
        };
    };
    questions: Question[];
    responses: ExamResponse[];
}

export default function ExamPage() {
    const params = useParams();
    const router = useRouter();
    const examId = params.id as string;

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [examData, setExamData] = useState<ExamData | null>(null);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [responses, setResponses] = useState<Record<string, unknown>>({});
    const [flaggedQuestions, setFlaggedQuestions] = useState<Set<string>>(new Set());
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
    const [showNavigation, setShowNavigation] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [showSubmitModal, setShowSubmitModal] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);

    const lastSaveTime = useRef<number>(Date.now());
    const autoSaveInterval = useRef<NodeJS.Timeout | null>(null);

    // Start or resume exam session
    useEffect(() => {
        async function initExam() {
            try {
                // First, create or get an existing session
                const sessionRes = await fetch('/api/exam-sessions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ exam_id: examId }),
                });

                if (!sessionRes.ok) {
                    const err = await sessionRes.json();
                    throw new Error(err.error || 'Failed to start exam');
                }

                const session = await sessionRes.json();
                setSessionId(session.id);

                // Now fetch full session data with questions
                const dataRes = await fetch(`/api/exam-sessions/${session.id}`);
                if (!dataRes.ok) {
                    throw new Error('Failed to load exam data');
                }

                const data: ExamData = await dataRes.json();
                setExamData(data);

                // Initialize time remaining
                if (data.session.time_remaining) {
                    setTimeRemaining(data.session.time_remaining);
                } else if (data.session.time_limit_seconds) {
                    setTimeRemaining(data.session.time_limit_seconds);
                }

                // Initialize responses from existing data
                const existingResponses: Record<string, unknown> = {};
                const existingFlags = new Set<string>();

                data.responses.forEach((r) => {
                    existingResponses[r.question_id] = r.response;
                    if (r.is_flagged) {
                        existingFlags.add(r.question_id);
                    }
                });

                setResponses(existingResponses);
                setFlaggedQuestions(existingFlags);
                setLoading(false);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An error occurred');
                setLoading(false);
            }
        }

        initExam();
    }, [examId]);

    // Timer countdown
    useEffect(() => {
        if (timeRemaining === null || timeRemaining <= 0) return;

        const timer = setInterval(() => {
            setTimeRemaining((prev) => {
                if (prev === null || prev <= 1) {
                    // Time's up - auto submit
                    handleSubmit(true);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [timeRemaining]);

    // Auto-save every 30 seconds
    useEffect(() => {
        if (!sessionId) return;

        autoSaveInterval.current = setInterval(() => {
            saveCurrentProgress();
        }, 30000);

        return () => {
            if (autoSaveInterval.current) {
                clearInterval(autoSaveInterval.current);
            }
        };
    }, [sessionId, responses, timeRemaining]);

    const saveCurrentProgress = useCallback(async () => {
        if (!sessionId) return;

        try {
            // Update time remaining
            if (timeRemaining !== null) {
                await fetch(`/api/exam-sessions/${sessionId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ time_remaining: timeRemaining }),
                });
            }
            lastSaveTime.current = Date.now();
        } catch (err) {
            console.error('Auto-save failed:', err);
        }
    }, [sessionId, timeRemaining]);

    const saveResponse = useCallback(async (questionId: string, response: unknown) => {
        if (!sessionId || !examData) return;

        const question = examData.questions.find((q) => q.id === questionId);
        if (!question) return;

        try {
            await fetch(`/api/exam-sessions/${sessionId}/responses`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question_id: questionId,
                    response,
                    marks_possible: question.marks,
                    time_spent: Math.round((Date.now() - lastSaveTime.current) / 1000),
                }),
            });
        } catch (err) {
            console.error('Failed to save response:', err);
        }
    }, [sessionId, examData]);

    const handleResponseChange = (questionId: string, response: unknown) => {
        setResponses((prev) => ({ ...prev, [questionId]: response }));
        saveResponse(questionId, response);
    };

    const toggleFlag = async (questionId: string) => {
        const newFlags = new Set(flaggedQuestions);
        const isFlagged = newFlags.has(questionId);

        if (isFlagged) {
            newFlags.delete(questionId);
        } else {
            newFlags.add(questionId);
        }

        setFlaggedQuestions(newFlags);

        if (sessionId) {
            try {
                await fetch(`/api/exam-sessions/${sessionId}/responses`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        question_id: questionId,
                        is_flagged: !isFlagged,
                    }),
                });
            } catch (err) {
                console.error('Failed to toggle flag:', err);
            }
        }
    };

    const handleSubmit = async (isTimeout = false) => {
        if (!sessionId) return;
        setSubmitting(true);

        try {
            const res = await fetch(`/api/exam-sessions/${sessionId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: isTimeout ? 'timeout' : 'submit' }),
            });

            if (res.ok) {
                router.push(`/exam/${examId}/results?session=${sessionId}`);
            } else {
                const err = await res.json();
                setError(err.error || 'Failed to submit exam');
            }
        } catch (err) {
            setError('Failed to submit exam');
        } finally {
            setSubmitting(false);
            setShowSubmitModal(false);
        }
    };

    const formatTime = (seconds: number) => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hrs > 0) {
            return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const getQuestionStatus = (questionId: string) => {
        const hasResponse = responses[questionId] !== undefined && responses[questionId] !== null;
        const isFlagged = flaggedQuestions.has(questionId);

        if (isFlagged) return 'flagged';
        if (hasResponse) return 'answered';
        return 'unanswered';
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
                    <p className="text-slate-600">Loading exam...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-center max-w-md p-8 bg-white rounded-xl shadow-lg">
                    <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-slate-800 mb-2">Error</h2>
                    <p className="text-slate-600 mb-4">{error}</p>
                    <button
                        onClick={() => router.back()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        );
    }

    if (!examData) return null;

    const { session, questions } = examData;
    const currentQuestion = questions[currentQuestionIndex];
    const answeredCount = Object.keys(responses).filter((id) => responses[id] !== undefined && responses[id] !== null).length;
    const isLowTime = timeRemaining !== null && timeRemaining < 300; // Less than 5 minutes

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setShowNavigation(!showNavigation)}
                            className="lg:hidden p-2 hover:bg-slate-100 rounded-lg"
                        >
                            <List className="w-5 h-5" />
                        </button>
                        <div>
                            <h1 className="font-semibold text-slate-800 truncate max-w-xs">
                                {session.exams.title}
                            </h1>
                            <p className="text-sm text-slate-500">{session.exams.subject}</p>
                        </div>
                    </div>

                    {/* Timer */}
                    {timeRemaining !== null && (
                        <div
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-lg ${isLowTime
                                    ? 'bg-red-100 text-red-700 animate-pulse'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                        >
                            <Clock className="w-5 h-5" />
                            {formatTime(timeRemaining)}
                        </div>
                    )}

                    {/* Progress & Submit */}
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-slate-600 hidden sm:inline">
                            {answeredCount}/{questions.length} answered
                        </span>
                        <button
                            onClick={() => setShowSubmitModal(true)}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                        >
                            <Send className="w-4 h-4" />
                            <span className="hidden sm:inline">Submit</span>
                        </button>
                    </div>
                </div>
            </header>

            <div className="flex-1 flex">
                {/* Question Navigation Sidebar */}
                <AnimatePresence>
                    {showNavigation && (
                        <motion.aside
                            initial={{ x: -300, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: -300, opacity: 0 }}
                            className="fixed lg:relative inset-y-0 left-0 w-64 bg-white border-r border-slate-200 z-30 lg:z-auto overflow-y-auto"
                        >
                            <div className="p-4">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-medium text-slate-800">Questions</h3>
                                    <button
                                        onClick={() => setShowNavigation(false)}
                                        className="lg:hidden p-1 hover:bg-slate-100 rounded"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="grid grid-cols-5 gap-2">
                                    {questions.map((q, idx) => {
                                        const status = getQuestionStatus(q.id);
                                        return (
                                            <button
                                                key={q.id}
                                                onClick={() => {
                                                    setCurrentQuestionIndex(idx);
                                                    setShowNavigation(false);
                                                }}
                                                className={`
                                                    w-10 h-10 rounded-lg text-sm font-medium flex items-center justify-center
                                                    ${currentQuestionIndex === idx ? 'ring-2 ring-blue-500' : ''}
                                                    ${status === 'answered' ? 'bg-green-100 text-green-700' : ''}
                                                    ${status === 'flagged' ? 'bg-yellow-100 text-yellow-700' : ''}
                                                    ${status === 'unanswered' ? 'bg-slate-100 text-slate-600' : ''}
                                                `}
                                            >
                                                {idx + 1}
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="mt-6 space-y-2 text-sm">
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 rounded bg-green-100" />
                                        <span className="text-slate-600">Answered</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 rounded bg-yellow-100" />
                                        <span className="text-slate-600">Flagged for review</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 rounded bg-slate-100" />
                                        <span className="text-slate-600">Not answered</span>
                                    </div>
                                </div>
                            </div>
                        </motion.aside>
                    )}
                </AnimatePresence>

                {/* Desktop Sidebar */}
                <aside className="hidden lg:block w-64 bg-white border-r border-slate-200 overflow-y-auto">
                    <div className="p-4">
                        <h3 className="font-medium text-slate-800 mb-4">Questions</h3>
                        <div className="grid grid-cols-5 gap-2">
                            {questions.map((q, idx) => {
                                const status = getQuestionStatus(q.id);
                                return (
                                    <button
                                        key={q.id}
                                        onClick={() => setCurrentQuestionIndex(idx)}
                                        className={`
                                            w-10 h-10 rounded-lg text-sm font-medium flex items-center justify-center transition-all
                                            ${currentQuestionIndex === idx ? 'ring-2 ring-blue-500' : ''}
                                            ${status === 'answered' ? 'bg-green-100 text-green-700 hover:bg-green-200' : ''}
                                            ${status === 'flagged' ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' : ''}
                                            ${status === 'unanswered' ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : ''}
                                        `}
                                    >
                                        {idx + 1}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="mt-6 space-y-2 text-sm">
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded bg-green-100" />
                                <span className="text-slate-600">Answered ({answeredCount})</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded bg-yellow-100" />
                                <span className="text-slate-600">Flagged ({flaggedQuestions.size})</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded bg-slate-100" />
                                <span className="text-slate-600">Not answered ({questions.length - answeredCount})</span>
                            </div>
                        </div>
                    </div>
                </aside>

                {/* Main Question Area */}
                <main className="flex-1 p-4 lg:p-8 overflow-y-auto">
                    <div className="max-w-3xl mx-auto">
                        {/* Question Card */}
                        <motion.div
                            key={currentQuestion.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-white rounded-xl shadow-sm border border-slate-200 p-6"
                        >
                            {/* Question Header */}
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <span className="text-sm text-slate-500">
                                        Question {currentQuestionIndex + 1} of {questions.length}
                                    </span>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                                            {currentQuestion.marks} mark{currentQuestion.marks !== 1 ? 's' : ''}
                                        </span>
                                        <span className="px-2 py-1 text-xs font-medium bg-slate-100 text-slate-600 rounded">
                                            {currentQuestion.type}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => toggleFlag(currentQuestion.id)}
                                    className={`p-2 rounded-lg transition-colors ${flaggedQuestions.has(currentQuestion.id)
                                            ? 'bg-yellow-100 text-yellow-700'
                                            : 'hover:bg-slate-100 text-slate-400'
                                        }`}
                                    title="Flag for review"
                                >
                                    <Flag className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Question Text */}
                            <div
                                className="prose prose-slate max-w-none mb-6"
                                dangerouslySetInnerHTML={{ __html: currentQuestion.text }}
                            />

                            {/* Answer Input based on Question Type */}
                            <QuestionInput
                                question={currentQuestion}
                                value={responses[currentQuestion.id]}
                                onChange={(val) => handleResponseChange(currentQuestion.id, val)}
                            />
                        </motion.div>

                        {/* Navigation Buttons */}
                        <div className="flex items-center justify-between mt-6">
                            <button
                                onClick={() => setCurrentQuestionIndex((i) => Math.max(0, i - 1))}
                                disabled={currentQuestionIndex === 0}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ChevronLeft className="w-4 h-4" />
                                Previous
                            </button>

                            <span className="text-sm text-slate-500">
                                {currentQuestionIndex + 1} / {questions.length}
                            </span>

                            <button
                                onClick={() =>
                                    setCurrentQuestionIndex((i) => Math.min(questions.length - 1, i + 1))
                                }
                                disabled={currentQuestionIndex === questions.length - 1}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Next
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </main>
            </div>

            {/* Submit Confirmation Modal */}
            <AnimatePresence>
                {showSubmitModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white rounded-xl shadow-xl max-w-md w-full p-6"
                        >
                            <h2 className="text-xl font-semibold text-slate-800 mb-2">
                                Submit Exam?
                            </h2>
                            <p className="text-slate-600 mb-4">
                                You have answered <strong>{answeredCount}</strong> out of{' '}
                                <strong>{questions.length}</strong> questions.
                            </p>

                            {answeredCount < questions.length && (
                                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg mb-4">
                                    <div className="flex items-center gap-2 text-yellow-700">
                                        <AlertTriangle className="w-5 h-5" />
                                        <span className="font-medium">
                                            {questions.length - answeredCount} question(s) unanswered
                                        </span>
                                    </div>
                                </div>
                            )}

                            {flaggedQuestions.size > 0 && (
                                <p className="text-sm text-slate-500 mb-4">
                                    You have {flaggedQuestions.size} flagged question(s).
                                </p>
                            )}

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowSubmitModal(false)}
                                    className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50"
                                    disabled={submitting}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => handleSubmit(false)}
                                    disabled={submitting}
                                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
                                >
                                    {submitting ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <CheckCircle className="w-4 h-4" />
                                    )}
                                    Submit
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// Question Input Component
interface QuestionInputProps {
    question: Question;
    value: unknown;
    onChange: (value: unknown) => void;
}

function QuestionInput({ question, value, onChange }: QuestionInputProps) {
    switch (question.type) {
        case 'Multiple Choice':
            return (
                <div className="space-y-3">
                    {question.options?.map((option, idx) => {
                        const letter = String.fromCharCode(65 + idx);
                        const isSelected = (value as { selected?: string })?.selected === letter;
                        return (
                            <button
                                key={idx}
                                onClick={() => onChange({ selected: letter })}
                                className={`w-full text-left p-4 rounded-lg border-2 transition-all ${isSelected
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'border-slate-200 hover:border-slate-300'
                                    }`}
                            >
                                <span className="font-medium mr-3">{letter}.</span>
                                {option}
                            </button>
                        );
                    })}
                </div>
            );

        case 'True/False':
            return (
                <div className="flex gap-4">
                    {[true, false].map((opt) => {
                        const isSelected = (value as { selected?: boolean })?.selected === opt;
                        return (
                            <button
                                key={opt.toString()}
                                onClick={() => onChange({ selected: opt })}
                                className={`flex-1 p-4 rounded-lg border-2 font-medium transition-all ${isSelected
                                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                                        : 'border-slate-200 hover:border-slate-300'
                                    }`}
                            >
                                {opt ? 'True' : 'False'}
                            </button>
                        );
                    })}
                </div>
            );

        case 'Short Answer':
        case 'Fill-in-the-blank':
            return (
                <input
                    type="text"
                    value={(value as { text?: string })?.text || ''}
                    onChange={(e) => onChange({ text: e.target.value })}
                    placeholder="Type your answer here..."
                    className="w-full p-4 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
            );

        case 'Numeric':
            return (
                <div className="flex gap-2">
                    <input
                        type="number"
                        value={(value as { value?: number })?.value || ''}
                        onChange={(e) =>
                            onChange({
                                value: e.target.value ? parseFloat(e.target.value) : undefined,
                                unit: question.unit,
                            })
                        }
                        placeholder="Enter number..."
                        className="flex-1 p-4 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                    {question.unit && (
                        <span className="p-4 bg-slate-100 rounded-lg text-slate-600">
                            {question.unit}
                        </span>
                    )}
                </div>
            );

        case 'Essay':
        case 'Structured':
        default:
            return (
                <div className="space-y-2">
                    <textarea
                        value={(value as { text?: string })?.text || ''}
                        onChange={(e) => onChange({ text: e.target.value })}
                        placeholder="Write your answer here..."
                        rows={question.answerLines || 8}
                        className="w-full p-4 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y min-h-[200px]"
                    />
                    <p className="text-sm text-slate-500 text-right">
                        {((value as { text?: string })?.text || '').length} characters
                    </p>
                </div>
            );
    }
}
