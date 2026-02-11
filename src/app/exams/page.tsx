'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/utils/supabase/client';
import {
    BookOpen,
    Clock,
    FileText,
    Play,
    Loader2,
    ArrowLeft,
    Search,
    Filter,
    ChevronRight,
    Award
} from 'lucide-react';
import { getAvailableExams } from '@/services/examSessionService';
import { StoredExam } from '@/types';

export default function BrowseExamsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [exams, setExams] = useState<StoredExam[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSubject, setSelectedSubject] = useState<string>('all');

    useEffect(() => {
        async function loadExams() {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                router.push('/auth/login');
                return;
            }

            const available = await getAvailableExams();
            setExams(available);
            setLoading(false);
        }
        loadExams();
    }, [router]);

    // Get unique subjects for filter
    const subjects = Array.from(new Set(exams.map(e => e.subject).filter(Boolean)));

    // Filter exams
    const filteredExams = exams.filter(exam => {
        const matchesSearch = !searchQuery ||
            exam.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            exam.subject?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesSubject = selectedSubject === 'all' || exam.subject === selectedSubject;
        return matchesSearch && matchesSubject;
    });

    if (loading) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                >
                    <Loader2 className="w-8 h-8 text-blue-600" />
                </motion.div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
            {/* Header */}
            <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/dashboard"
                            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5 text-slate-600" />
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold text-slate-800">Browse Exams</h1>
                            <p className="text-sm text-slate-500">{filteredExams.length} exams available</p>
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
                            href="/dashboard"
                            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg flex items-center gap-2"
                        >
                            <Award className="w-4 h-4" />
                            <span className="hidden sm:inline">Dashboard</span>
                        </Link>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 py-8">
                {/* Search & Filter Bar */}
                <div className="flex flex-col sm:flex-row gap-4 mb-8">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search exams by title or subject..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all shadow-sm"
                        />
                    </div>
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <select
                            value={selectedSubject}
                            onChange={(e) => setSelectedSubject(e.target.value)}
                            className="pl-10 pr-8 py-3 bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all shadow-sm appearance-none cursor-pointer min-w-[180px]"
                        >
                            <option value="all">All Subjects</option>
                            {subjects.map(s => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Exam Cards Grid */}
                {filteredExams.length === 0 ? (
                    <div className="text-center py-20">
                        <BookOpen className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-slate-600 mb-2">
                            {searchQuery ? 'No exams match your search' : 'No exams available yet'}
                        </h3>
                        <p className="text-slate-400">
                            {searchQuery
                                ? 'Try adjusting your search or filter'
                                : 'Check back later or create one in the Exam Builder'
                            }
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        <AnimatePresence>
                            {filteredExams.map((exam, index) => (
                                <motion.div
                                    key={exam.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.05, duration: 0.3 }}
                                >
                                    <div className="group bg-white rounded-2xl border border-slate-200 hover:border-blue-300 hover:shadow-lg transition-all duration-300 overflow-hidden">
                                        {/* Card Header */}
                                        <div className="p-6 pb-4">
                                            <div className="flex items-start justify-between mb-3">
                                                <span className="inline-block px-3 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">
                                                    {exam.subject || 'General'}
                                                </span>
                                                {exam.grade_name && (
                                                    <span className="text-xs text-slate-400">{exam.grade_name}</span>
                                                )}
                                            </div>
                                            <h3 className="text-lg font-semibold text-slate-800 mb-2 line-clamp-2 group-hover:text-blue-700 transition-colors">
                                                {exam.title}
                                            </h3>
                                            {exam.curriculum_name && (
                                                <p className="text-sm text-slate-500 mb-3">{exam.curriculum_name}</p>
                                            )}
                                        </div>

                                        {/* Card Stats */}
                                        <div className="px-6 pb-4 flex items-center gap-4 text-sm text-slate-500">
                                            <div className="flex items-center gap-1.5">
                                                <FileText className="w-4 h-4" />
                                                <span>{exam.question_count} questions</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <Award className="w-4 h-4" />
                                                <span>{exam.total_marks} marks</span>
                                            </div>
                                            {exam.time_limit && (
                                                <div className="flex items-center gap-1.5">
                                                    <Clock className="w-4 h-4" />
                                                    <span>{exam.time_limit}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Card Action */}
                                        <div className="px-6 pb-6">
                                            <Link
                                                href={`/exam/${exam.id}`}
                                                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium rounded-xl transition-all duration-200 shadow-sm hover:shadow-md group/btn"
                                            >
                                                <Play className="w-4 h-4" />
                                                Start Exam
                                                <ChevronRight className="w-4 h-4 opacity-0 -ml-2 group-hover/btn:opacity-100 group-hover/btn:ml-0 transition-all" />
                                            </Link>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </main>
        </div>
    );
}
