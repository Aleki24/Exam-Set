'use client';

import React from 'react';
import { motion } from 'framer-motion';

export default function FloatingOrbs() {
    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {/* Blue Orb */}
            <motion.div
                animate={{
                    y: [-20, 20, -20],
                    rotate: [0, 180, 360],
                    scale: [1, 1.1, 1]
                }}
                transition={{
                    duration: 20,
                    repeat: Infinity,
                    ease: "easeInOut"
                }}
                className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-400/20 blur-[120px]"
            />

            {/* Purple Orb */}
            <motion.div
                animate={{
                    y: [20, -20, 20],
                    rotate: [360, 180, 0],
                    scale: [1.1, 1, 1.1]
                }}
                transition={{
                    duration: 25,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 2
                }}
                className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-400/20 blur-[120px]"
            />

            {/* Cyan/Teal Orb - middle */}
            <motion.div
                animate={{
                    x: [-30, 30, -30],
                    y: [-10, 10, -10],
                }}
                transition={{
                    duration: 18,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 5
                }}
                className="absolute top-[30%] right-[20%] w-[30%] h-[30%] rounded-full bg-cyan-400/10 blur-[100px]"
            />
        </div>
    );
}
