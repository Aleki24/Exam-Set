
import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Question, QuestionData } from '../templates/Question';
import { ExamTheme } from '../themes';

interface SortablePreviewItemProps {
    id: string;
    q: QuestionData;
    theme: ExamTheme;
}

export const SortablePreviewItem: React.FC<SortablePreviewItemProps> = ({
    id,
    q,
    theme
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1, // Fade out original when dragging
        zIndex: isDragging ? 999 : 'auto',
        position: 'relative' as const,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="group relative p-1 -ml-1 rounded hover:bg-blue-50/30 transition-colors"
        >
            {/* Drag Handle (Hand Icon) - Replaces Move Up/Down Buttons */}
            {/* Visible on hover, positioned to the left */}
            <div
                {...attributes}
                {...listeners}
                className="absolute -left-10 top-0 flex flex-col gap-1 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-grab active:cursor-grabbing p-2 text-gray-400 hover:text-blue-600 bg-white/50 rounded-full"
                title="Drag to reorder"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" /><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v6" /><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5" /><path d="M16 11.17V14.5a3 3 0 0 0-3 3 3 3 0 0 0-3-3 4 4 0 0 0-4 4 4 4 0 0 0 4 4c2.9 0 6.6-2.5 6.6-8.5a4 4 0 0 0-4-2.67" /></svg>
            </div>

            <Question {...q} theme={theme} />
        </div>
    );
};
