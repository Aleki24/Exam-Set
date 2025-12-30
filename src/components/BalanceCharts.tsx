'use client';

import React, { useMemo } from 'react';
import { Question } from '@/types';

interface BalanceChartsProps {
    questions: Question[];
}

const BalanceCharts: React.FC<BalanceChartsProps> = ({ questions }) => {
    const difficultyCounts = useMemo(() => {
        const counts: Record<string, number> = { Easy: 0, Medium: 0, Difficult: 0 };
        questions.forEach(q => {
            if (counts[q.difficulty] !== undefined) counts[q.difficulty]++;
        });
        return counts;
    }, [questions]);

    const bloomsCounts = useMemo(() => {
        const counts: Record<string, number> = {
            'Knowledge': 0, 'Understanding': 0, 'Application': 0,
            'Analysis': 0, 'Evaluation': 0, 'Creation': 0
        };
        questions.forEach(q => {
            const level = q.bloomsLevel || 'Knowledge';
            if (counts[level] !== undefined) counts[level]++;
        });
        return counts;
    }, [questions]);

    // Colors for visualization
    const diffColors: Record<string, string> = { Easy: 'oklch(0.769 0.188 170.046)', Medium: 'oklch(0.817 0.186 70.386)', Difficult: 'oklch(0.632 0.253 26.262)' };
    const bloomsColors: Record<string, string> = {
        'Knowledge': 'oklch(0.707 0.022 261.325)',
        'Understanding': 'oklch(0.553 0.013 285.938)',
        'Application': 'oklch(0.705 0.158 244.661)',
        'Analysis': 'oklch(0.588 0.158 241.966)',
        'Evaluation': 'oklch(0.484 0.158 242.067)',
        'Creation': 'oklch(0.403 0.158 242.47)'
    };

    const total = questions.length || 1;

    const renderDifficultyBar = () => {
        return (
            <div className="bg-card p-5 rounded-3xl border border-border shadow-sm flex flex-col justify-between h-full">
                <h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em] mb-4">Difficulty Balance</h4>

                {/* Simple Stacked Bar Visual */}
                <div className="flex h-4 rounded-full overflow-hidden mb-4 bg-secondary w-full">
                    {Object.keys(difficultyCounts).map(key => {
                        const width = (difficultyCounts[key] / total) * 100;
                        if (width === 0) return null;
                        return (
                            <div key={key} style={{ width: `${width}%`, backgroundColor: diffColors[key] }} title={`${key}: ${difficultyCounts[key]}`} />
                        );
                    })}
                </div>

                {/* Legend */}
                <div className="space-y-2">
                    {Object.keys(difficultyCounts).map(key => (
                        <div key={key} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: diffColors[key] }}></div>
                                <span className="font-bold text-foreground">{key}</span>
                            </div>
                            <span className="font-bold text-muted-foreground">{Math.round((difficultyCounts[key] / total) * 100)}%</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // Pie Chart Logic using CSS Conic Gradient
    const renderBloomsChart = () => {
        let gradientString = '';
        let accumulated = 0;
        const keys = Object.keys(bloomsCounts);

        // Build the gradient string for the pie chart
        keys.forEach((key, idx) => {
            const value = bloomsCounts[key];
            const percentage = (value / total) * 100;
            const color = bloomsColors[key];
            const start = accumulated;
            const end = accumulated + percentage;
            accumulated = end;
            gradientString += `${color} ${start}% ${end}%${idx < keys.length - 1 ? ', ' : ''}`;
        });

        if (questions.length === 0) gradientString = '#f1f5f9 0% 100%';

        return (
            <div className="bg-card p-5 rounded-3xl border border-border shadow-sm h-full flex flex-col">
                <div className="flex items-center justify-between mb-4">
                    <h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em]">Cognitive Profile</h4>
                    <span className="text-[9px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">Bloom&apos;s</span>
                </div>

                <div className="flex items-center gap-4 flex-1">
                    <div className="relative w-20 h-20 rounded-full shrink-0 shadow-inner border-4 border-secondary" style={{ background: `conic-gradient(${gradientString})` }}>
                        <div className="absolute inset-0 m-auto w-10 h-10 bg-card rounded-full flex items-center justify-center text-[9px] font-black text-muted-foreground">
                            {questions.length}
                        </div>
                    </div>

                    <div className="flex-1 space-y-1 overflow-y-auto max-h-[140px] pr-2 custom-scrollbar">
                        {Object.keys(bloomsCounts).map(key => {
                            if (bloomsCounts[key] === 0) return null;
                            return (
                                <div key={key} className="flex items-center justify-between text-[10px]">
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: bloomsColors[key] }}></div>
                                        <span className="font-bold text-foreground truncate max-w-[80px]">{key}</span>
                                    </div>
                                    <span className="font-bold text-muted-foreground">{Math.round((bloomsCounts[key] / total) * 100)}%</span>
                                </div>
                            );
                        })}
                        {questions.length === 0 && <span className="text-[10px] text-muted-foreground italic">No data</span>}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
            {renderDifficultyBar()}
            {renderBloomsChart()}
        </div>
    );
};

export default BalanceCharts;
