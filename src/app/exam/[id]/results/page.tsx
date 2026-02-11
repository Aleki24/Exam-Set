'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
    CheckCircle,
    XCircle,
    Clock,
    Trophy,
    ArrowLeft,
    Home,
    RotateCcw,
    Loader2,
    AlertTriangle,
    BarChart3
} from 'lucide-react';
import { ExamSession, ExamResponse, Question } from '@/types';

interface ResultsData {
    session: ExamSession & {
        exams: {
            id: string;
            title: string;
            subject: string;
            question_count: number;
            total_marks: number;
        };
    };
    questions: Question[];
    responses: ExamResponse[];
}

export default function ExamResultsPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();

    const examId = params.id as string;
    const sessionId = searchParams.get('session');

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<ResultsData | null>(null);

    useEffect(() => {
        async function fetchResults() {
            if (!sessionId) {
                setError('No session ID provided');
                setLoading(false);
                return;
            }

            try {
                const res = await fetch(`/api/exam-sessions/${sessionId}`);
                if (!res.ok) {
                    throw new Error('Failed to load results');
                }

                const resultData: ResultsData = await res.json();

                if (resultData.session.status !== 'submitted' && resultData.session.status !== 'timed_out') {
                    router.push(`/exam/${examId}`);
                    return;
                }

                setData(resultData);
                setLoading(false);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An error occurred');
                setLoading(false);
            }
        }

        fetchResults();
    }, [sessionId, examId, router]);

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-center max-w-md p-8 bg-white rounded-xl shadow-lg">
                    <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-slate-800 mb-2">Error</h2>
                    <p className="text-slate-600 mb-4">{error || 'Failed to load results'}</p>
                    <Link
                        href="/dashboard"
                        className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        Go to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    const { session, questions, responses } = data;
    const score = session.score || 0;
    const maxScore = session.max_score || 0;
    const percentage = session.percentage || 0;

    const startTime = new Date(session.started_at);
    const endTime = session.submitted_at ? new Date(session.submitted_at) : new Date();
    const timeTaken = Math.round((endTime.getTime() - startTime.getTime()) / 1000);

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs}s`;
    };

    const getGrade = (pct: number) => {
        if (pct >= 90) return { letter: 'A+', color: 'text-green-600', bg: 'bg-green-100' };
        if (pct >= 80) return { letter: 'A', color: 'text-green-600', bg: 'bg-green-100' };
        if (pct >= 70) return { letter: 'B', color: 'text-blue-600', bg: 'bg-blue-100' };
        if (pct >= 60) return { letter: 'C', color: 'text-yellow-600', bg: 'bg-yellow-100' };
        if (pct >= 50) return { letter: 'D', color: 'text-orange-600', bg: 'bg-orange-100' };
        return { letter: 'F', color: 'text-red-600', bg: 'bg-red-100' };
    };

    const grade = getGrade(percentage);
    const answeredCount = responses.filter((r) =>
        r.response && Object.keys(r.response).length > 0
    ).length;

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
            {/* Header */}
            <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
                    <Link
                        href="/dashboard"
                        className="flex items-center gap-2 text-slate-600 hover:text-slate-800"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        Back to Dashboard
                    </Link>
                    <div className="flex gap-2">
                        <Link
                            href={`/exam/${examId}`}
                            className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                        >
                            <RotateCcw className="w-4 h-4" />
                            Retake
                        </Link>
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 py-8">
                {/* Score Card */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-2xl shadow-lg p-8 mb-8"
                >
                    <div className="text-center mb-8">
                        <h1 className="text-2xl font-bold text-slate-800 mb-2">
                            {session.exams.title}
                        </h1>
                        <p className="text-slate-500">{session.exams.subject}</p>

                        {session.status === 'timed_out' && (
                            <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-yellow-100 text-yellow-700 rounded-lg">
                                <Clock className="w-4 h-4" />
                                Time ran out - exam auto-submitted
                            </div>
                        )}
                    </div>

                    {/* Score Display */}
                    <div className="flex flex-col md:flex-row items-center justify-center gap-8 mb-8">
                        {/* Circular Progress */}
                        <div className="relative w-48 h-48">
                            <svg className="w-48 h-48 transform -rotate-90">
                                <circle
                                    cx="96"
                                    cy="96"
                                    r="88"
                                    fill="none"
                                    stroke="#e2e8f0"
                                    strokeWidth="12"
                                />
                                <motion.circle
                                    cx="96"
                                    cy="96"
                                    r="88"
                                    fill="none"
                                    stroke={percentage >= 50 ? '#22c55e' : '#ef4444'}
                                    strokeWidth="12"
                                    strokeLinecap="round"
                                    strokeDasharray={`${2 * Math.PI * 88}`}
                                    initial={{ strokeDashoffset: 2 * Math.PI * 88 }}
                                    animate={{
                                        strokeDashoffset: 2 * Math.PI * 88 * (1 - percentage / 100),
                                    }}
                                    transition={{ duration: 1.5, ease: 'easeOut' }}
                                />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <motion.span
                                    initial={{ opacity: 0, scale: 0.5 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: 0.5 }}
                                    className="text-4xl font-bold text-slate-800"
                                >
                                    {Math.round(percentage)}%
                                </motion.span>
                                <span className="text-slate-500">Score</span>
                            </div>
                        </div>

                        {/* Grade Badge */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.8 }}
                            className={`w-24 h-24 rounded-full ${grade.bg} flex items-center justify-center`}
                        >
                            <span className={`text-4xl font-bold ${grade.color}`}>
                                {grade.letter}
                            </span>
                        </motion.div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-slate-50 rounded-xl p-4 text-center">
                            <Trophy className="w-6 h-6 text-yellow-500 mx-auto mb-2" />
                            <p className="text-2xl font-bold text-slate-800">
                                {score}/{maxScore}
                            </p>
                            <p className="text-sm text-slate-500">Points</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-4 text-center">
                            <CheckCircle className="w-6 h-6 text-green-500 mx-auto mb-2" />
                            <p className="text-2xl font-bold text-slate-800">
                                {answeredCount}/{questions.length}
                            </p>
                            <p className="text-sm text-slate-500">Answered</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-4 text-center">
                            <Clock className="w-6 h-6 text-blue-500 mx-auto mb-2" />
                            <p className="text-2xl font-bold text-slate-800">
                                {formatDuration(timeTaken)}
                            </p>
                            <p className="text-sm text-slate-500">Time Taken</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-4 text-center">
                            <BarChart3 className="w-6 h-6 text-purple-500 mx-auto mb-2" />
                            <p className="text-2xl font-bold text-slate-800">
                                {questions.length}
                            </p>
                            <p className="text-sm text-slate-500">Questions</p>
                        </div>
                    </div>
                </motion.div>

                {/* Question Review */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-white rounded-2xl shadow-lg p-8"
                >
                    <h2 className="text-xl font-semibold text-slate-800 mb-6">Question Review</h2>

                    <div className="space-y-4">
                        {questions.map((question, idx) => {
                            const response = responses.find((r) => r.question_id === question.id);
                            const hasAnswer = response && response.response && Object.keys(response.response).length > 0;

                            return (
                                <div
                                    key={question.id}
                                    className="border border-slate-200 rounded-lg p-4"
                                >
                                    <div className="flex items-start gap-4">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${hasAnswer ? 'bg-green-100' : 'bg-slate-100'
                                            }`}>
                                            {hasAnswer ? (
                                                <CheckCircle className="w-5 h-5 text-green-600" />
                                            ) : (
                                                <XCircle className="w-5 h-5 text-slate-400" />
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="font-medium text-slate-800">
                                                    Question {idx + 1}
                                                </span>
                                                <span className="text-sm text-slate-500">
                                                    ({question.marks} marks)
                                                </span>
                                            </div>
                                            <div
                                                className="text-slate-600 text-sm prose prose-sm max-w-none"
                                                dangerouslySetInnerHTML={{ __html: question.text }}
                                            />
                                            {hasAnswer && (
                                                <div className="mt-2 p-2 bg-slate-50 rounded text-sm">
                                                    <span className="text-slate-500">Your answer: </span>
                                                    <span className="text-slate-700">
                                                        {formatResponse(response!.response)}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </motion.div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 mt-8 justify-center">
                    <Link
                        href="/dashboard"
                        className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        <Home className="w-5 h-5" />
                        Go to Dashboard
                    </Link>
                    <Link
                        href={`/exam/${examId}`}
                        className="flex items-center justify-center gap-2 px-6 py-3 border border-slate-200 bg-white text-slate-700 rounded-lg hover:bg-slate-50"
                    >
                        <RotateCcw className="w-5 h-5" />
                        Take Again
                    </Link>
                </div>
            </main>
        </div>
    );
}

function formatResponse(response: unknown): string {
    if (!response || typeof response !== 'object') return 'No answer';

    const r = response as Record<string, unknown>;

    if ('selected' in r) {
        if (typeof r.selected === 'boolean') {
            return r.selected ? 'True' : 'False';
        }
        return String(r.selected);
    }

    if ('text' in r) {
        const text = String(r.text);
        return text.length > 100 ? text.substring(0, 100) + '...' : text;
    }

    if ('value' in r) {
        return `${r.value}${r.unit ? ' ' + r.unit : ''}`;
    }

    if ('answers' in r && Array.isArray(r.answers)) {
        return r.answers.join(', ');
    }

    return 'Answered';
}
