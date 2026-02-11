"use client";

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableSidebarItem } from './SortableSidebarItem';
import { SortablePreviewItem } from './SortablePreviewItem';
import {
    ExamTheme,
    themes,
    classicInternationalTheme,
} from '../themes';
import { Page } from '../templates/Page';
import { Question, QuestionData } from '../templates/Question';
import { CoverPage, CoverData } from '../templates/CoverPage';
import { generatePDF } from '../pdf/generator';

// --- Types ---
interface TemplateEditorProps {
    initialData?: {
        cover: CoverData;
        questions: QuestionData[];
    };
    onSave?: (data: any) => void;
    onUpdate?: (data: any) => void;
}

// --- Sample Data for Preview ---
const SAMPLE_COVER: CoverData = {
    examTitle: "End of Term Examination",
    subject: "Mathematics",
    level: "Grade 10",
    duration: "2 Hours",
    totalMarks: 100,
    instructions: [
        "Use black or dark blue pen.",
        "You may use an electronic calculator.",
        "Trigonometry tables are provided."
    ],
    schoolName: "Excellence Academy"
};

const SAMPLE_QUESTIONS: QuestionData[] = [
    { number: 1, text: "Solve for x: <b>2x + 5 = 15</b>", marks: 2, type: 'Structured', id: 'q-1' },
    { number: 2, text: "Calculate the area of a circle with radius 7cm. (Use π = 22/7)", marks: 3, type: 'Structured', id: 'q-2' },
    { number: 3, text: "Explain the Pythagorean theorem with a diagram.", marks: 5, type: 'Essay', customSpacing: '5em', id: 'q-3' },
    {
        number: 4,
        text: "A car travels at 60km/h for 2.5 hours. Calculate the distance covered.",
        marks: 3,
        type: 'Multiple Choice',
        options: ["100 km", "120 km", "150 km", "180 km"],
        id: 'q-4'
    }
];

export const TemplateEditor: React.FC<TemplateEditorProps> = ({ initialData, onSave, onUpdate }) => {
    // --- State ---
    const [selectedThemeId, setSelectedThemeId] = useState<string>(classicInternationalTheme.id);
    const [themeConfig, setThemeConfig] = useState<ExamTheme>(classicInternationalTheme);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true); // For mobile toggle
    const [zoom, setZoom] = useState(0.75); // Start at 75% to see more page
    const isRemoteUpdate = React.useRef(false);

    // Editable Data State (initialized from props but mutable)
    const [coverData, setCoverData] = useState<CoverData>(initialData?.cover || SAMPLE_COVER);
    const [questions, setQuestions] = useState<QuestionData[]>(() => {
        const initQ = initialData?.questions || SAMPLE_QUESTIONS;
        return initQ.map((q, i) => ({ ...q, id: q.id || `q-init-${i}` }));
    });

    // Dnd Sensors
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // Sync with initialData if it changes (but preserve local variant)
    useEffect(() => {
        if (initialData?.cover) {
            isRemoteUpdate.current = true;
            // Preserve the local variant - don't overwrite it from props
            setCoverData(prev => ({
                ...initialData.cover,
                variant: prev.variant || initialData.cover?.variant || 'cambridge'
            }));
            if (initialData.questions) {
                setQuestions(prev => {
                    return initialData.questions.map((q, i) => {
                        const localQ = prev.find(p => p.id === q.id);
                        return {
                            ...q,
                            id: q.id || `q-sync-${i}`,
                            // Preserve local layout fields if prop is missing/stale
                            customSpacing: q.customSpacing || localQ?.customSpacing,
                            type: q.type || localQ?.type,
                            matchingPairs: q.matchingPairs || localQ?.matchingPairs,
                            unit: q.unit || localQ?.unit
                        };
                    });
                });
            }
            // Reset flag after render cycle
            setTimeout(() => { isRemoteUpdate.current = false; }, 10);
        }
    }, [initialData]);

    // Notify parent of changes
    useEffect(() => {
        if (!isRemoteUpdate.current && onUpdate) {
            onUpdate({ cover: coverData, questions });
        }
    }, [coverData, questions, onUpdate]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (active.id !== over?.id) {
            setQuestions((items) => {
                const oldIndex = items.findIndex((item) => item.id === active.id);
                const newIndex = items.findIndex((item) => item.id === over?.id);

                const newItems = arrayMove(items, oldIndex, newIndex);

                // Renumber questions after reorder
                return newItems.map((q, i) => ({ ...q, number: i + 1 }));
            });
        }
    };

    const handlePreviewDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        // Strip 'preview-' prefix
        const activeId = String(active.id).replace('preview-', '');
        const overId = over ? String(over.id).replace('preview-', '') : '';

        if (activeId !== overId) {
            setQuestions((items) => {
                const oldIndex = items.findIndex((item) => item.id === activeId);
                const newIndex = items.findIndex((item) => item.id === overId);

                if (oldIndex === -1 || newIndex === -1) return items;

                const newItems = arrayMove(items, oldIndex, newIndex);
                return newItems.map((q, i) => ({ ...q, number: i + 1 }));
            });
        }
    };



    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            const pagesToPrint = Array.from(document.querySelectorAll('.preview-area .page-container')) as HTMLElement[];

            if (pagesToPrint.length === 0) {
                toast.error("No pages found to generate.");
                return;
            }

            await generatePDF(pagesToPrint, `${coverData.subject}-exam.pdf`);
        } catch (e) {
            console.error(e);
            toast.error("Failed to generate PDF");
        } finally {
            setIsGenerating(false);
        }
    };

    // Update theme when selection changes
    useEffect(() => {
        const found = themes.find(t => t.id === selectedThemeId) || classicInternationalTheme;
        if (found) {
            setThemeConfig(prev => ({
                ...prev,
                fontSize: found.fontSize,
                styles: found.styles,
                fontFamily: found.fontFamily
            }));
        }
    }, [selectedThemeId]);

    return (
        <div className="flex flex-col lg:flex-row h-screen w-full overflow-hidden bg-gray-100">
            {/* Mobile Header with Toggle */}
            <div className="lg:hidden flex items-center justify-between p-3 bg-white border-b shadow-sm">
                <h2 className="font-bold text-lg">Exam Designer</h2>
                <button
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {isSidebarOpen ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                        )}
                    </svg>
                </button>
            </div>

            {/* --- Left Panel: Controls --- */}
            <div className={`${isSidebarOpen ? 'block' : 'hidden'} lg:block w-full lg:w-80 bg-white border-4 border-gray-300 rounded-2xl shadow-lg flex flex-col z-10 shrink-0 max-h-[50vh] lg:max-h-full overflow-y-auto m-2`}>
                <div className="hidden lg:block p-4 border-b">
                    <h2 className="font-bold text-lg">Exam Designer</h2>
                    <p className="text-xs text-gray-500">Customize your layout</p>
                </div>

                <div className="p-4 flex-grow overflow-y-auto space-y-6">
                    {/* Cover Template Selector */}
                    <div>
                        <label className="block text-sm font-semibold mb-2">Cover Style</label>
                        <select
                            className="w-full p-2 border rounded"
                            value={coverData.variant || 'cambridge'}
                            onChange={(e) => setCoverData({ ...coverData, variant: e.target.value as 'cambridge' | 'custom' })}
                        >
                            <option value="cambridge">Cambridge Assessment (Default)</option>
                            <option value="custom">Custom Layout (Drag & Drop)</option>
                        </select>
                    </div>

                    {/* Theme Selector */}
                    <div>
                        <label className="block text-sm font-semibold mb-2">Theme Preset</label>
                        <select
                            className="w-full p-2 border rounded"
                            value={selectedThemeId}
                            onChange={(e) => setSelectedThemeId(e.target.value)}
                        >
                            {themes.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Font Family Selector */}
                    <div>
                        <label className="block text-sm font-semibold mb-2">Font Family</label>
                        <select
                            className="w-full p-2 border rounded"
                            value={themeConfig.fontFamily}
                            onChange={(e) => setThemeConfig({ ...themeConfig, fontFamily: e.target.value })}
                        >
                            <option value="Times New Roman, serif">Times New Roman (Serif)</option>
                            <option value="Georgia, serif">Georgia (Serif)</option>
                            <option value="Arial, sans-serif">Arial (Sans)</option>
                            <option value="Helvetica, sans-serif">Helvetica (Sans)</option>
                            <option value="Inter, sans-serif">Inter (Modern Sans)</option>
                            <option value="Courier New, monospace">Courier New (Mono)</option>
                            <option value="'Comic Sans MS', cursive">Comic Sans (Handwritten)</option>
                        </select>
                    </div>

                    {/* Fine Tuning Controls */}
                    <div>
                        <label className="block text-sm font-semibold mb-2">Font Size (pt)</label>
                        <input
                            type="range"
                            min="10"
                            max="16"
                            step="0.5"
                            value={themeConfig.fontSize}
                            onChange={(e) => setThemeConfig({ ...themeConfig, fontSize: parseFloat(e.target.value) })}
                            className="w-full"
                        />
                        <div className="text-right text-xs">{themeConfig.fontSize}pt</div>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold mb-2">Page Margins</label>
                        <input
                            type="range"
                            min="10"
                            max="40"
                            value={themeConfig.margin}
                            onChange={(e) => setThemeConfig({ ...themeConfig, margin: parseInt(e.target.value) })}
                            className="w-full"
                        />
                        <div className="text-right text-xs">{themeConfig.margin}mm</div>
                    </div>

                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={themeConfig.showTeacherUse}
                            onChange={(e) => setThemeConfig({ ...themeConfig, showTeacherUse: e.target.checked })}
                            id="teacherUse"
                        />
                        <label htmlFor="teacherUse" className="text-sm">Show Examiner Columns</label>
                    </div>

                    {/* Metadata Editing */}
                    <div className="pt-4 border-t">
                        <h3 className="text-sm font-bold mb-3 text-gray-700">Exam Details</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">School / Institution</label>
                                <input
                                    type="text"
                                    className="w-full p-2 border rounded text-sm"
                                    value={coverData.schoolName}
                                    onChange={(e) => setCoverData({ ...coverData, schoolName: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">Exam Title</label>
                                <input
                                    type="text"
                                    className="w-full p-2 border rounded text-sm"
                                    value={coverData.examTitle}
                                    onChange={(e) => setCoverData({ ...coverData, examTitle: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">Subject</label>
                                <input
                                    type="text"
                                    className="w-full p-2 border rounded text-sm"
                                    value={coverData.subject}
                                    onChange={(e) => setCoverData({ ...coverData, subject: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Spacing Controls */}
                    <div className="pt-4 border-t">
                        <h3 className="text-sm font-bold mb-3 text-gray-700">Layout Spacing</h3>

                        {/* Global Spacing */}
                        <div className="mb-4">
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Global Default Spacing</label>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                step="5"
                                defaultValue={parseInt(themeConfig.styles.questionSpacing) * 10 || 20}
                                onChange={(e) => {
                                    const val = `${parseInt(e.target.value) / 10}em`;
                                    setThemeConfig(prev => ({
                                        ...prev,
                                        styles: { ...prev.styles, questionSpacing: val }
                                    }));
                                }}
                                className="w-full"
                            />
                            <div className="text-xs text-right text-gray-400">Applies to all questions</div>
                        </div>

                        {/* Per-Question Spacing (Sortable) */}
                        <div className="border-t pt-4">
                            <label className="block text-xs font-bold text-gray-700 mb-2">Individual Question Spacing</label>
                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={handleDragEnd}
                            >
                                <SortableContext
                                    items={questions.map(q => q.id || '')}
                                    strategy={verticalListSortingStrategy}
                                >
                                    <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                                        {questions.map((q, idx) => (
                                            <SortableSidebarItem
                                                key={q.id || idx}
                                                id={q.id || ''}
                                                q={q}
                                                idx={idx}
                                                themeConfig={themeConfig}
                                                onUpdate={(idx, updates) => {
                                                    const newQuestions = [...questions];
                                                    newQuestions[idx] = { ...newQuestions[idx], ...updates };
                                                    setQuestions(newQuestions);
                                                }}
                                            />
                                        ))}
                                    </div>
                                </SortableContext>
                            </DndContext>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t bg-gray-50">
                    <button
                        onClick={handleGenerate}
                        disabled={isGenerating}
                        className="w-full bg-blue-600 text-white py-3 rounded shadow hover:bg-blue-700 disabled:bg-gray-400 font-semibold"
                    >
                        {isGenerating ? "Generating..." : "Download PDF"}
                    </button>
                    <p className="text-xs text-center mt-2 text-gray-400">Generates High-Res PDF</p>
                </div>
            </div>

            {/* --- Right Panel: Live Preview --- */}
            <div className="flex-grow overflow-auto p-4 lg:p-8 bg-gray-100 preview-area m-2 border-4 border-gray-300 rounded-2xl relative">
                {/* Floating Zoom Controls */}
                <div className="absolute top-4 right-10 z-50 flex items-center gap-2 bg-white/90 backdrop-blur-sm border border-gray-200 p-2 rounded-2xl shadow-xl">
                    <button
                        onClick={() => setZoom(prev => Math.max(0.2, prev - 0.1))}
                        className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"
                        title="Zoom Out"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                        </svg>
                    </button>
                    <div className="px-2 min-w-[3.5rem] text-center">
                        <span className="text-xs font-black text-gray-700">{Math.round(zoom * 100)}%</span>
                    </div>
                    <button
                        onClick={() => setZoom(prev => Math.min(2, prev + 0.1))}
                        className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"
                        title="Zoom In"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                        </svg>
                    </button>
                    <div className="h-4 w-px bg-gray-200 mx-1"></div>
                    <button
                        onClick={() => setZoom(0.75)}
                        className="px-2 py-1 text-[10px] font-black uppercase text-blue-600 hover:text-blue-700 transition-colors"
                    >
                        Fit
                    </button>
                </div>

                <div className="flex flex-col gap-4 lg:gap-8 mx-auto transition-transform duration-200 ease-out" style={{ width: 'fit-content', transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
                    {/* Render Cover Page */}
                    <div className="border-4 border-gray-400 rounded-2xl overflow-hidden shadow-xl" style={{ width: '210mm', minHeight: '297mm' }}>
                        <CoverPage
                            data={coverData}
                            theme={themeConfig}
                            questionNumbers={questions.map(q => q.number)}
                            onUpdate={setCoverData}
                        />
                    </div>

                    {/* Render Content Pages */}
                    <Page theme={themeConfig} pageNumber={2} autoHeight={true}>
                        <div className="flex flex-col w-full">
                            {/* Header for continuation pages if needed */}
                            <div className="border-b pb-4 mb-4 text-center uppercase font-bold text-sm">
                                {coverData.subject} - {coverData.level}
                            </div>

                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={handlePreviewDragEnd}
                            >
                                <SortableContext
                                    items={questions.map(q => `preview-${q.id}`)}
                                    strategy={verticalListSortingStrategy}
                                >
                                    <div className="flex flex-col gap-2">
                                        {questions.map((q, idx) => (
                                            <SortablePreviewItem
                                                key={q.id || idx}
                                                id={`preview-${q.id}`}
                                                q={q}
                                                theme={themeConfig}
                                            />
                                        ))}
                                    </div>
                                </SortableContext>
                            </DndContext>
                        </div>
                    </Page>
                </div>
            </div>
        </div>
    );
};
