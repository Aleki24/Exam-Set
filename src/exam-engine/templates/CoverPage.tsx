import React, { useRef, useState, useEffect } from 'react';
import { Page } from './Page';
import { ExamTheme } from '../themes';
import { TeacherUseTable } from './TeacherUseTable';
import { DraggableCoverElement, CoverElement } from './DraggableCoverElement';
import { TextToolbar } from '../editor/TextToolbar';
import { ExamCoverData } from '@/types/ExamCoverData';
import { CambridgeCover } from './covers/CambridgeCover';

export interface CoverData extends Partial<ExamCoverData> {
    // Legacy mapping or extended fields
    schoolName?: string;
    instructions?: string[]; // Legacy array format
    elements?: CoverElement[];
    variant?: 'cambridge' | 'custom';
}

interface CoverPageProps {
    data: CoverData;
    theme: ExamTheme;
    questionNumbers?: (number | string)[];
    onUpdate?: (newData: CoverData) => void;
}

// Default elements for a new cover page (Custom Mode)
const createDefaultElements = (data: CoverData): CoverElement[] => [
    {
        id: 'school-name',
        type: 'text',
        content: data.schoolName || 'SCHOOL NAME',
        x: 5,
        y: 3,
        width: 90,
        fontSize: '2xl',
        fontWeight: 'bold',
        align: 'center',
        uppercase: true,
    },
    {
        id: 'exam-title',
        type: 'text',
        content: data.examTitle || 'EXAMINATION',
        x: 5,
        y: 10,
        width: 90,
        fontSize: '3xl',
        fontWeight: 'black',
        align: 'center',
        uppercase: true,
    },
    {
        id: 'instructions',
        type: 'instructions',
        content: data.instructions?.join('\n') || 'Answer all questions.\nShow all working.',
        x: 5,
        y: 52,
        width: 90,
        fontSize: 'sm',
    },
];

export const CoverPage: React.FC<CoverPageProps> = ({
    data,
    theme,
    questionNumbers = [1, 2, 3, 4],
    onUpdate
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [showAddMenu, setShowAddMenu] = useState(false);
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

    // Initialize elements from data or create defaults
    const [localElements, setLocalElements] = useState<CoverElement[]>(() => {
        return data.elements || createDefaultElements(data);
    });

    const [isEditMode, setIsEditMode] = useState(false);

    // Sync elements to parent when they change
    useEffect(() => {
        if (onUpdate && localElements !== data.elements) {
            const elementsChanged = JSON.stringify(localElements) !== JSON.stringify(data.elements);
            if (elementsChanged) {
                onUpdate({ ...data, elements: localElements });
            }
        }
    }, [localElements]);

    // Sync from parent if data.elements changes externally
    useEffect(() => {
        if (data.elements && JSON.stringify(data.elements) !== JSON.stringify(localElements)) {
            setLocalElements(data.elements);
        }
    }, [data.elements]);

    const handleElementUpdate = (id: string, updates: Partial<CoverElement>) => {
        setLocalElements(prev =>
            prev.map(el => el.id === id ? { ...el, ...updates } : el)
        );
    };

    const handleElementDelete = (id: string) => {
        setLocalElements(prev => prev.filter(el => el.id !== id));
    };

    const handleAddElement = (type: CoverElement['type']) => {
        const newElement: CoverElement = {
            id: `element-${Date.now()}`,
            type,
            content: type === 'field' ? '' : (type === 'instructions' ? 'New instruction' : 'New Text'),
            label: type === 'field' ? 'Label' : undefined,
            x: 5,
            y: 30 + (localElements.length % 10) * 5,
            fontSize: 'base',
            fontWeight: 'normal',
        };

        setLocalElements(prev => [...prev, newElement]);
        setShowAddMenu(false);
        setSelectedElementId(newElement.id);
    };

    const selectedElement = localElements.find(el => el.id === selectedElementId) || null;

    const handleDoubleClick = () => {
        if (onUpdate && !isEditMode) {
            setIsEditMode(true);
        }
    };

    const exitEditMode = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setIsEditMode(false);
        setSelectedElementId(null);
    };

    // Prepare data for static template
    const coverData: ExamCoverData = {
        institutionName: data.schoolName || data.institutionName || 'Cambridge Assessment',
        examTitle: data.examTitle || 'Science paper 2',
        subject: data.subject || 'Science',
        level: data.level || 'Stage 6',
        duration: data.duration || '45 minutes',
        totalMarks: data.totalMarks || 50,
        additionalMaterials: data.additionalMaterials || 'Ruler'
    };

    const variant = data.variant || 'cambridge';

    // RENDER DEFAULT CAMBRIDGE TEMPLATE
    if (variant !== 'custom') {
        return (
            <div className="relative group w-full h-full bg-white print:p-0 page-container">
                <div style={{ transform: 'scale(1)', transformOrigin: 'top left' }}>
                    <CambridgeCover {...coverData} />
                </div>

                {onUpdate && (
                    <div
                        className="absolute inset-0 z-10"
                        onDoubleClick={() => {
                            if (confirm("Switch to Custom Mode to manually design the layout?")) {
                                onUpdate?.({ ...data, variant: 'custom' });
                                setIsEditMode(true);
                            }
                        }}
                        title="Double Click to Edit Layout (Switches to Custom Mode)"
                    />
                )}
            </div>
        );
    }

    // --- CUSTOM / DRAGGABLE MODE ---
    return (
        <Page
            theme={theme}
            className={`flex flex-col relative ${isEditMode ? 'overflow-visible' : ''}`}
            autoHeight={!!onUpdate}
        >
            {/* Edit Mode Indicator / Done Button */}
            {isEditMode && (
                <div className="absolute top-2 right-2 z-50 animate-in fade-in zoom-in duration-200 flex gap-2">
                    <button
                        onClick={exitEditMode}
                        className="bg-green-600 text-white px-4 py-1.5 rounded-full text-sm font-medium shadow-md hover:bg-green-700 transition-colors flex items-center gap-2"
                    >
                        <span>✓</span> Done Editing
                    </button>
                    <button
                        onClick={() => {
                            if (confirm("Reset to Default Cambridge Template?")) {
                                onUpdate?.({ ...data, variant: 'cambridge', elements: undefined });
                                setIsEditMode(false);
                            }
                        }}
                        className="bg-gray-600 text-white px-3 py-1.5 rounded-full text-xs hover:bg-gray-700"
                    >
                        Reset to Default
                    </button>
                </div>
            )}

            {/* Text Toolbar */}
            {isEditMode && selectedElement && (
                <div className="sticky top-0 z-[100] mb-2 -mt-4 animate-in slide-in-from-top-2 duration-200">
                    <TextToolbar
                        element={selectedElement}
                        onUpdate={(updates) => handleElementUpdate(selectedElement.id, updates)}
                    />
                </div>
            )}

            {/* Draggable Elements Container */}
            <div
                ref={containerRef}
                className={`relative flex-grow transition-colors duration-300 ${isEditMode ? 'bg-gray-50/30' : ''}`}
                style={{ minHeight: '700px' }}
                onClick={() => setSelectedElementId(null)}
                onDoubleClick={handleDoubleClick}
                title={!isEditMode && onUpdate ? "Double click to edit cover page" : undefined}
            >
                {localElements.map((element) => (
                    <div key={element.id} onClick={(e) => {
                        if (isEditMode) {
                            e.stopPropagation();
                            setSelectedElementId(element.id);
                        }
                    }} className="contents">
                        <DraggableCoverElement
                            element={element}
                            containerRef={containerRef}
                            onUpdate={handleElementUpdate}
                            onDelete={onUpdate ? handleElementDelete : undefined}
                            isEditing={isEditMode}
                        />
                    </div>
                ))}

                {/* Add Element Button */}
                {isEditMode && (
                    <div className="absolute bottom-2 right-2 z-30">
                        <div className="relative">
                            <button
                                onClick={() => setShowAddMenu(!showAddMenu)}
                                className="w-10 h-10 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-colors flex items-center justify-center text-2xl"
                                title="Add element"
                            >
                                +
                            </button>

                            {showAddMenu && (
                                <div className="absolute bottom-12 right-0 bg-white border rounded-lg shadow-xl py-2 min-w-[140px] z-50">
                                    <button
                                        onClick={() => handleAddElement('text')}
                                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
                                    >
                                        <span className="text-gray-500">T</span> Text
                                    </button>
                                    <button
                                        onClick={() => handleAddElement('field')}
                                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
                                    >
                                        <span className="text-gray-500">_</span> Field
                                    </button>
                                    <button
                                        onClick={() => handleAddElement('box')}
                                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
                                    >
                                        <span className="text-gray-500">☐</span> Box
                                    </button>
                                    <button
                                        onClick={() => handleAddElement('instructions')}
                                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
                                    >
                                        <span className="text-gray-500">≡</span> Instructions
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Teacher Use Table */}
            <div className="mt-auto w-full pt-4">
                <TeacherUseTable
                    questionNumbers={questionNumbers && questionNumbers.length > 0 ? questionNumbers : Array.from({ length: 10 }, (_, i) => i + 1)}
                    theme={theme}
                    isEditing={!!onUpdate}
                />
            </div>
        </Page>
    );
};
