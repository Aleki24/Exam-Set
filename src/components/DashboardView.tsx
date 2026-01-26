'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ViewState, StoredExam, EXAM_TERM_LABELS, ExamTerm } from '@/types';

interface DashboardViewProps {
    onNavigate: (view: ViewState) => void;
    onMagicGenerate: () => void;
    recentExams: any[]; // Legacy prop for backward compatibility
    onOpenExam?: (exam: StoredExam) => void;
}

const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate, onMagicGenerate, recentExams: legacyExams, onOpenExam }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [exams, setExams] = useState<StoredExam[]>([]);
    const [loading, setLoading] = useState(false);
    const [useDatabase, setUseDatabase] = useState(true);

    // Fetch exams from database
    const fetchExams = useCallback(async (query: string = '') => {
        setLoading(true);
        try {
            const endpoint = query
                ? `/api/exams/search?q=${encodeURIComponent(query)}`
                : '/api/exams?limit=20';

            const response = await fetch(endpoint);
            if (!response.ok) throw new Error('Failed to fetch exams');

            const data = await response.json();
            setExams(data.exams || []);
            setUseDatabase(true);
        } catch (error) {
            console.error('Error fetching exams:', error);
            // Fallback to legacy exams if database fails
            setUseDatabase(false);
        } finally {
            setLoading(false);
        }
    }, []);


    // Debounced search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchQuery.trim()) {
                fetchExams(searchQuery);
            } else {
                fetchExams();
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [searchQuery, fetchExams]);

    // Use database exams or fallback to legacy
    const displayExams = useDatabase ? exams : legacyExams;

    const handleExamClick = (exam: any) => {
        if (onOpenExam && exam.pdf_url) {
            onOpenExam(exam as StoredExam);
        } else if (exam.pdf_url) {
            window.open(exam.pdf_url, '_blank');
        }
    };

    const formatDate = (dateString: string) => {
        try {
            return new Date(dateString).toLocaleDateString();
        } catch {
            return 'Unknown';
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto">
            {/* Header Area */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-black text-foreground mb-1">Welcome back, Haris 👋</h1>
                    <p className="text-sm font-medium text-muted-foreground">Here&apos;s what&apos;s happening today.</p>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={onMagicGenerate}
                        className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 rounded-lg text-xs font-bold hover:opacity-90 transition-all shadow-lg shadow-primary/20 hover:shadow-primary/30 active:scale-95"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                        Create New
                    </button>
                </div>
            </div>

            {/* Quick Access Container */}
            <div className="glass-card p-6 mb-10">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-sm font-black uppercase text-foreground tracking-wide">Quick Access</h2>
                    <button className="text-muted-foreground hover:text-foreground">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" /></svg>
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Card 1: Questions */}
                    <div
                        onClick={() => onNavigate('bank')}
                        className="bg-white/40 p-4 rounded-xl border border-white/40 hover:bg-white/60 transition-all cursor-pointer group backdrop-blur-sm"
                    >
                        <div className="w-10 h-10 bg-card text-primary rounded-lg shadow-sm flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                        </div>
                        <h3 className="font-bold text-foreground text-xs mb-1">Questions</h3>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wide">Browse & Edit</p>
                    </div>

                    {/* Card 2: Templates */}
                    <div
                        onClick={() => onNavigate('builder')}
                        className="bg-white/40 p-4 rounded-xl border border-white/40 hover:bg-white/60 transition-all cursor-pointer group backdrop-blur-sm"
                    >
                        <div className="w-10 h-10 bg-card text-primary rounded-lg shadow-sm flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                        </div>
                        <h3 className="font-bold text-foreground text-xs mb-1">Templates</h3>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wide">Design Papers</p>
                    </div>

                    {/* Card 3: Library */}
                    <div
                        onClick={() => onNavigate('library')}
                        className="bg-white/40 p-4 rounded-xl border border-white/40 hover:bg-white/60 transition-all cursor-pointer group backdrop-blur-sm"
                    >
                        <div className="w-10 h-10 bg-card text-accent-green rounded-lg shadow-sm flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" /></svg>
                        </div>
                        <h3 className="font-bold text-foreground text-xs mb-1">Library</h3>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wide">Saved Exams</p>
                    </div>

                    {/* Card 4: Magic Generate */}
                    <div
                        onClick={onMagicGenerate}
                        className="bg-gradient-to-br from-primary to-primary/80 p-4 rounded-xl shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all cursor-pointer group text-primary-foreground relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-10 transform translate-x-1/2 -translate-y-1/2">
                            <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" /></svg>
                        </div>
                        <div className="w-10 h-10 bg-primary-foreground/20 rounded-lg flex items-center justify-center mb-3 group-hover:scale-110 transition-transform backdrop-blur-sm">
                            <svg className="w-5 h-5 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        </div>
                        <h3 className="font-bold text-primary-foreground text-xs mb-1">Magic Generate</h3>
                        <p className="text-[10px] text-primary-foreground/70 font-bold uppercase tracking-wide">AI Powered</p>
                    </div>
                </div>
            </div>

            {/* Exam Search and Recent Exams */}
            <div className="glass-card p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-4">
                        <h2 className="text-sm font-black uppercase text-foreground tracking-wide">Recent Exams</h2>
                        {/* Breadcrumb style path */}
                        <div className="hidden sm:flex items-center gap-2 text-xs font-bold text-muted-foreground">
                            <span>Home</span>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                            <span className="text-foreground">Generated</span>
                        </div>
                    </div>

                    {/* Search Exams Input */}
                    <div className="relative w-full sm:w-72">
                        <input
                            type="text"
                            placeholder="Search exams..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-white/60 border border-white/40 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                        />
                        <svg
                            className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        {loading && (
                            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Table Header */}
                <div className="grid grid-cols-12 gap-4 text-[10px] font-black uppercase text-muted-foreground border-b border-border pb-3 mb-2 px-2">
                    <div className="col-span-6 md:col-span-4">Name</div>
                    <div className="hidden md:block col-span-2">Subject</div>
                    <div className="hidden md:block col-span-2">Term</div>
                    <div className="hidden md:block col-span-2">Marks</div>
                    <div className="col-span-6 md:col-span-2 text-right">Date</div>
                </div>

                {/* List Items */}
                <div className="space-y-1">
                    {loading && displayExams.length === 0 ? (
                        <div className="text-center py-10">
                            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                            <p className="text-sm text-muted-foreground">Loading exams...</p>
                        </div>
                    ) : displayExams.length > 0 ? displayExams.map((exam, i) => (
                        <div
                            key={exam.id || i}
                            onClick={() => handleExamClick(exam)}
                            className="grid grid-cols-12 gap-4 items-center p-3 hover:bg-white/40 rounded-xl transition-colors group cursor-pointer border border-transparent hover:border-white/30"
                        >
                            {/* Name Col */}
                            <div className="col-span-6 md:col-span-4 flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${i % 3 === 0 ? 'bg-primary/10 text-primary' :
                                    i % 3 === 1 ? 'bg-accent/10 text-accent' : 'bg-accent-orange/10 text-accent-orange'
                                    }`}>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">
                                        {exam.title || exam.metadata?.title || 'Untitled Exam'}
                                    </p>
                                    <p className="md:hidden text-[10px] text-muted-foreground">
                                        {exam.subject || exam.metadata?.subject}
                                    </p>
                                </div>
                            </div>

                            {/* Subject Col */}
                            <div className="hidden md:block col-span-2">
                                <span className="text-xs font-medium text-muted-foreground bg-secondary px-2 py-1 rounded-md">
                                    {exam.subject || exam.metadata?.subject || '-'}
                                </span>
                            </div>

                            {/* Term Col */}
                            <div className="hidden md:block col-span-2">
                                <span className="text-xs font-medium text-muted-foreground">
                                    {exam.term ? (EXAM_TERM_LABELS[exam.term as ExamTerm] || exam.term) : '-'}
                                </span>
                            </div>

                            {/* Marks Col */}
                            <div className="hidden md:block col-span-2 text-xs font-bold text-muted-foreground">
                                {exam.total_marks || exam.metadata?.totalMarks || 0} Marks
                            </div>

                            {/* Date Col */}
                            <div className="col-span-6 md:col-span-2 flex items-center justify-end gap-4">
                                {exam.pdf_url && (
                                    <span className="text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                        Open PDF →
                                    </span>
                                )}
                                <span className="text-xs font-medium text-muted-foreground whitespace-nowrap" suppressHydrationWarning>
                                    {formatDate(exam.created_at || exam.updatedAt)}
                                </span>
                            </div>
                        </div>
                    )) : (
                        <div className="text-center py-10 opacity-50">
                            <svg className="w-12 h-12 mx-auto mb-3 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <p className="text-sm text-muted-foreground">
                                {searchQuery ? 'No exams found matching your search.' : 'No exams generated yet.'}
                            </p>
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="mt-2 text-xs text-primary hover:underline"
                                >
                                    Clear search
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DashboardView;
