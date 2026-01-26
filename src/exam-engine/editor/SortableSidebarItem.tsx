
import React, { useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { QuestionData } from '../templates/Question';
import { ExamTheme } from '../themes';

interface SortableSidebarItemProps {
    id: string; // unique id for dnd
    q: QuestionData;
    idx: number; // current index
    themeConfig: ExamTheme;
    onUpdate: (idx: number, updates: Partial<QuestionData>) => void;
}

export const SortableSidebarItem: React.FC<SortableSidebarItemProps> = ({
    id,
    q,
    idx,
    themeConfig,
    onUpdate
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id });

    const fileInputRef = useRef<HTMLInputElement>(null);

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 999 : 'auto',
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Compress/Resize Logic
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const MAX_WIDTH = 800;

                if (width > MAX_WIDTH) {
                    height = (MAX_WIDTH * height) / width;
                    width = MAX_WIDTH;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0, width, height);
                    // Compress to 70% quality JPEG
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                    onUpdate(idx, { image: dataUrl });
                }
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="bg-gray-50 p-2 rounded border group relative mb-3"
        >
            <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold">Q{q.number}</span>
                {/* Drag Handle */}
                <div
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing p-1 text-gray-400 hover:text-black"
                    title="Drag to reorder"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="12" r="1" /><circle cx="9" cy="5" r="1" /><circle cx="9" cy="19" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="5" r="1" /><circle cx="15" cy="19" r="1" /></svg>
                </div>
                <select
                    className="text-[10px] p-1 border rounded bg-white w-24"
                    value={q.type || 'Structured'}
                    onChange={(e) => onUpdate(idx, { type: e.target.value as any })}
                >
                    <optgroup label="Objective">
                        <option value="Multiple Choice">MCQ</option>
                        <option value="True/False">True/False</option>
                        <option value="Matching">Matching</option>
                        <option value="Fill-in-the-blank">Gap Fill</option>
                        <option value="Numeric">Numeric</option>
                    </optgroup>
                    <optgroup label="Constructed">
                        <option value="Structured">Space</option>
                        <option value="Short Answer">Short Answer</option>
                        <option value="Essay">Long Lines</option>
                    </optgroup>
                    <optgroup label="Practical/Oral">
                        <option value="Practical">Practical</option>
                        <option value="Oral">Oral</option>
                    </optgroup>
                </select>
            </div>

            {/* Image Controls */}
            <div className="mb-2 p-2 bg-white border rounded text-xs">
                <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-gray-500">Image</span>
                    {q.image && (
                        <button
                            onClick={() => onUpdate(idx, { image: undefined, imageWidth: undefined })}
                            className="text-red-500 hover:text-red-700 text-[10px]"
                        >
                            Remove
                        </button>
                    )}
                </div>

                {!q.image ? (
                    <div>
                        <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            ref={fileInputRef}
                            onChange={handleImageUpload}
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full py-1 bg-gray-100 hover:bg-gray-200 border rounded text-[10px] text-gray-600"
                        >
                            Select Image
                        </button>
                    </div>
                ) : (
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] text-gray-400">Width: {q.imageWidth || 100}%</span>
                            <input
                                type="range"
                                min="10"
                                max="100"
                                step="5"
                                value={q.imageWidth || 100}
                                onChange={(e) => onUpdate(idx, { imageWidth: parseInt(e.target.value) })}
                                className="w-16 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Spacing */}
            <div className="flex items-center gap-2">
                <input
                    type="range"
                    min="0"
                    max="150"
                    step="5"
                    value={q.customSpacing ? parseFloat(q.customSpacing) * 10 : (parseFloat(themeConfig.styles.questionSpacing) * 10)}
                    onChange={(e) => {
                        const val = `${parseInt(e.target.value) / 10}em`;
                        onUpdate(idx, { customSpacing: val });
                    }}
                    className="flex-grow h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    title="Spacing"
                />
                <div className="text-[10px] text-gray-400 w-8 text-right">
                    {q.customSpacing ? 'Cust' : 'Auto'}
                </div>
            </div>
        </div>
    );
};
