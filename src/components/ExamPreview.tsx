'use client';

import React from 'react';
import { ExamPaper, EXAM_BOARD_CONFIGS } from '@/types';
import LatexRenderer from './LatexRenderer';

interface ExamPreviewProps {
    paper: ExamPaper;
    onEdit?: (type: 'metadata' | 'question', id: string, key: string, value: string) => void;
}

const ExamPreview: React.FC<ExamPreviewProps> = ({ paper, onEdit }) => {
    const { metadata, questions } = paper;

    const handleBlur = (type: 'metadata' | 'question', id: string, key: string, e: React.FocusEvent<HTMLElement>) => {
        if (onEdit) onEdit(type, id, key, e.currentTarget.innerText);
    };

    const getFontFamily = () => {
        switch (metadata.layoutConfig.fontFamily) {
            case 'serif': return 'font-serif';
            case 'mono': return 'font-mono';
            default: return 'font-sans';
        }
    };

    const pageBaseClass = `bg-white w-[210mm] min-h-[297mm] p-[20mm] relative shadow-[0_20px_50px_rgba(0,0,0,0.1)] mb-12 last:mb-0 print:shadow-none print:m-0 print:w-full flex flex-col ${getFontFamily()} ${metadata.layoutConfig.fontSize} text-foreground`;

    // Cover page class - no margin bottom for cover page
    const coverPageClass = `bg-white w-[210mm] min-h-[297mm] p-[20mm] relative shadow-[0_20px_50px_rgba(0,0,0,0.1)] mb-12 print:shadow-none print:m-0 print:w-full flex flex-col ${getFontFamily()} ${metadata.layoutConfig.fontSize} text-foreground`;

    const renderEditable = (text: string, type: 'metadata' | 'question', id: string, key: string, className?: string) => (
        <span
            contentEditable={!!onEdit}
            suppressContentEditableWarning={true}
            onBlur={(e) => handleBlur(type, id, key, e)}
            className={`outline-none focus:bg-primary/5 transition-colors rounded-sm empty:inline-block empty:min-w-[50px] ${onEdit ? 'hover:bg-secondary cursor-text' : ''} ${className}`}
        >
            {text || (onEdit ? '...' : '')}
        </span>
    );

    // Get board config for styling
    const boardConfig = EXAM_BOARD_CONFIGS[metadata.examBoard || 'knec'];
    const primaryColor = metadata.primaryColor || boardConfig.primaryColor;
    const accentColor = metadata.accentColor || boardConfig.accentColor;

    // Generate page numbers for the marking grid (based on estimated pages)
    const estimatedPages = Math.max(2, Math.ceil(questions.length / 3) + 1); // +1 for cover page
    const markingGridRows = Math.min(22, estimatedPages + 3); // Cap at 22 rows like the image

    // === BOARD LOGO RENDERING ===
    const renderBoardLogo = () => {
        // Only render if logo is uploaded
        if (metadata.logo) {
            return (
                <div className="w-16 h-16 flex-shrink-0">
                    <img src={metadata.logo} alt="Institution Logo" className="w-full h-full object-contain" />
                </div>
            );
        }
        return null;
    };

    // === BOARD NAME RENDERING ===
    const renderBoardName = () => {
        // If user entered a specific exam board name, show it
        if (metadata.examBoard && metadata.examBoard !== 'custom') {
            const boardMap: Record<string, string> = {
                'cambridge': 'Cambridge Assessment International Education',
                'knec': 'Kenya National Examinations Council',
                'pearson': 'Pearson Edexcel International Qualifications',
                'aqa': 'AQA Education',
                'ocr': 'Oxford Cambridge and RSA',
                'ib': 'International Baccalaureate Organization'
            };

            const boardName = boardMap[metadata.examBoard] || metadata.examBoard;

            return (
                <div>
                    <h1 className="text-lg font-bold text-black leading-tight" style={{ color: primaryColor }}>
                        {metadata.examBoard.toUpperCase()}
                    </h1>
                    <p className="text-sm text-gray-600">{boardName}</p>
                </div>
            );
        }

        // Generic fallback for custom or undefined
        return (
            <div>
                <h1 className="text-lg font-bold text-black leading-tight" style={{ color: primaryColor }}>
                    {metadata.institution || 'Examination'}
                </h1>
            </div>
        );
    };

    // === UNIVERSAL COVER PAGE (Works for all boards) ===
    const renderCoverPage = () => {
        return (
            <div className={coverPageClass} style={{ pageBreakAfter: 'always' }}>
                {/* Board Header */}
                <div className="flex items-start gap-4 mb-8">
                    {renderBoardLogo()}
                    {renderBoardName()}
                </div>

                {/* Main Title Section */}
                <div className="mb-12">
                    <h2 className="text-2xl font-bold mb-2" style={{ color: primaryColor }}>
                        {renderEditable(metadata.institution || boardConfig.name, 'metadata', '', 'institution')}
                    </h2>
                    <h3 className="text-xl font-bold text-black mb-1">
                        {renderEditable(metadata.subject || 'Science', 'metadata', '', 'subject')} {renderEditable(metadata.code || 'paper 2', 'metadata', '', 'code')}
                    </h3>
                    <p className="text-lg text-gray-500">
                        {renderEditable(metadata.title || 'Stage 6', 'metadata', '', 'title')}
                    </p>
                </div>

                {/* Content area with two columns */}
                <div className="flex gap-8 flex-1">
                    {/* Left Column - Instructions */}
                    <div className="flex-1">
                        {/* Duration */}
                        <div className="text-right mb-8">
                            <p className="text-base font-bold text-black">
                                {renderEditable(metadata.timeLimit || '45 minutes', 'metadata', '', 'timeLimit')}
                            </p>
                        </div>

                        {/* Name Field */}
                        <div className="mb-8">
                            <div className="flex items-end gap-2">
                                <span className="text-sm text-black">Name</span>
                                <div className="flex-1 border-b border-dotted border-gray-400 min-h-[1px]"></div>
                            </div>
                        </div>

                        {/* Additional Materials */}
                        {metadata.additionalMaterials && (
                            <div className="mb-8">
                                <p className="text-sm text-black">
                                    <span className="font-medium">Additional materials:</span>{' '}
                                    <span className="italic">{metadata.additionalMaterials}</span>
                                </p>
                            </div>
                        )}

                        {/* Instructions */}
                        <div className="mb-8">
                            <p className="text-sm font-bold uppercase tracking-wide mb-4" style={{ color: accentColor }}>
                                READ THESE INSTRUCTIONS FIRST
                            </p>
                            <div className="space-y-3 text-sm text-black leading-relaxed">
                                <p>
                                    Answer <span className="font-bold">all</span> questions in the spaces provided on the question paper.
                                </p>
                                <p>
                                    You should show all your working on the question paper.
                                </p>
                                <p>
                                    The number of marks is given in brackets [ ] at the end of each question or part question.
                                </p>
                                <p>
                                    The total number of marks for this paper is {metadata.totalMarks || 50}.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Right Column - For Teacher's Use Table */}
                    <div className="w-40">
                        <table className="w-full border-collapse text-xs">
                            <thead>
                                <tr>
                                    <th colSpan={2} className="border border-black p-1 text-center font-bold bg-white">
                                        For Teacher's Use
                                    </th>
                                </tr>
                                <tr>
                                    <th className="border border-black p-1 text-center font-bold w-1/2">Page</th>
                                    <th className="border border-black p-1 text-center font-bold w-1/2">Mark</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Array.from({ length: markingGridRows }).map((_, i) => (
                                    <tr key={i}>
                                        <td className="border border-black p-1 text-center h-5">
                                            {i < markingGridRows - 1 ? i + 1 : ''}
                                        </td>
                                        <td className="border border-black p-1 text-center h-5"></td>
                                    </tr>
                                ))}
                                <tr>
                                    <td className="border border-black p-1 text-center font-bold bg-gray-100">Total</td>
                                    <td className="border border-black p-1 text-center"></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-auto pt-8 flex justify-between items-end text-[9px] text-gray-500">
                    <div>
                        <p>{metadata.code || 'PAPER_01'}</p>
                        <p>© {metadata.institution || boardConfig.name} 2025</p>
                    </div>
                </div>
            </div>
        );
    };

    // === OTHER TEMPLATE HEADERS (Pearson, CBC, Modern, etc.) ===
    const renderHeader = () => {
        const isCentered = metadata.logoPlacement === 'center';
        const isRight = metadata.logoPlacement === 'right';

        // Default to CBC header - Pearson depreciated


        // === CBC (Competency Based Curriculum) STYLE ===
        if (metadata.templateId === 'cbc' || metadata.templateId === 'pearson') {
            return (
                <div className="mb-8 font-sans">
                    <div className="text-center border-b-4 border-double border-foreground pb-6 mb-6">
                        {metadata.logo && <img src={metadata.logo} className="h-20 mx-auto mb-2" alt="Logo" />}
                        <h1 className="text-2xl font-black uppercase underline decoration-2 underline-offset-4 mb-2 text-foreground">
                            {renderEditable(metadata.institution, 'metadata', '', 'institution')}
                        </h1>
                        <h2 className="text-xl font-bold uppercase text-muted-foreground mb-1">
                            {renderEditable(metadata.title, 'metadata', '', 'title')}
                        </h2>
                        <p className="font-bold uppercase tracking-widest text-sm text-foreground">{renderEditable(metadata.subject, 'metadata', '', 'subject')}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm font-bold border-2 border-foreground p-4 mb-6 text-foreground">
                        <div className="flex gap-2 items-end">
                            <span>NAME:</span>
                            <div className="flex-1 border-b-2 border-dotted border-border"></div>
                        </div>
                        <div className="flex gap-2 items-end">
                            <span>ADM NO:</span>
                            <div className="flex-1 border-b-2 border-dotted border-border"></div>
                        </div>
                        <div className="flex gap-2 items-end">
                            <span>CLASS:</span>
                            <div className="flex-1 border-b-2 border-dotted border-border"></div>
                        </div>
                        <div className="flex gap-2 items-end">
                            <span>DATE:</span>
                            <div className="flex-1 border-b-2 border-dotted border-border"></div>
                        </div>
                    </div>

                    {/* Rubric Grid */}
                    <div className="border border-foreground mb-8 text-foreground">
                        <div className="bg-secondary border-b border-foreground p-2 text-center font-black text-xs uppercase">Assessment Rubric</div>
                        <div className="grid grid-cols-4 divide-x divide-foreground text-center text-[10px] uppercase font-bold">
                            <div className="p-2">Exceeding Exp.</div>
                            <div className="p-2">Meeting Exp.</div>
                            <div className="p-2">Approaching Exp.</div>
                            <div className="p-2">Below Exp.</div>
                        </div>
                        <div className="grid grid-cols-4 divide-x divide-foreground text-center h-8">
                            <div></div><div></div><div></div><div></div>
                        </div>
                    </div>
                </div>
            )
        }

        // === MODERN / MINIMALIST ===
        if (metadata.templateId === 'modern' || metadata.templateId === 'minimalist') {
            return (
                <div className="mb-12 p-8 rounded-3xl" style={{ backgroundColor: metadata.templateId === 'modern' ? (metadata.headerColor || 'var(--primary-dark)') : 'transparent', color: metadata.templateId === 'modern' ? '#fff' : 'inherit' }}>
                    <div className={`flex flex-col md:flex-row items-center gap-6 ${isCentered ? 'text-center' : isRight ? 'md:flex-row-reverse text-right' : ''}`}>
                        {metadata.logo && <img src={metadata.logo} className={`w-16 h-16 object-contain p-2 rounded-2xl ${metadata.templateId === 'modern' ? 'bg-white/20' : ''}`} alt="Logo" />}
                        <div className="flex-1">
                            <h1 className="text-3xl font-black mb-1">{renderEditable(metadata.title, 'metadata', '', 'title')}</h1>
                            <p className={`${metadata.templateId === 'modern' ? 'text-primary' : 'text-primary'} font-black uppercase tracking-[0.3em] text-[10px] mb-4`}>{renderEditable(metadata.institution, 'metadata', '', 'institution')}</p>
                            <div className={`flex flex-wrap gap-x-6 gap-y-2 text-[10px] font-black uppercase ${metadata.templateId === 'modern' ? 'opacity-60' : 'text-muted-foreground'} ${isCentered ? 'justify-center' : isRight ? 'justify-end' : ''}`}>
                                {metadata.customFields.map(f => (
                                    <div key={f.id} className="flex gap-2">
                                        <span>{f.label}:</span>
                                        {renderEditable(f.value, 'metadata', '', `custom_${f.id}`)}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        // === CLASSIC STYLE (simpler header for question pages) ===
        return (
            <div className="border-b-2 pb-4 mb-6 border-gray-300">
                <div className="flex justify-between items-center">
                    <div className="text-sm text-gray-600">
                        {metadata.subject} - {metadata.code}
                    </div>
                    <div className="text-sm font-bold text-gray-800">
                        Page {'{page}'} of {'{pages}'}
                    </div>
                </div>
            </div>
        );
    };

    // Use a universal layout for all templates (CBC-focused)
    return (
        <div className="exam-container print:bg-white bg-secondary/50 flex flex-col items-center">
            {/* Optionally render cover page for CBC */}
            {renderCoverPage()}

            {/* Question Pages */}
            <div id="exam-paper-content" className={pageBaseClass}>
                {renderHeader()}

                {metadata.instructions && (
                    <div className={`mb-8 p-6 border-y-2 border-border italic text-muted-foreground relative overflow-hidden text-sm`}>
                        <p className="not-italic font-black uppercase text-[10px] tracking-widest mb-2 text-foreground">Instructions to Candidates:</p>
                        <div className="whitespace-pre-wrap leading-relaxed opacity-90">
                            {renderEditable(metadata.instructions, 'metadata', '', 'instructions')}
                        </div>
                    </div>
                )}

                <div className="flex-1 space-y-8">
                    {questions.map((q, index) => (
                        <div key={q.id} className="page-break-inside-avoid relative flex gap-6 pt-4 first:pt-0">
                            <span className="font-bold text-lg text-muted-foreground w-8 shrink-0">{index + 1}</span>
                            <div className="flex-1">
                                <div className="font-medium leading-relaxed mb-6 text-[15px] text-foreground whitespace-pre-wrap">
                                    <LatexRenderer content={q.text} />
                                </div>

                                {/* Image Support */}
                                {q.imagePath && (
                                    <div className="my-4 border border-border rounded-lg overflow-hidden">
                                        <img src={q.imagePath} alt={q.imageCaption || 'Question diagram'} className="w-full max-h-64 object-contain" />
                                        {q.imageCaption && (
                                            <p className="text-xs text-muted-foreground text-center p-2 bg-secondary border-t border-border">{q.imageCaption}</p>
                                        )}
                                    </div>
                                )}

                                {q.type === 'Multiple Choice' && q.options && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-4 ml-2 mb-4">
                                        {q.options.map((opt, i) => (
                                            <div key={i} className="flex items-start gap-3 text-[14px] text-foreground">
                                                <span className="font-bold border border-border rounded w-6 h-6 flex items-center justify-center text-[11px] shrink-0 text-muted-foreground">{String.fromCharCode(65 + i)}</span>
                                                <span className="flex-1 pt-0.5">{opt}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {(q.type === 'Structured' || q.type === 'Essay') && (
                                    <div className="mt-6 space-y-6">
                                        {Array.from({ length: q.type === 'Essay' ? 8 : 4 }).map((_, i) => (
                                            <div key={i} className="border-b border-border w-full h-6"></div>
                                        ))}
                                    </div>
                                )}

                                {/* Sub-parts for PDF/Preview */}
                                {q.subParts && q.subParts.length > 0 && (
                                    <div className="mt-4 space-y-3">
                                        {q.subParts.map((part, pIdx) => (
                                            <div key={pIdx} className="flex gap-3">
                                                <span className="font-bold text-sm w-6 shrink-0">({part.label})</span>
                                                <div className="flex-1">
                                                    <div className="text-[14px] leading-relaxed mb-1 text-foreground">
                                                        <LatexRenderer content={part.text} />
                                                    </div>
                                                </div>
                                                <div className="w-12 text-right">
                                                    <span className="text-xs font-bold text-muted-foreground">[{part.marks}]</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="shrink-0 w-16 text-right">
                                <span className="font-bold text-sm bg-secondary px-2 py-1 rounded text-foreground">
                                    {q.marks} mks
                                </span>
                            </div>
                        </div>


                    ))}
                </div>

                <div className="mt-16 pt-8 text-center border-t-4 border-border page-break-inside-avoid">
                    <p className="font-bold uppercase tracking-[0.2em] text-[10px] text-muted-foreground">End of Examination</p>
                </div>
            </div>
        </div>
    );
};

export default ExamPreview;
