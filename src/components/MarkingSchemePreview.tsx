'use client';

import React from 'react';
import { ExamPaper } from '@/types';

interface MarkingSchemePreviewProps {
    paper: ExamPaper;
}

const MarkingSchemePreview: React.FC<MarkingSchemePreviewProps> = ({ paper }) => {
    const { metadata, questions } = paper;

    const getFontFamily = () => {
        switch (metadata.layoutConfig.fontFamily) {
            case 'serif': return 'font-serif';
            case 'mono': return 'font-mono';
            default: return 'font-sans';
        }
    };

    const pageBaseClass = `bg-white w-[210mm] min-h-[297mm] p-[20mm] relative shadow-[0_20px_50px_rgba(0,0,0,0.1)] mb-12 last:mb-0 print:shadow-none print:m-0 print:w-full flex flex-col ${getFontFamily()} ${metadata.layoutConfig.fontSize} text-foreground`;

    return (
        <div className="exam-container print:bg-white bg-secondary/50 flex flex-col items-center">
            <div id="marking-scheme-content" className={pageBaseClass}>
                {/* Header */}
                <div className="border-b-[4px] border-foreground pb-6 mb-8 text-center">
                    <h1 className="text-2xl font-black uppercase mb-2 text-foreground">{metadata.institution}</h1>
                    <h2 className="text-xl font-bold uppercase text-muted-foreground mb-4">{metadata.title} - MARKING SCHEME</h2>
                    <div className="flex justify-center gap-6 text-sm font-bold uppercase tracking-widest text-muted-foreground/60">
                        <span>{metadata.subject}</span>
                        <span>•</span>
                        <span>{metadata.code}</span>
                    </div>
                </div>

                {/* Questions & Answers */}
                <div className="flex-1 space-y-8">
                    {questions.map((q, index) => (
                        <div key={q.id} className="page-break-inside-avoid border-b border-border pb-6 last:border-0">
                            <div className="flex gap-4 mb-2">
                                <span className="font-bold text-lg text-foreground w-8 shrink-0">{index + 1}.</span>
                                <div className="flex-1">
                                    <p className="text-sm text-muted-foreground italic mb-2 line-clamp-2">{q.text}</p>
                                    <div className="bg-accent-green/10 border border-accent-green/20 p-4 rounded-lg">
                                        <p className="text-xs font-black uppercase text-accent-green mb-2 tracking-widest">Answer Key</p>
                                        <div className="text-sm font-medium text-foreground whitespace-pre-wrap leading-relaxed">
                                            {q.markingScheme || "No marking scheme provided."}
                                        </div>
                                    </div>
                                </div>
                                <div className="shrink-0 w-16 text-right">
                                    <span className="font-bold text-sm bg-secondary px-2 py-1 rounded">
                                        {q.marks} mks
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-auto pt-8 text-center border-t-2 border-border">
                    <p className="font-bold uppercase tracking-[0.2em] text-[10px] text-muted-foreground">Confidential • Marking Guide</p>
                </div>
            </div>
        </div>
    );
};

export default MarkingSchemePreview;
