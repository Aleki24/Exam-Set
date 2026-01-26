'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Sparkles, Check } from 'lucide-react';

export default function PricingSection() {
    return (
        <section id="pricing" className="py-24 px-4 bg-slate-50">
            <div className="max-w-4xl mx-auto relative">
                {/* Animated Glow Behind */}
                <motion.div
                    animate={{ scale: [1, 1.02, 1], opacity: [0.5, 0.8, 0.5] }}
                    transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-[2.5rem] blur-xl opacity-40"
                />

                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="relative bg-white border border-slate-200 rounded-[2rem] p-12 lg:p-16 text-center overflow-hidden shadow-2xl shadow-slate-200/50"
                >
                    {/* Rotating Border Gradient using conic-gradient mask or simple implementation */}

                    <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
                        <Sparkles className="w-64 h-64 text-slate-900" />
                    </div>

                    <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6 tracking-tight">
                        Start creating better exams today.
                    </h2>
                    <p className="text-xl text-slate-600 mb-10 max-w-2xl mx-auto">
                        Join thousands of educators saving hours every week. No credit card required for free tier.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                            <Link
                                href="/auth/signup"
                                className="w-full sm:w-auto px-10 py-5 bg-blue-600 text-white text-lg font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/30 inline-block"
                            >
                                Get Started for Free
                            </Link>
                        </motion.div>

                        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                            <Link
                                href="/auth/login"
                                className="w-full sm:w-auto px-10 py-5 bg-white text-slate-700 text-lg font-bold rounded-xl hover:bg-slate-50 transition-colors border border-slate-200 shadow-sm inline-block"
                            >
                                Contact Sales
                            </Link>
                        </motion.div>
                    </div>

                    <p className="mt-8 text-sm text-slate-500 font-medium">
                        Includes 14-day free trial of Pro features. Cancel anytime.
                    </p>
                </motion.div>
            </div>
        </section>
    );
}
