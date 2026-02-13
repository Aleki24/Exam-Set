'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { Github, Twitter, Linkedin } from 'lucide-react';

export default function Footer() {
    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const item = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 }
    };

    return (
        <footer className="py-16 px-4 border-t border-slate-200 bg-white">
            <div className="max-w-7xl mx-auto">
                <motion.div
                    variants={container}
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true }}
                    className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12"
                >
                    <motion.div variants={item} className="col-span-1 md:col-span-2 space-y-6">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg overflow-hidden">
                                <Image src="/logo1.png" alt="MaarifaExams" width={32} height={32} className="w-full h-full object-cover" />
                            </div>
                            <span className="text-xl font-bold text-slate-900">MaarifaExams</span>
                        </div>
                        <p className="text-slate-500 max-w-sm leading-relaxed">
                            Empowering educators with AI-driven assessment tools. Create, edit, and export professional exams in strict accordance with curriculum standards.
                        </p>
                        <div className="flex gap-4">
                            {/* Social placeholders */}
                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-blue-50 hover:text-blue-600 transition-colors cursor-pointer">
                                <Twitter className="w-5 h-5" />
                            </div>
                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-blue-50 hover:text-blue-600 transition-colors cursor-pointer">
                                <Github className="w-5 h-5" />
                            </div>
                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-blue-50 hover:text-blue-600 transition-colors cursor-pointer">
                                <Linkedin className="w-5 h-5" />
                            </div>
                        </div>
                    </motion.div>

                    <motion.div variants={item}>
                        <h4 className="font-bold text-slate-900 mb-6">Product</h4>
                        <ul className="space-y-4 text-slate-500">
                            <li><a href="#" className="hover:text-blue-600 transition-colors">Features</a></li>
                            <li><a href="#" className="hover:text-blue-600 transition-colors">Pricing</a></li>
                            <li><a href="#" className="hover:text-blue-600 transition-colors">Curriculum Guide</a></li>
                            <li><a href="#" className="hover:text-blue-600 transition-colors">Changelog</a></li>
                        </ul>
                    </motion.div>

                    <motion.div variants={item}>
                        <h4 className="font-bold text-slate-900 mb-6">Company</h4>
                        <ul className="space-y-4 text-slate-500">
                            <li><a href="#" className="hover:text-blue-600 transition-colors">About Us</a></li>
                            <li><a href="#" className="hover:text-blue-600 transition-colors">Careers</a></li>
                            <li><a href="#" className="hover:text-blue-600 transition-colors">Blog</a></li>
                            <li><a href="#" className="hover:text-blue-600 transition-colors">Contact</a></li>
                        </ul>
                    </motion.div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.5 }}
                    className="pt-8 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-500"
                >
                    <p>© 2024 MaarifaExams. All rights reserved.</p>
                    <div className="flex gap-8">
                        <a href="#" className="hover:text-slate-900 transition-colors">Privacy Policy</a>
                        <a href="#" className="hover:text-slate-900 transition-colors">Terms of Service</a>
                        <a href="#" className="hover:text-slate-900 transition-colors">Cookie Settings</a>
                    </div>
                </motion.div>
            </div>
        </footer>
    );
}
