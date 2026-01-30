'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/utils/supabase/client';
import {
    FileQuestion,
    BookOpen,
    Users,
    Settings,
    BarChart3,
    Database,
    ChevronRight,
    LogOut,
    Loader2,
    ArrowLeft,
    Plus,
    Tag,
    FileText
} from 'lucide-react';

// Components
import GridBackground from '@/components/landing/GridBackground';
import SectionWrapper from '@/components/SectionWrapper';

const adminSections = [
    {
        title: 'Question Bank',
        description: 'Add, edit, and manage exam questions for all levels.',
        href: '/admin/questions',
        icon: FileQuestion,
        color: 'from-blue-500 to-indigo-600',
        size: 'md:col-span-2'
    },
    {
        title: 'Topics & Strands',
        description: 'Manage subject topics, strands, and themes.',
        href: '/admin/topics',
        icon: Tag,
        color: 'from-teal-500 to-cyan-600',
        size: 'md:col-span-1'
    },
    {
        title: 'Paper Templates',
        description: 'Create exam paper structures and section rules.',
        href: '/admin/templates',
        icon: FileText,
        color: 'from-violet-500 to-purple-600',
        size: 'md:col-span-1'
    },
    {
        title: 'Analytics',
        description: 'Usage statistics and reports.',
        href: '/admin/analytics',
        icon: BarChart3,
        color: 'from-pink-500 to-rose-600',
        size: 'md:col-span-1',
        disabled: true,
    },
    {
        title: 'Curriculums',
        description: 'Manage grade levels.',
        href: '/admin/curriculums',
        icon: BookOpen,
        color: 'from-purple-500 to-fuchsia-600',
        size: 'md:col-span-1',
        disabled: true,
    },
    {
        title: 'Users',
        description: 'Accounts and permissions.',
        href: '/admin/users',
        icon: Users,
        color: 'from-orange-500 to-amber-600',
        size: 'md:col-span-1',
        disabled: true,
    },
    {
        title: 'Subjects',
        description: 'Topics and tagging.',
        href: '/admin/subjects',
        icon: Database,
        color: 'from-emerald-500 to-teal-600',
        size: 'md:col-span-1',
        disabled: true,
    },
    {
        title: 'Settings',
        description: 'System configuration.',
        href: '/admin/settings',
        icon: Settings,
        color: 'from-slate-500 to-slate-700',
        size: 'md:col-span-1',
        disabled: true,
    },
];

export default function AdminPage() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const supabase = createClient();
        supabase.auth.getUser().then(({ data }) => {
            setUser(data.user);
            setIsLoading(false);
        });
    }, []);

    const handleLogout = async () => {
        setIsLoggingOut(true);
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push('/auth/login');
        router.refresh();
    };

    if (isLoading) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-white">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"
                />
            </div>
        );
    }

    const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Admin';

    return (
        <div className="relative min-h-screen bg-[#fafafa] selection:bg-blue-500/30 overflow-x-hidden">
            <GridBackground />

            {/* Header / Navbar */}
            <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-white/60 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/app"
                            className="p-2 hover:bg-black/5 rounded-full transition-colors group"
                        >
                            <ArrowLeft className="w-5 h-5 text-muted-foreground group-hover:text-foreground" />
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold text-foreground tracking-tight">Admin Console</h1>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">System Overview</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="hidden md:flex items-center gap-3 pr-4 border-r border-border/40">
                            <div className="text-right">
                                <p className="text-sm font-semibold text-foreground leading-none">{displayName}</p>
                                <p className="text-xs text-muted-foreground mt-1">Super Admin</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-purple-600 flex items-center justify-center text-primary-foreground font-bold shadow-md shadow-primary/20">
                                {displayName[0].toUpperCase()}
                            </div>
                        </div>

                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleLogout}
                            disabled={isLoggingOut}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary hover:opacity-90 rounded-full transition-all disabled:opacity-50 shadow-lg shadow-primary/20"
                        >
                            {isLoggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                            <span>Sign Out</span>
                        </motion.button>
                    </div>
                </div>
            </header>

            <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                {/* Welcome Heading */}
                <SectionWrapper>
                    <div className="mb-12">
                        <h2 className="text-3xl md:text-4xl font-black text-foreground tracking-tight gradient-text inline-block">
                            Welcome back, {displayName.split(' ')[0]}
                        </h2>
                        <p className="text-muted-foreground mt-2 text-lg font-medium">What would you like to manage today?</p>
                    </div>
                </SectionWrapper>

                {/* Bento Grid Sections */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <AnimatePresence>
                        {adminSections.map((section, index) => (
                            <SectionWrapper key={section.title} delay={index * 0.1} className={section.size}>
                                <Link
                                    href={section.disabled ? '#' : section.href}
                                    onClick={(e) => section.disabled && e.preventDefault()}
                                    className={`group relative block h-full p-8 glass-card transition-all overflow-hidden ${section.disabled
                                        ? 'cursor-not-allowed opacity-60'
                                        : 'hover:shadow-xl hover:shadow-primary/5 hover:border-primary/20 hover:scale-[1.01]'
                                        }`}
                                >
                                    <div className="relative z-10 flex flex-col h-full">
                                        <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${section.color} flex items-center justify-center text-white mb-6 shadow-lg shadow-inherit opacity-90 group-hover:opacity-100 transition-opacity`}>
                                            <section.icon className="w-6 h-6" />
                                        </div>

                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className="text-xl font-bold text-foreground">{section.title}</h3>
                                            {!section.disabled && (
                                                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                                            )}
                                        </div>

                                        <p className="text-muted-foreground leading-relaxed font-medium text-sm">
                                            {section.description}
                                        </p>

                                        {section.disabled && (
                                            <div className="mt-4">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-secondary text-secondary-foreground border border-border">
                                                    Coming Soon
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Hover background effect */}
                                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                </Link>
                            </SectionWrapper>
                        ))}
                    </AnimatePresence>
                </div>

                {/* Quick Actions Bar */}
                <SectionWrapper delay={0.4}>
                    <div className="mt-12 p-8 bg-black rounded-[2.5rem] text-white overflow-hidden relative shadow-2xl shadow-primary/20">
                        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                            <div>
                                <h3 className="text-2xl font-bold">Quick Actions</h3>
                                <p className="text-white/60 mt-1 font-medium">Jump straight into high-priority tasks.</p>
                            </div>
                            <div className="flex flex-wrap gap-4">
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => router.push('/admin/questions?new=true')}
                                    className="flex items-center gap-2 px-6 py-3 bg-white text-black hover:bg-white/90 rounded-full font-bold transition-all shadow-lg shadow-white/10"
                                >
                                    <Plus className="w-5 h-5" />
                                    New Question
                                </motion.button>
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    className="flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 rounded-full font-bold backdrop-blur-sm transition-all text-white border border-white/10"
                                >
                                    <BarChart3 className="w-5 h-5" />
                                    System Health
                                </motion.button>
                            </div>
                        </div>

                        {/* Decorative Background for Quick Actions */}
                        <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-96 h-96 bg-gradient-to-br from-primary to-purple-600 blur-[100px] rounded-full opacity-50" />
                    </div>
                </SectionWrapper>
            </main>
        </div>
    );
}