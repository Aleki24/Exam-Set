'use client';

import { motion } from 'framer-motion';
import {
    Shield,
    FileText,
    Zap,
    Brain,
    Sparkles,
    BarChart3
} from 'lucide-react';

const features = [
    {
        title: "Verified Exam Repository",
        description: "Access thousands of ready-to-use questions and exams. Pre-vetted for CBC and KNEC standards.",
        icon: <Shield className="w-6 h-6 text-blue-500" />,
        className: "md:col-span-2 md:row-span-2 bg-blue-50/50",
    },
    {
        title: "Manual Builder",
        description: "Build exams your way with our massive question bank.",
        icon: <FileText className="w-6 h-6 text-indigo-500" />,
        className: "md:col-span-1 md:row-span-1 bg-indigo-50/50",
    },
    {
        title: "Instant PDF Export",
        description: "Print-ready with automatic cover pages.",
        icon: <Zap className="w-6 h-6 text-cyan-500" />,
        className: "md:col-span-1 md:row-span-1 bg-cyan-50/50",
    },
    {
        title: "Smart AI Assistant",
        description: "Let our AI suggest relevant questions to fill gaps in your exam paper instantly.",
        icon: <Brain className="w-6 h-6 text-amber-500" />,
        className: "md:col-span-2 md:row-span-1 bg-amber-50/50",
    },
    {
        title: "Curriculum Aligned",
        description: "Strict adherence to CBC and National standards.",
        icon: <Sparkles className="w-6 h-6 text-rose-500" />,
        className: "md:col-span-2 md:row-span-1 bg-rose-50/50",
    },
];

export default function FeaturesSection() {
    return (
        <section id="features" className="max-w-7xl mx-auto px-6 py-24">
            <div className="text-center mb-16">
                <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mb-4 tracking-tight">
                    Everything you need to scale
                </h2>
                <p className="text-slate-500 text-lg max-w-2xl mx-auto">
                    Built by educators, for educators. A complete toolkit to streamline your assessment workflow.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 auto-rows-[minmax(240px,auto)]">

                {/* Feature 1: Verified Repo (Wide) */}
                <motion.div className="md:col-span-2 md:row-span-2 group relative overflow-hidden rounded-3xl bg-white border border-slate-200 p-8 shadow-sm hover:shadow-xl transition-all duration-300">
                    <div className="relative z-10 h-full flex flex-col justify-between">
                        <div>
                            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mb-6 text-blue-600"><Shield className="w-6 h-6" /></div>
                            <h3 className="text-xl font-bold text-slate-900 mb-2">Verified Repository</h3>
                            <p className="text-slate-500">Thousands of CBC & KNEC questions.</p>
                        </div>

                        {/* Visual: File List */}
                        <div className="mt-8 space-y-2 relative">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100 transform group-hover:translate-x-2 transition-transform" style={{ transitionDelay: `${i * 50}ms` }}>
                                    <div className="w-8 h-8 rounded bg-white border border-slate-200 flex items-center justify-center text-[10px] font-bold text-red-500">PDF</div>
                                    <div className="flex-1 h-2 bg-slate-200 rounded min-w-0" />
                                    <div className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-[10px]">✓</div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-blue-50/30 opacity-0 group-hover:opacity-100 transition-opacity" />
                </motion.div>

                {/* Feature 2: Manual Builder (Tall) */}
                <motion.div className="md:col-span-1 md:row-span-2 group relative overflow-hidden rounded-3xl bg-white border border-slate-200 p-8 shadow-sm hover:shadow-xl transition-all duration-300">
                    <div className="relative z-10 h-full flex flex-col">
                        <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center mb-6 text-indigo-600"><FileText className="w-6 h-6" /></div>
                        <h3 className="text-xl font-bold text-slate-900 mb-2">Builder</h3>
                        <p className="text-slate-500 mb-8">Drag & drop construction.</p>

                        {/* Visual: Stacked Blocks */}
                        <div className="flex-1 relative space-y-2 mask-linear-fade">
                            <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100 text-xs text-indigo-700 font-mono">Question 1...</div>
                            <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100 text-xs text-indigo-700 font-mono opacity-80">Question 2...</div>
                            <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100 text-xs text-indigo-700 font-mono opacity-60">Question 3...</div>

                            <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-white to-transparent" />
                        </div>
                    </div>
                </motion.div>

                {/* Feature 3: AI Assistant (Standard) */}
                <motion.div className="md:col-span-1 md:row-span-1 group relative overflow-hidden rounded-3xl bg-slate-900	 text-white p-8 shadow-lg hover:shadow-2xl transition-all duration-300">
                    <div className="absolute top-0 right-0 p-3 opacity-20"><Sparkles className="w-24 h-24 rotate-12" /></div>
                    <div className="relative z-10">
                        <Brain className="w-8 h-8 mb-4 text-blue-400" />
                        <h3 className="text-lg font-bold mb-1">AI Powered</h3>
                        <p className="text-slate-400 text-sm">Instant suggestions.</p>
                    </div>
                </motion.div>

                {/* Feature 4: PDF Export (Standard) */}
                <motion.div className="md:col-span-1 md:row-span-1 group relative overflow-hidden rounded-3xl bg-white border border-slate-200 p-8 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-center">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600"><Zap className="w-5 h-5" /></div>
                        <div className="text-3xl font-bold text-slate-900">0.2s</div>
                    </div>
                    <p className="text-slate-500 font-medium">Export time</p>
                </motion.div>

                {/* Feature 5: Bloom's (Wide) */}
                <motion.div className="md:col-span-2 md:row-span-1 group relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 to-purple-600 p-8 shadow-lg text-white">
                    <div className="flex justify-between items-center relative z-10">
                        <div>
                            <h3 className="text-xl font-bold mb-2">Cognitive Analysis</h3>
                            <p className="text-indigo-100">Ensure balanced assessments automatically.</p>
                        </div>
                        <BarChart3 className="w-12 h-12 text-white/50" />
                    </div>
                </motion.div>

            </div>
        </section>
    );
}
