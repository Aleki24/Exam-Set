'use client';

import React from 'react';
import { motion } from 'framer-motion';

/**
 * SectionWrapper: Standardizes how sections enter the viewport
 * Features: Staggered Fade-in, Subtle Lift, and Viewport Trigger
 */
export default function SectionWrapper({
    children,
    delay = 0,
    className
}: {
    children: React.ReactNode;
    delay?: number;
    className?: string
}) {
    return (
        <motion.section
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{
                duration: 0.8,
                delay: delay,
                ease: [0.21, 0.47, 0.32, 0.98] // Custom "ease-out" for premium feel
            }}
            className={className}
        >
            {children}
        </motion.section>
    );
}
