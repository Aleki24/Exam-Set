'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X,
    FileText,
    FileSpreadsheet,
    FileJson,
    FileCheck,
    Download,
    Loader2,
    CheckCircle
} from 'lucide-react';
import { ExamPaper, Question } from '@/types';
import {
    exportQuestionsToCSV,
    exportExamToCSV,
    exportQuestionsToJSON,
    generateAnswerKey,
    downloadCSV,
    downloadJSON,
    downloadText,
    downloadDocx
} from '@/services/exportService';

interface ExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    paper?: ExamPaper;
    examId?: string;
    questions?: Question[];
    mode: 'exam' | 'questions';
}

type ExportFormat = 'pdf' | 'docx' | 'csv' | 'json' | 'answer-key';

const EXPORT_OPTIONS: { format: ExportFormat; label: string; icon: React.ReactNode; description: string }[] = [
    {
        format: 'pdf',
        label: 'PDF Document',
        icon: <FileText className="w-5 h-5" />,
        description: 'Formatted exam paper ready for printing'
    },
    {
        format: 'docx',
        label: 'Word Document',
        icon: <FileText className="w-5 h-5" />,
        description: 'Editable document in Microsoft Word format'
    },
    {
        format: 'csv',
        label: 'CSV Spreadsheet',
        icon: <FileSpreadsheet className="w-5 h-5" />,
        description: 'Import into Excel or Google Sheets'
    },
    {
        format: 'json',
        label: 'JSON Data',
        icon: <FileJson className="w-5 h-5" />,
        description: 'Machine-readable data format'
    },
    {
        format: 'answer-key',
        label: 'Answer Key',
        icon: <FileCheck className="w-5 h-5" />,
        description: 'Marking scheme and answers only'
    }
];

export default function ExportModal({ isOpen, onClose, paper, examId, questions, mode }: ExportModalProps) {
    const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('pdf');
    const [exporting, setExporting] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleExport = async () => {
        if (!paper && !questions) return;

        setExporting(true);
        setSuccess(false);

        try {
            const questionsToExport = paper?.questions || questions || [];
            const filename = paper?.metadata.title || 'questions';
            const safeFilename = filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();

            switch (selectedFormat) {
                case 'pdf':
                    // PDF export is handled by existing examService
                    // Redirect to PDF generation
                    if (examId) {
                        window.open(`/api/exams/${examId}/pdf`, '_blank');
                    }
                    break;

                case 'docx':
                    if (paper) {
                        await downloadDocx(paper, `${safeFilename}.doc`);
                    }
                    break;

                case 'csv':
                    if (paper) {
                        const csvContent = exportExamToCSV(paper);
                        downloadCSV(csvContent, `${safeFilename}.csv`);
                    } else if (questions) {
                        const csvContent = exportQuestionsToCSV(questions);
                        downloadCSV(csvContent, `${safeFilename}.csv`);
                    }
                    break;

                case 'json':
                    const jsonContent = exportQuestionsToJSON(questionsToExport);
                    downloadJSON(jsonContent, `${safeFilename}.json`);
                    break;

                case 'answer-key':
                    const answerKey = generateAnswerKey(questionsToExport);
                    downloadText(answerKey, `${safeFilename}_answer_key.txt`);
                    break;
            }

            setSuccess(true);
            setTimeout(() => {
                setSuccess(false);
            }, 2000);
        } catch (error) {
            console.error('Export failed:', error);
        } finally {
            setExporting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                onClick={(e) => e.target === e.currentTarget && onClose()}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-5 border-b border-slate-200">
                        <h2 className="text-lg font-semibold text-slate-800">
                            Export {mode === 'exam' ? 'Exam' : 'Questions'}
                        </h2>
                        <button
                            onClick={onClose}
                            className="p-1 hover:bg-slate-100 rounded-lg"
                        >
                            <X className="w-5 h-5 text-slate-500" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-5">
                        {paper && (
                            <div className="mb-4 p-3 bg-slate-50 rounded-lg">
                                <p className="font-medium text-slate-800 truncate">
                                    {paper.metadata.title}
                                </p>
                                <p className="text-sm text-slate-500">
                                    {paper.questions.length} questions • {paper.metadata.totalMarks} marks
                                </p>
                            </div>
                        )}

                        {questions && !paper && (
                            <div className="mb-4 p-3 bg-slate-50 rounded-lg">
                                <p className="font-medium text-slate-800">
                                    {questions.length} question{questions.length !== 1 ? 's' : ''} selected
                                </p>
                            </div>
                        )}

                        <p className="text-sm text-slate-600 mb-4">
                            Choose an export format:
                        </p>

                        <div className="space-y-2">
                            {EXPORT_OPTIONS.map((option) => (
                                <button
                                    key={option.format}
                                    onClick={() => setSelectedFormat(option.format)}
                                    disabled={option.format === 'pdf' && mode === 'questions'}
                                    className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${selectedFormat === option.format
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'border-slate-200 hover:border-slate-300'
                                        } ${option.format === 'pdf' && mode === 'questions'
                                            ? 'opacity-50 cursor-not-allowed'
                                            : ''
                                        }`}
                                >
                                    <div className={`p-2 rounded-lg ${selectedFormat === option.format
                                        ? 'bg-blue-100 text-blue-600'
                                        : 'bg-slate-100 text-slate-500'
                                        }`}>
                                        {option.icon}
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-medium text-slate-800">
                                            {option.label}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            {option.description}
                                        </p>
                                    </div>
                                    {selectedFormat === option.format && (
                                        <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                                            <motion.div
                                                initial={{ scale: 0 }}
                                                animate={{ scale: 1 }}
                                                className="w-2 h-2 rounded-full bg-white"
                                            />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="flex gap-3 p-5 border-t border-slate-200 bg-slate-50">
                        <button
                            onClick={onClose}
                            className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-white"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleExport}
                            disabled={exporting}
                            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {exporting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Exporting...
                                </>
                            ) : success ? (
                                <>
                                    <CheckCircle className="w-4 h-4" />
                                    Downloaded!
                                </>
                            ) : (
                                <>
                                    <Download className="w-4 h-4" />
                                    Export
                                </>
                            )}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
