'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
    BookOpen,
    Clock,
    Trophy,
    TrendingUp,
    BarChart3,
    FileText,
    ChevronRight,
    Play,
    Loader2,
    User,
    LogOut,
    Calendar,
    Target,
    Award,
    Search,
    Settings,
    ClipboardList
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import {
    getExamHistory,
    getStudentStats,
    getAvailableExams
} from '@/services/examSessionService';
import { StudentStats, ExamHistoryItem, StoredExam } from '@/types';

export default function DashboardPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<{ email?: string; id?: string } | null>(null);
    const [stats, setStats] = useState<StudentStats | null>(null);
    const [examHistory, setExamHistory] = useState<ExamHistoryItem[]>([]);
    const [availableExams, setAvailableExams] = useState<StoredExam[]>([]);

    useEffect(() => {
        async function loadDashboard() {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                router.push('/auth/login');
                return;
            }

            setUser(user);

            // Load all dashboard data in parallel
            const [statsData, historyData, examsData] = await Promise.all([
                getStudentStats(),
                getExamHistory(10),
                getAvailableExams(),
            ]);

            setStats(statsData);
            setExamHistory(historyData);
            setAvailableExams(examsData);
            setLoading(false);
        }

        loadDashboard();
    }, [router]);

    const handleLogout = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push('/');
    };

    const formatDuration = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        if (hours > 0) return `${hours}h ${mins}m`;
        return `${mins}m`;
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
            {/* Header */}
            <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                            {user?.email?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div>
                            <h1 className="font-semibold text-slate-800">Welcome back!</h1>
                            <p className="text-sm text-slate-500">{user?.email}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link
                            href="/app"
                            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg flex items-center gap-2"
                        >
                            <FileText className="w-4 h-4" />
                            <span className="hidden sm:inline">Exam Builder</span>
                        </Link>
                        <Link
                            href="/exams"
                            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg flex items-center gap-2"
                        >
                            <ClipboardList className="w-4 h-4" />
                            <span className="hidden sm:inline">Browse Exams</span>
                        </Link>
                        <Link
                            href="/search"
                            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg flex items-center gap-2"
                        >
                            <Search className="w-4 h-4" />
                            <span className="hidden sm:inline">Search</span>
                        </Link>
                        <Link
                            href="/admin"
                            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg flex items-center gap-2"
                        >
                            <Settings className="w-4 h-4" />
                            <span className="hidden sm:inline">Admin</span>
                        </Link>
                        <button
                            onClick={handleLogout}
                            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg flex items-center gap-2"
                        >
                            <LogOut className="w-4 h-4" />
                            <span className="hidden sm:inline">Logout</span>
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 py-8">
                {/* Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-xl shadow-sm border border-slate-200 p-5"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                                <BookOpen className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-800">
                                    {stats?.total_exams_taken || 0}
                                </p>
                                <p className="text-sm text-slate-500">Exams Taken</p>
                            </div>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="bg-white rounded-xl shadow-sm border border-slate-200 p-5"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                                <Target className="w-5 h-5 text-green-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-800">
                                    {Math.round(stats?.average_score || 0)}%
                                </p>
                                <p className="text-sm text-slate-500">Avg Score</p>
                            </div>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="bg-white rounded-xl shadow-sm border border-slate-200 p-5"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                                <Clock className="w-5 h-5 text-purple-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-800">
                                    {formatDuration(stats?.total_time_spent || 0)}
                                </p>
                                <p className="text-sm text-slate-500">Time Spent</p>
                            </div>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="bg-white rounded-xl shadow-sm border border-slate-200 p-5"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                                <TrendingUp className="w-5 h-5 text-yellow-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-800">
                                    {stats?.exams_this_week || 0}
                                </p>
                                <p className="text-sm text-slate-500">This Week</p>
                            </div>
                        </div>
                    </motion.div>
                </div>

                <div className="grid lg:grid-cols-3 gap-8">
                    {/* Main Content */}
                    <div className="lg:col-span-2 space-y-8">
                        {/* Available Exams */}
                        <motion.section
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 }}
                            className="bg-white rounded-xl shadow-sm border border-slate-200 p-6"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold text-slate-800">
                                    Available Exams
                                </h2>
                                <Link
                                    href="/exams"
                                    className="text-blue-600 text-sm hover:underline"
                                >
                                    View all
                                </Link>
                            </div>

                            {availableExams.length === 0 ? (
                                <div className="text-center py-8 text-slate-500">
                                    <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                    <p>No exams available yet</p>
                                </div>
                            ) : (
                                <div className="grid sm:grid-cols-2 gap-4">
                                    {availableExams.slice(0, 4).map((exam) => (
                                        <Link
                                            key={exam.id}
                                            href={`/exam/${exam.id}`}
                                            className="group border border-slate-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-md transition-all"
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white flex-shrink-0">
                                                    <FileText className="w-5 h-5" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="font-medium text-slate-800 truncate group-hover:text-blue-600">
                                                        {exam.title}
                                                    </h3>
                                                    <p className="text-sm text-slate-500">
                                                        {exam.subject}
                                                    </p>
                                                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                                                        <span>{exam.question_count} questions</span>
                                                        <span>{exam.total_marks} marks</span>
                                                    </div>
                                                </div>
                                                <Play className="w-5 h-5 text-slate-300 group-hover:text-blue-500" />
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </motion.section>

                        {/* Recent Exam History */}
                        <motion.section
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.5 }}
                            className="bg-white rounded-xl shadow-sm border border-slate-200 p-6"
                        >
                            <h2 className="text-lg font-semibold text-slate-800 mb-4">
                                Recent Results
                            </h2>

                            {examHistory.length === 0 ? (
                                <div className="text-center py-8 text-slate-500">
                                    <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                    <p>No exam history yet</p>
                                    <p className="text-sm mt-1">Take an exam to see your results here</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {examHistory.map((item) => (
                                        <Link
                                            key={item.session_id}
                                            href={`/exam/${item.exam_id}/results?session=${item.session_id}`}
                                            className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 transition-colors"
                                        >
                                            <div
                                                className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold text-lg ${item.percentage >= 70
                                                    ? 'bg-green-100 text-green-700'
                                                    : item.percentage >= 50
                                                        ? 'bg-yellow-100 text-yellow-700'
                                                        : 'bg-red-100 text-red-700'
                                                    }`}
                                            >
                                                {Math.round(item.percentage)}%
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-medium text-slate-800 truncate">
                                                    {item.exam_title}
                                                </h3>
                                                <p className="text-sm text-slate-500">
                                                    {item.subject} • {formatDate(item.submitted_at)}
                                                </p>
                                            </div>
                                            <div className="text-right text-sm">
                                                <p className="font-medium text-slate-700">
                                                    {item.score}/{item.max_score}
                                                </p>
                                                <p className="text-slate-400">
                                                    {formatDuration(item.time_taken)}
                                                </p>
                                            </div>
                                            <ChevronRight className="w-5 h-5 text-slate-300" />
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </motion.section>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">
                        {/* Performance Summary */}
                        <motion.section
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.6 }}
                            className="bg-white rounded-xl shadow-sm border border-slate-200 p-6"
                        >
                            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                                <Award className="w-5 h-5 text-yellow-500" />
                                Performance
                            </h3>

                            {stats?.best_subject && (
                                <div className="mb-4 p-3 bg-green-50 rounded-lg border border-green-100">
                                    <p className="text-sm text-green-600 font-medium">
                                        Best Subject
                                    </p>
                                    <p className="text-lg font-semibold text-green-800">
                                        {stats.best_subject}
                                    </p>
                                </div>
                            )}

                            {stats?.worst_subject && stats.worst_subject !== stats.best_subject && (
                                <div className="p-3 bg-orange-50 rounded-lg border border-orange-100">
                                    <p className="text-sm text-orange-600 font-medium">
                                        Needs Improvement
                                    </p>
                                    <p className="text-lg font-semibold text-orange-800">
                                        {stats.worst_subject}
                                    </p>
                                </div>
                            )}

                            {!stats?.best_subject && !stats?.worst_subject && (
                                <p className="text-sm text-slate-500 text-center py-4">
                                    Take more exams to see performance insights
                                </p>
                            )}
                        </motion.section>

                        {/* Quick Actions */}
                        <motion.section
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.7 }}
                            className="bg-gradient-to-br from-blue-600 to-purple-700 rounded-xl shadow-lg p-6 text-white"
                        >
                            <h3 className="font-semibold mb-4">Quick Actions</h3>
                            <div className="space-y-3">
                                <Link
                                    href="/exams"
                                    className="flex items-center gap-3 p-3 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
                                >
                                    <Play className="w-5 h-5" />
                                    <span>Browse All Exams</span>
                                </Link>
                                <Link
                                    href="/app"
                                    className="flex items-center gap-3 p-3 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
                                >
                                    <FileText className="w-5 h-5" />
                                    <span>Create New Exam</span>
                                </Link>
                            </div>
                        </motion.section>
                    </div>
                </div>
            </main>
        </div>
    );
}
