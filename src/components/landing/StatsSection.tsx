'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, useInView, useMotionValue, useSpring } from 'framer-motion';

interface StatItem {
    label: string;
    value: number;
    suffix: string;
    description: string;
}

const stats: StatItem[] = [
    { label: "Active Users", value: 85, suffix: "k+", description: "Trusting our ecosystem daily." },
    { label: "Uptime", value: 99.99, suffix: "%", description: "Enterprise-grade reliability." },
    { label: "Countries", value: 120, suffix: "+", description: "Global infrastructure reach." },
    { label: "Support", value: 24, suffix: "/7", description: "Expert help whenever you need." },
];

export default function StatsSection() {
    return (
        <section className="py-24 relative overflow-hidden">
            <div className="max-w-7xl mx-auto px-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-12">
                    {stats.map((stat, index) => (
                        <div key={index} className="flex flex-col items-center text-center">
                            <div className="flex items-baseline mb-2">
                                <AnimatedNumber value={stat.value} />
                                <span className="text-4xl md:text-5xl font-bold text-blue-600">
                                    {stat.suffix}
                                </span>
                            </div>
                            <dt className="text-lg font-semibold text-slate-900 mb-1">{stat.label}</dt>
                            <dd className="text-sm text-slate-500 max-w-[150px]">{stat.description}</dd>
                        </div>
                    ))}
                </div>
            </div>

            {/* Background Decorative Element */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent -z-10" />
        </section>
    );
}

function AnimatedNumber({ value }: { value: number }) {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true, margin: "-100px" });

    const motionValue = useMotionValue(0);
    const springValue = useSpring(motionValue, {
        damping: 30,
        stiffness: 100,
    });

    const [display, setDisplay] = useState(0);

    useEffect(() => {
        if (isInView) {
            motionValue.set(value);
        }
    }, [isInView, value, motionValue]);

    useEffect(() => {
        springValue.on("change", (latest) => {
            // Use toFixed(2) for decimals like 99.99, or Math.round for integers
            setDisplay(Number(latest.toFixed(value % 1 === 0 ? 0 : 2)));
        });
    }, [springValue, value]);

    return (
        <span
            ref={ref}
            className="text-4xl md:text-6xl font-extrabold tracking-tighter text-slate-900"
        >
            {display}
        </span>
    );
}
