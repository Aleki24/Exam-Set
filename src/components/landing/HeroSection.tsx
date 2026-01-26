'use client';

import { motion, Variants } from 'framer-motion';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import FloatingOrbs from './FloatingOrbs';

export default function HeroSection() {
    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.2, delayChildren: 0.3 },
        },
    };

    const itemVariants: Variants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
    };

    return (
        <section className="relative pt-32 pb-20 px-6 overflow-hidden">
            <FloatingOrbs />

            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="max-w-5xl mx-auto text-center relative z-10"
            >
                {/* Animated Badge */}
                <motion.div variants={itemVariants} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-600 text-xs font-bold uppercase tracking-wider mb-6">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
                    </span>
                    #1 Platform for CBC & International Exams
                </motion.div>

                {/* The Headline with Gradient Shimmer */}
                <motion.h1 variants={itemVariants} className="text-5xl md:text-7xl font-bold tracking-tighter text-slate-900 mb-6">
                    Access the Largest <br />
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-indigo-500 to-blue-600 bg-[length:200%_auto] animate-gradient">
                        Verified Exam Repository
                    </span>
                </motion.h1>

                <motion.p variants={itemVariants} className="text-lg md:text-xl text-slate-600 max-w-2xl mx-auto mb-10 leading-relaxed">
                    Download thousands of expert-verified CBC, IGCSE, and Cambridge past papers instantly. Or build your own custom exams manually using our massive question bank.
                </motion.p>

                {/* Buttons with Micro-interactions */}
                <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        <Link
                            href="/auth/signup"
                            className="group relative px-8 py-4 bg-blue-600 text-white rounded-full font-semibold shadow-lg shadow-blue-500/25 flex items-center gap-2 overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-shimmer" />
                            Browse Repository
                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </Link>
                    </motion.div>

                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                        <Link
                            href="/auth/signup"
                            className="px-8 py-4 text-slate-700 font-semibold bg-white border border-slate-200 rounded-full hover:bg-slate-50 transition-colors shadow-sm"
                        >
                            Create Manually
                        </Link>
                    </motion.div>
                </motion.div>

                {/* ... existing buttons ... */}

                {/* 3D Perspective Mockup */}
                <motion.div
                    variants={itemVariants}
                    className="relative mt-20 mx-auto max-w-6xl"
                >
                    <div className="relative rounded-xl bg-slate-900/5 p-2 ring-1 ring-inset ring-slate-900/10 lg:-m-4 lg:rounded-2xl lg:p-4">
                        <Image
                            src="/hero-dashboard.png"
                            alt="ExamGenius Dashboard Preview"
                            width={1364}
                            height={866}
                            quality={100}
                            className="rounded-md shadow-2xl ring-1 ring-slate-900/10"
                            priority
                        />
                    </div>

                    {/* Decor */}
                    <div className="absolute -inset-4 -z-10 bg-gradient-to-tr from-blue-600/20 via-primary/20 to-indigo-600/20 blur-2xl rounded-[3rem] opacity-50 block" />
                </motion.div>

            </motion.div>
        </section>
    );
}
