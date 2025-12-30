'use client';

import React from 'react';

interface DuplicationBadgeProps {
    usedInExamIds?: string[];
    comparisonExamId?: string;
    allExams?: { id: string; title: string }[];
}

const DuplicationBadge: React.FC<DuplicationBadgeProps> = ({
    usedInExamIds = [],
    comparisonExamId,
    allExams = [],
}) => {
    if (usedInExamIds.length === 0) return null;

    const isUsedInComparison = comparisonExamId && usedInExamIds.includes(comparisonExamId);
    const usedInExamTitles = usedInExamIds
        .map(id => allExams.find(e => e.id === id)?.title || `Exam ${id.slice(-4)}`)
        .slice(0, 3);

    return (
        <div className="relative group">
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold ${isUsedInComparison
                ? 'bg-amber-100 text-amber-700 border border-amber-200'
                : 'bg-secondary text-muted-foreground'
                }`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                <span>Used in {usedInExamIds.length} exam{usedInExamIds.length > 1 ? 's' : ''}</span>
            </div>

            {/* Tooltip */}
            <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50">
                <div className="bg-foreground text-background text-[10px] px-3 py-2 rounded-lg shadow-xl max-w-[200px] border border-white/10">
                    <p className="font-bold mb-1">Previously used in:</p>
                    <ul className="space-y-0.5">
                        {usedInExamTitles.map((title, idx) => (
                            <li key={idx} className="flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${comparisonExamId && usedInExamIds[idx] === comparisonExamId
                                    ? 'bg-amber-400'
                                    : 'bg-muted-foreground'
                                    }`} />
                                {title}
                            </li>
                        ))}
                        {usedInExamIds.length > 3 && (
                            <li className="text-zinc-400">+{usedInExamIds.length - 3} more</li>
                        )}
                    </ul>
                    {isUsedInComparison && (
                        <p className="mt-2 pt-2 border-t border-border text-amber-500 font-bold">
                            ⚠ In comparison version
                        </p>
                    )}
                </div>
                <div className="absolute left-4 top-full -mt-1 w-2 h-2 bg-foreground rotate-45 border-r border-b border-white/10" />
            </div>
        </div>
    );
};

export default DuplicationBadge;
