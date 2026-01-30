'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Globe, BookOpen, GraduationCap } from 'lucide-react';

export default function LogoScroll() {
    const logos = [
        { name: "CBC / KNEC", icon: GraduationCap },
        { name: "Top National Schools", icon: BookOpen },
        { name: "Ministry of Education", icon: Globe },
        { name: "TSC Approved", icon: Globe },
        { name: "Private Academies", icon: BookOpen },
    ];

    return (
        <section className="relative py-6 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 overflow-hidden border-y border-slate-200/50">
            {/* Heading - Fixed position, always visible */}
            <div className="max-w-7xl mx-auto px-4 mb-4">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center">
                    Trusted by 500+ schools worldwide
                </p>
            </div>

            {/* Scrolling Logos */}
            <div className="relative">
                <div className="flex">
                    <motion.div
                        animate={{ x: ["-100%", "0%"] }}
                        transition={{
                            duration: 40,
                            ease: "linear",
                            repeat: Infinity,
                            repeatType: "loop"
                        }}
                        className="flex gap-12 md:gap-20 items-center shrink-0"
                    >
                        {[...logos, ...logos, ...logos, ...logos].map((logo, i) => (
                            <div
                                key={i}
                                className="flex items-center gap-3 opacity-50 hover:opacity-100 transition-opacity duration-300 cursor-default"
                            >
                                <logo.icon className="w-6 h-6 text-slate-400" />
                                <span className="text-sm font-medium text-slate-600 whitespace-nowrap">{logo.name}</span>
                            </div>
                        ))}
                    </motion.div>
                </div>

                {/* Fade edges */}
                <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-blue-50 to-transparent pointer-events-none" />
                <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-purple-50 to-transparent pointer-events-none" />
            </div>
        </section>
    );
}
