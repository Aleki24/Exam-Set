'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { X, Upload, FileText, Trash2, CheckSquare, Square, Loader2, AlertTriangle, Sparkles, Download } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface ParsedQuestion {
    id: string;
    text: string;
    marks: number;
    type: string;
    topic: string;
    difficulty: 'Easy' | 'Medium' | 'Difficult';
    selected: boolean;
}

interface EnhancedBulkImportProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (questions: Omit<ParsedQuestion, 'id' | 'selected'>[]) => Promise<void>;
    defaultTopic?: string;
}

// ============================================================================
// PARSER UTILITIES
// ============================================================================

const MARKS_PATTERNS = [
    /\((\d+)\s*marks?\)/i,
    /\[(\d+)\s*marks?\]/i,
    /\((\d+)\s*mks?\)/i,
    /\[(\d+)\s*pts?\]/i,
    /\((\d+)\s*pts?\)/i,
    /\((\d+)\s*points?\)/i,
    /—\s*(\d+)\s*marks?/i,
    /-\s*(\d+)\s*marks?$/i,
];

function extractMarks(text: string): { cleanText: string; marks: number } {
    for (const pattern of MARKS_PATTERNS) {
        const match = text.match(pattern);
        if (match) {
            return {
                cleanText: text.replace(pattern, '').trim(),
                marks: parseInt(match[1], 10),
            };
        }
    }
    return { cleanText: text, marks: 1 };
}

function detectQuestionType(text: string): string {
    const lower = text.toLowerCase();
    if (/\b(true|false)\b/i.test(lower) && /\b(true or false|state whether|true\/false)\b/i.test(lower)) return 'True/False';
    if (/\b(match|matching|column\s*[ab])\b/i.test(lower)) return 'Matching';
    if (/_{3,}/.test(text)) return 'Fill-in-the-blank';
    if (/\b(calculate|compute|find the value|solve)\b/i.test(lower)) return 'Numeric';
    if (/\b(define|what is|name|list|state)\b/i.test(lower)) return 'Short Answer';
    if (/\b(explain|describe|discuss|evaluate|analyze|compare)\b/i.test(lower)) return 'Structured';
    return 'Structured';
}

function parseQuestions(rawText: string): ParsedQuestion[] {
    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];

    // Detect CSV format
    if (lines[0].includes(',') && lines[0].split(',').length >= 2) {
        return parseCSV(lines);
    }

    // Detect numbered list
    return parseNumberedList(lines);
}

function parseCSV(lines: string[]): ParsedQuestion[] {
    const results: ParsedQuestion[] = [];
    // Try to detect header row
    const firstLine = lines[0].toLowerCase();
    const hasHeader = firstLine.includes('question') || firstLine.includes('text') || firstLine.includes('marks');
    const startIdx = hasHeader ? 1 : 0;

    for (let i = startIdx; i < lines.length; i++) {
        // Simple CSV split (handles basic cases, not escaped commas in quotes)
        const parts = csvSplit(lines[i]);
        if (parts.length === 0) continue;

        const text = parts[0].replace(/^["']|["']$/g, '').trim();
        if (!text) continue;

        const { cleanText, marks: extractedMarks } = extractMarks(text);
        const marks = parts[1] ? parseInt(parts[1].trim(), 10) || extractedMarks : extractedMarks;
        const topic = parts[2]?.replace(/^["']|["']$/g, '').trim() || '';
        const type = parts[3]?.replace(/^["']|["']$/g, '').trim() || detectQuestionType(cleanText);

        results.push({
            id: `q-${Date.now()}-${i}`,
            text: cleanText,
            marks,
            type,
            topic,
            difficulty: 'Medium',
            selected: true,
        });
    }
    return results;
}

function csvSplit(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

function parseNumberedList(lines: string[]): ParsedQuestion[] {
    const results: ParsedQuestion[] = [];
    const numberPatterns = [
        /^(\d+)\.\s+/,       // 1. Question text
        /^(\d+)\)\s+/,       // 1) Question text
        /^([a-z])\)\s+/i,    // a) Question text
        /^([a-z])\.\s+/i,    // a. Question text
        /^[-•]\s+/,           // - Question text / • Question text
        /^#+\s+/,             // ## Markdown headings
    ];

    let currentQuestion = '';
    let questionCount = 0;

    const flushQuestion = () => {
        const trimmed = currentQuestion.trim();
        if (!trimmed) return;

        // Clean off the numbering prefix
        let cleanText = trimmed;
        for (const p of numberPatterns) {
            cleanText = cleanText.replace(p, '');
        }
        cleanText = cleanText.trim();
        if (!cleanText) return;

        const { cleanText: finalText, marks } = extractMarks(cleanText);
        const type = detectQuestionType(finalText);

        results.push({
            id: `q-${Date.now()}-${questionCount}`,
            text: finalText,
            marks,
            type,
            topic: '',
            difficulty: 'Medium',
            selected: true,
        });
        questionCount++;
    };

    for (const line of lines) {
        const isNewQuestion = numberPatterns.some(p => p.test(line));
        if (isNewQuestion) {
            flushQuestion();
            currentQuestion = line;
        } else {
            // Continuation of previous question or standalone line
            if (currentQuestion) {
                currentQuestion += ' ' + line;
            } else {
                currentQuestion = line;
            }
        }
    }
    flushQuestion();

    // If no numbered items were found, treat each line as a separate question
    if (results.length === 0) {
        for (let i = 0; i < lines.length; i++) {
            const text = lines[i].trim();
            if (!text) continue;
            const { cleanText, marks } = extractMarks(text);
            results.push({
                id: `q-fallback-${i}`,
                text: cleanText,
                marks,
                type: detectQuestionType(cleanText),
                topic: '',
                difficulty: 'Medium',
                selected: true,
            });
        }
    }

    return results;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function EnhancedBulkImport({ isOpen, onClose, onImport, defaultTopic = '' }: EnhancedBulkImportProps) {
    const [rawText, setRawText] = useState('');
    const [questions, setQuestions] = useState<ParsedQuestion[]>([]);
    const [step, setStep] = useState<'input' | 'preview'>('input');
    const [isImporting, setIsImporting] = useState(false);
    const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null);
    const [batchTopic, setBatchTopic] = useState(defaultTopic);

    // Reset on open
    useEffect(() => {
        if (isOpen) {
            setRawText('');
            setQuestions([]);
            setStep('input');
            setImportResult(null);
            setBatchTopic(defaultTopic);
        }
    }, [isOpen, defaultTopic]);

    // Parse questions from raw text
    const handleParse = useCallback(() => {
        const parsed = parseQuestions(rawText);
        // Apply default topic if set
        if (batchTopic) {
            parsed.forEach(q => { if (!q.topic) q.topic = batchTopic; });
        }
        setQuestions(parsed);
        setStep('preview');
    }, [rawText, batchTopic]);

    // Selection helpers
    const selectedCount = useMemo(() => questions.filter(q => q.selected).length, [questions]);
    const allSelected = selectedCount === questions.length && questions.length > 0;

    const toggleAll = () => {
        const newVal = !allSelected;
        setQuestions(qs => qs.map(q => ({ ...q, selected: newVal })));
    };

    const toggleOne = (id: string) => {
        setQuestions(qs => qs.map(q => q.id === id ? { ...q, selected: !q.selected } : q));
    };

    const deleteSelected = () => {
        setQuestions(qs => qs.filter(q => !q.selected));
    };

    const assignTopicToSelected = () => {
        if (!batchTopic.trim()) return;
        setQuestions(qs => qs.map(q => q.selected ? { ...q, topic: batchTopic } : q));
    };

    // Inline editing
    const updateQuestion = (id: string, field: keyof ParsedQuestion, value: string | number) => {
        setQuestions(qs => qs.map(q => q.id === id ? { ...q, [field]: value } : q));
    };

    // File upload handler
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            const content = ev.target?.result as string;
            setRawText(content);
        };
        reader.readAsText(file);
    };

    // Import
    const handleImport = async () => {
        const toImport = questions.filter(q => q.selected);
        if (toImport.length === 0) return;

        setIsImporting(true);
        try {
            await onImport(toImport.map(({ id, selected, ...rest }) => rest));
            setImportResult({ success: toImport.length, failed: 0 });
        } catch {
            setImportResult({ success: 0, failed: toImport.length });
        }
        setIsImporting(false);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col font-sans">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <Upload className="w-5 h-5 text-primary" />
                            Bulk Import Questions
                        </h2>
                        <p className="text-xs text-muted-foreground mt-1">
                            {step === 'input'
                                ? 'Paste questions or upload a file. Supports numbered lists, CSV, and plain text.'
                                : `${questions.length} questions parsed — ${selectedCount} selected for import`
                            }
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 min-h-0 overflow-y-auto p-6">
                    {importResult ? (
                        /* Result Screen */
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            {importResult.success > 0 ? (
                                <>
                                    <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
                                        <Sparkles className="w-8 h-8 text-green-600" />
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900 mb-2">Import Complete!</h3>
                                    <p className="text-sm text-gray-500">{importResult.success} questions imported successfully.</p>
                                </>
                            ) : (
                                <>
                                    <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
                                        <AlertTriangle className="w-8 h-8 text-red-600" />
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900 mb-2">Import Failed</h3>
                                    <p className="text-sm text-gray-500">Failed to import {importResult.failed} questions. Please try again.</p>
                                </>
                            )}
                            <button onClick={onClose} className="mt-6 px-6 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:opacity-90 transition-opacity">
                                Done
                            </button>
                        </div>
                    ) : step === 'input' ? (
                        /* Input Step */
                        <div className="space-y-4">
                            {/* Default topic for batch */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                    Default Topic (applied to all)
                                </label>
                                <input
                                    type="text"
                                    value={batchTopic}
                                    onChange={e => setBatchTopic(e.target.value)}
                                    placeholder="e.g. Algebra, Photosynthesis"
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 outline-none"
                                />
                            </div>

                            {/* Textarea */}
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        Paste Questions
                                    </label>
                                    <label className="text-xs text-primary font-bold cursor-pointer hover:underline flex items-center gap-1">
                                        <Download className="w-3 h-3" />
                                        Upload File
                                        <input type="file" accept=".csv,.txt,.md" onChange={handleFileUpload} className="hidden" />
                                    </label>
                                </div>
                                <textarea
                                    value={rawText}
                                    onChange={e => setRawText(e.target.value)}
                                    rows={14}
                                    placeholder={`Paste questions in any format:\n\n1. Define photosynthesis. (2 marks)\n2. Explain the role of chlorophyll. (3 marks)\n3. State two factors affecting the rate of photosynthesis. (2 marks)\n\nOr CSV format:\n"Question text", marks, topic\n"Define osmosis", 2, "Cell Biology"`}
                                    className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg font-mono focus:ring-2 focus:ring-primary/20 outline-none resize-none bg-gray-50"
                                />
                            </div>

                            {/* Format hints */}
                            <div className="grid grid-cols-3 gap-3 text-[10px] text-gray-500">
                                <div className="bg-gray-50 p-2 rounded-lg border">
                                    <span className="font-bold text-gray-700 block mb-1">Numbered Lists</span>
                                    1. Question text (2mks)
                                </div>
                                <div className="bg-gray-50 p-2 rounded-lg border">
                                    <span className="font-bold text-gray-700 block mb-1">CSV</span>
                                    &quot;Text&quot;, marks, topic
                                </div>
                                <div className="bg-gray-50 p-2 rounded-lg border">
                                    <span className="font-bold text-gray-700 block mb-1">Auto-Extract Marks</span>
                                    (2 marks), [3pts], (2mks)
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Preview Step - Editable Table */
                        <div className="space-y-3">
                            {/* Batch toolbar */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    onClick={toggleAll}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                    {allSelected ? <CheckSquare className="w-3.5 h-3.5 text-primary" /> : <Square className="w-3.5 h-3.5" />}
                                    {allSelected ? 'Deselect All' : 'Select All'}
                                </button>
                                {selectedCount > 0 && (
                                    <button
                                        onClick={deleteSelected}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Delete Selected ({selectedCount})
                                    </button>
                                )}
                                <div className="flex items-center gap-1.5 ml-auto">
                                    <input
                                        type="text"
                                        value={batchTopic}
                                        onChange={e => setBatchTopic(e.target.value)}
                                        placeholder="Topic"
                                        className="px-2 py-1 text-xs border rounded-lg w-36"
                                    />
                                    <button
                                        onClick={assignTopicToSelected}
                                        className="px-3 py-1.5 text-xs font-bold text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors"
                                    >
                                        Assign Topic
                                    </button>
                                </div>
                            </div>

                            {/* Table */}
                            <div className="border rounded-xl overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-gray-50 border-b text-left">
                                            <th className="p-3 w-10"></th>
                                            <th className="p-3 font-bold text-xs text-gray-500 uppercase">#</th>
                                            <th className="p-3 font-bold text-xs text-gray-500 uppercase">Question Text</th>
                                            <th className="p-3 font-bold text-xs text-gray-500 uppercase w-16">Marks</th>
                                            <th className="p-3 font-bold text-xs text-gray-500 uppercase w-32">Type</th>
                                            <th className="p-3 font-bold text-xs text-gray-500 uppercase w-32">Topic</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {questions.map((q, idx) => (
                                            <tr
                                                key={q.id}
                                                className={`border-b last:border-b-0 hover:bg-gray-50/50 transition-colors ${q.selected ? 'bg-white' : 'bg-gray-100/50 opacity-60'
                                                    }`}
                                            >
                                                <td className="p-3">
                                                    <button onClick={() => toggleOne(q.id)} className="text-gray-400 hover:text-primary">
                                                        {q.selected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                                                    </button>
                                                </td>
                                                <td className="p-3 text-xs text-gray-400 font-mono">{idx + 1}</td>
                                                <td className="p-3">
                                                    <input
                                                        type="text"
                                                        value={q.text}
                                                        onChange={e => updateQuestion(q.id, 'text', e.target.value)}
                                                        className="w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-primary outline-none text-sm py-0.5 transition-colors"
                                                    />
                                                </td>
                                                <td className="p-3">
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        value={q.marks}
                                                        onChange={e => updateQuestion(q.id, 'marks', parseInt(e.target.value) || 1)}
                                                        className="w-14 text-center bg-transparent border-b border-transparent hover:border-gray-300 focus:border-primary outline-none text-sm py-0.5"
                                                    />
                                                </td>
                                                <td className="p-3">
                                                    <select
                                                        value={q.type}
                                                        onChange={e => updateQuestion(q.id, 'type', e.target.value)}
                                                        className="bg-transparent text-xs border rounded px-1.5 py-0.5"
                                                    >
                                                        {['Structured', 'Short Answer', 'Multiple Choice', 'True/False', 'Matching', 'Fill-in-the-blank', 'Numeric', 'Essay', 'Practical', 'Oral'].map(t => (
                                                            <option key={t} value={t}>{t}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td className="p-3">
                                                    <input
                                                        type="text"
                                                        value={q.topic}
                                                        onChange={e => updateQuestion(q.id, 'topic', e.target.value)}
                                                        placeholder="Topic"
                                                        className="w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-primary outline-none text-xs py-0.5"
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {questions.length === 0 && (
                                <div className="text-center py-8 text-gray-400 text-sm">
                                    No questions parsed. Go back and try a different format.
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                {!importResult && (
                    <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-b-xl flex items-center justify-between shrink-0">
                        <button
                            onClick={() => step === 'preview' ? setStep('input') : onClose()}
                            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                        >
                            {step === 'preview' ? '← Back to Editor' : 'Cancel'}
                        </button>

                        {step === 'input' ? (
                            <button
                                onClick={handleParse}
                                disabled={!rawText.trim()}
                                className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold"
                            >
                                <FileText className="w-4 h-4" />
                                Parse Questions
                            </button>
                        ) : (
                            <button
                                onClick={handleImport}
                                disabled={isImporting || selectedCount === 0}
                                className="inline-flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold"
                            >
                                {isImporting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Importing {selectedCount}...
                                    </>
                                ) : (
                                    <>
                                        <Upload className="w-4 h-4" />
                                        Import {selectedCount} Questions
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
