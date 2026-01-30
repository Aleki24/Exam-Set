'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/utils/supabase/client';
import {
    FileQuestion,
    BookOpen,
    BarChart3,
    ChevronRight,
    LogOut,
    Loader2,
    ArrowLeft,
    Search,
    Tag,
    FileText,
    Layers
} from 'lucide-react';

const adminModules = [
    {
        title: 'Question Bank',
        description: 'Choose the content and composition for your question bank.',
        href: '/admin/questions',
        icon: FileQuestion,
        gradient: 'from-[#FF6B35]/20 to-[#FF8C5A]/10',
        iconBg: 'from-[#FF6B35] to-[#FF8C5A]',
    },
    {
        title: 'Topics & Strands',
        description: 'Manage your data with research-backed topics & strands.',
        href: '/admin/topics',
        icon: Tag,
        gradient: 'from-[#00D9FF]/20 to-[#00B8E6]/10',
        iconBg: 'from-[#00D9FF] to-[#00B8E6]',
    },
    {
        title: 'Exam Builder',
        description: 'Create your exam for seamless flow and exam builder.',
        href: '/admin/templates',
        icon: Layers,
        gradient: 'from-[#8B5CF6]/20 to-[#A78BFA]/10',
        iconBg: 'from-[#8B5CF6] to-[#A78BFA]',
    },
    {
        title: 'Analytics',
        description: 'Manage your analytics and gain insights on performance.',
        href: '/admin/analytics',
        icon: BarChart3,
        gradient: 'from-[#EC4899]/20 to-[#F472B6]/10',
        iconBg: 'from-[#EC4899] to-[#F472B6]',
        disabled: true,
    },
];

export default function AdminPage() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

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
            <div className="h-screen w-full flex items-center justify-center bg-[#FAFAFA]">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className="w-8 h-8 border-4 border-[#FF6B35] border-t-transparent rounded-full"
                />
            </div>
        );
    }

    const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Admin';

    return (
        <div className="relative min-h-screen bg-[#FAFAFA] overflow-hidden">
            {/* Animated Atmospheric Gradients */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <motion.div
                    animate={{
                        x: [0, 50, 0],
                        y: [0, 30, 0],
                        scale: [1, 1.1, 1],
                    }}
                    transition={{
                        duration: 20,
                        repeat: Infinity,
                        ease: "easeInOut",
                    }}
                    className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-gradient-radial from-[#FF6B35]/10 via-[#FF6B35]/5 to-transparent blur-3xl"
                />
                <motion.div
                    animate={{
                        x: [0, -30, 0],
                        y: [0, 50, 0],
                        scale: [1, 1.15, 1],
                    }}
                    transition={{
                        duration: 25,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: 5,
                    }}
                    className="absolute -bottom-40 -right-40 w-[700px] h-[700px] rounded-full bg-gradient-radial from-[#00D9FF]/10 via-[#00D9FF]/5 to-transparent blur-3xl"
                />
                <motion.div
                    animate={{
                        x: [0, 40, 0],
                        y: [0, -40, 0],
                    }}
                    transition={{
                        duration: 18,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: 2,
                    }}
                    className="absolute top-1/3 right-1/4 w-[400px] h-[400px] rounded-full bg-gradient-radial from-[#8B5CF6]/8 via-transparent to-transparent blur-3xl"
                />
            </div>

            {/* Glassmorphism Header */}
            <header className="sticky top-0 z-50 w-full bg-[#FFFFFF80] backdrop-blur-[20px] border-b border-gray-200/50">
                <div className="max-w-7xl mx-auto px-6 lg:px-8 h-20 flex items-center justify-between">
                    {/* Left: Back + Title */}
                    <div className="flex items-center gap-4">
                        <Link
                            href="/app"
                            className="p-2.5 hover:bg-gray-100 rounded-full transition-colors group"
                        >
                            <ArrowLeft className="w-5 h-5 text-gray-500 group-hover:text-gray-900 transition-colors" />
                        </Link>
                        <span className="text-lg font-semibold text-gray-900 tracking-tight">Admin Console</span>
                    </div>

                    {/* Center: Search Bar */}
                    <div className="hidden md:flex flex-1 max-w-md mx-8">
                        <div className="relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-gray-100/80 border-0 rounded-full text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 transition-all"
                            />
                        </div>
                    </div>

                    {/* Right: Profile + Sign Out */}
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FF6B35] to-[#EC4899] flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-[#FF6B35]/20">
                                {displayName[0].toUpperCase()}
                            </div>
                            <div className="hidden sm:block text-right">
                                <p className="text-sm font-semibold text-gray-900 leading-none">{displayName}</p>
                                <p className="text-xs text-[#FF6B35] font-medium mt-0.5">Super Admin</p>
                            </div>
                        </div>

                        <button
                            onClick={handleLogout}
                            disabled={isLoggingOut}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 border border-gray-300 hover:border-gray-400 rounded-full transition-all disabled:opacity-50 bg-white/50 hover:bg-white"
                        >
                            {isLoggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                            <span className="hidden sm:inline">Sign Out</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="relative z-10 max-w-7xl mx-auto px-6 lg:px-8 py-16">
                {/* Hero Section */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="mb-16"
                >
                    <h1
                        className="text-4xl md:text-5xl font-black tracking-tight"
                        style={{
                            fontFamily: "'Archivo Black', sans-serif",
                            background: 'linear-gradient(135deg, #1F2937 0%, #FF6B35 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                        }}
                    >
                        Welcome back, {displayName.split(' ')[0]}
                    </h1>
                    <p
                        className="text-gray-500 mt-3 text-lg"
                        style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 400 }}
                    >
                        What would you like to manage today?
                    </p>
                </motion.div>

                {/* Module Grid - 4 columns on desktop */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <AnimatePresence>
                        {adminModules.map((module, index) => (
                            <motion.div
                                key={module.title}
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.4, delay: index * 0.1 }}
                            >
                                <Link
                                    href={module.disabled ? '#' : module.href}
                                    onClick={(e) => module.disabled && e.preventDefault()}
                                    className={`group relative block h-full bg-white rounded-xl p-5 transition-all duration-300 ${module.disabled
                                            ? 'cursor-not-allowed opacity-60'
                                            : 'hover:-translate-y-1.5 hover:shadow-xl'
                                        }`}
                                    style={{
                                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                                        borderRadius: '12px',
                                    }}
                                >
                                    {/* Icon Container */}
                                    <div
                                        className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${module.iconBg} flex items-center justify-center text-white mb-5 transition-transform duration-300 ${!module.disabled ? 'group-hover:rotate-[15deg]' : ''
                                            }`}
                                        style={{
                                            boxShadow: `0 8px 20px -4px ${module.iconBg.includes('FF6B35') ? 'rgba(255,107,53,0.3)' :
                                                module.iconBg.includes('00D9FF') ? 'rgba(0,217,255,0.3)' :
                                                    module.iconBg.includes('8B5CF6') ? 'rgba(139,92,246,0.3)' :
                                                        'rgba(236,72,153,0.3)'}`
                                        }}
                                    >
                                        <module.icon className="w-7 h-7" />
                                    </div>

                                    {/* Title */}
                                    <h3
                                        className="text-lg font-bold text-gray-900 mb-2"
                                        style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700 }}
                                    >
                                        {module.title}
                                    </h3>

                                    {/* Description - 2 lines */}
                                    <p
                                        className="text-gray-500 text-sm leading-relaxed line-clamp-2 mb-4"
                                        style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 300 }}
                                    >
                                        {module.description}
                                    </p>

                                    {/* Explore Link */}
                                    {!module.disabled ? (
                                        <div className="flex items-center justify-end">
                                            <span
                                                className="text-sm font-medium text-gray-400 group-hover:text-[#FF6B35] transition-colors flex items-center gap-1"
                                                style={{ fontFamily: "'Outfit', sans-serif" }}
                                            >
                                                Explore
                                                <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-end">
                                            <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
                                                Coming Soon
                                            </span>
                                        </div>
                                    )}

                                    {/* Subtle gradient overlay on hover */}
                                    <div
                                        className={`absolute inset-0 rounded-xl bg-gradient-to-br ${module.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none`}
                                    />
                                </Link>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
}