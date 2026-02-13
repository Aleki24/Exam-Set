'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { Sparkles, Menu, X } from 'lucide-react';

export default function Navbar() {
    const [isScrolled, setIsScrolled] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const { scrollY } = useScroll();

    useEffect(() => {
        const unsubscribe = scrollY.on("change", (latest) => {
            setIsScrolled(latest > 50);
        });
        return () => unsubscribe();
    }, [scrollY]);

    return (
        <motion.nav
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled
                ? 'bg-white/70 backdrop-blur-xl border-b border-slate-200/50 shadow-sm supports-[backdrop-filter]:bg-white/60'
                : 'bg-transparent border-transparent'
                }`}
        >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-20">
                    {/* Logo */}
                    <div className="flex items-center gap-2.5 cursor-pointer group" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                        <motion.div
                            whileHover={{ rotate: 15 }}
                            className="relative w-9 h-9 flex items-center justify-center bg-blue-600 rounded-lg shadow-lg shadow-blue-500/20"
                        >
                            <Sparkles className="w-4 h-4 text-white" />
                        </motion.div>
                        <span className={`text-lg font-bold tracking-tighter transition-colors ${isScrolled ? 'text-slate-900' : 'text-slate-800'}`}>
                            MaarifaExams
                        </span>
                    </div>

                    {/* Desktop Nav */}
                    <div className="hidden md:flex items-center gap-8">
                        <div className="flex items-center gap-6 text-sm font-medium">
                            {['Features', 'How it Works', 'Pricing'].map((item) => (
                                <a
                                    key={item}
                                    href={`#${item.toLowerCase().replace(/\s+/g, '-')}`}
                                    className={`transition-colors hover:text-blue-600 ${isScrolled ? 'text-slate-600' : 'text-slate-700'}`}
                                >
                                    {item}
                                </a>
                            ))}
                        </div>

                        <div className="flex items-center gap-3 pl-6 border-l border-slate-200">
                            <Link
                                href="/auth/login"
                                className={`text-sm font-medium transition-colors hover:text-blue-600 ${isScrolled ? 'text-slate-600' : 'text-slate-700'}`}
                            >
                                Sign In
                            </Link>
                            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                                <Link
                                    href="/auth/signup"
                                    className="px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/10"
                                >
                                    Get Started
                                </Link>
                            </motion.div>
                        </div>
                    </div>

                    {/* Mobile Menu Button */}
                    <div className="md:hidden">
                        <button
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            className="p-2 text-slate-600 hover:text-slate-900 transition-colors"
                        >
                            {mobileMenuOpen ? <X /> : <Menu />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Menu */}
            <AnimatePresence>
                {mobileMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="md:hidden bg-white border-b border-slate-200 overflow-hidden"
                    >
                        <div className="px-4 py-6 space-y-4">
                            {['Features', 'How it Works', 'Pricing'].map((item) => (
                                <a
                                    key={item}
                                    href={`#${item.toLowerCase().replace(/\s+/g, '-')}`}
                                    onClick={() => setMobileMenuOpen(false)}
                                    className="block text-base font-medium text-slate-600 hover:text-blue-600"
                                >
                                    {item}
                                </a>
                            ))}
                            <div className="pt-4 border-t border-slate-100 flex flex-col gap-3">
                                <Link
                                    href="/auth/login"
                                    className="block text-base font-medium text-slate-600 hover:text-blue-600"
                                >
                                    Sign In
                                </Link>
                                <Link
                                    href="/auth/signup"
                                    className="block w-full py-3 text-center text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                    Get Started Pro
                                </Link>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.nav>
    );
}
