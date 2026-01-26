import React from 'react';
import { CoverElement } from '../templates/DraggableCoverElement';

interface TextToolbarProps {
    element: CoverElement | null;
    onUpdate: (updates: Partial<CoverElement>) => void;
}

const FONTS = [
    'Inter',
    'Roboto',
    'Open Sans',
    'Lato',
    'Montserrat',
    'Poppins',
    'Times New Roman',
    'Courier New',
    'Arial'
];

export const TextToolbar: React.FC<TextToolbarProps> = ({ element, onUpdate }) => {
    if (!element) return null;

    const handleFontSizeChange = (delta: number) => {
        const currentSize = typeof element.fontSize === 'number' ? element.fontSize : 16;
        onUpdate({ fontSize: Math.max(8, currentSize + delta) }); // Min 8px
    };

    const handleInputChange = (key: keyof CoverElement, value: any) => {
        onUpdate({ [key]: value });
    };

    const toggleStyle = (style: 'bold' | 'italic' | 'underline' | 'strikethrough') => {
        if (style === 'bold') {
            onUpdate({ fontWeight: element.fontWeight === 'bold' ? 'normal' : 'bold' });
        } else {
            // TS Hack for boolean styles not yet in interface (will update interface next)
            // @ts-ignore
            onUpdate({ [style]: !element[style] });
        }
    };

    const toggleAlign = () => {
        const aligns: ('left' | 'center' | 'right' | 'justify')[] = ['left', 'center', 'right', 'justify'];
        const currentIdx = aligns.indexOf(element.align || 'left');
        const nextAlign = aligns[(currentIdx + 1) % aligns.length];
        onUpdate({ align: nextAlign });
    };

    const currentFontSize = typeof element.fontSize === 'number' ? element.fontSize : 16;

    return (
        <div className="absolute top-0 left-0 right-0 bg-white shadow-md border-b flex items-center gap-2 px-4 py-2 z-[100] overflow-x-auto text-sm">
            {/* Font Family */}
            <select
                value={element.fontFamily || 'Inter'}
                onChange={(e) => handleInputChange('fontFamily', e.target.value)}
                className="border rounded px-2 py-1 max-w-[150px] focus:outline-blue-500"
            >
                {FONTS.map(f => (
                    <option key={f} value={f}>{f}</option>
                ))}
            </select>

            <div className="h-6 w-px bg-gray-300 mx-1"></div>

            {/* Font Size */}
            <div className="flex items-center border rounded">
                <button
                    onClick={() => handleFontSizeChange(-1)}
                    className="px-2 py-1 hover:bg-gray-100 border-r"
                >-</button>
                <input
                    type="number"
                    value={currentFontSize}
                    onChange={(e) => onUpdate({ fontSize: Number(e.target.value) })}
                    className="w-12 text-center focus:outline-none"
                />
                <button
                    onClick={() => handleFontSizeChange(1)}
                    className="px-2 py-1 hover:bg-gray-100 border-l"
                >+</button>
            </div>

            <div className="h-6 w-px bg-gray-300 mx-1"></div>

            {/* Color Picker */}
            <div className="relative group">
                <button
                    className="p-1 rounded hover:bg-gray-100 flex flex-col items-center justify-center w-8 h-8"
                    title="Text Color"
                >
                    <span className="font-bold font-serif">A</span>
                    <div className="h-1 w-full mt-0.5 rounded-full" style={{ background: element.textColor || '#000000' }}></div>
                </button>
                <div className="absolute top-full left-0 mt-1 bg-white border shadow-lg p-2 rounded hidden group-hover:block w-[200px]">
                    <div className="grid grid-cols-5 gap-1">
                        {['#000000', '#444444', '#888888', '#CCCCCC', '#FFFFFF', '#D0021B', '#F5A623', '#F8E71C', '#8B572A', '#7ED321', '#417505', '#BD10E0', '#9013FE', '#4A90E2', '#50E3C2', '#B8E986', '#000000', '#4A4A4A', '#9B9B9B', '#FFFFFF'].map((c, i) => (
                            <button
                                key={i}
                                className="w-6 h-6 rounded border border-gray-200"
                                style={{ backgroundColor: c }}
                                onClick={() => handleInputChange('textColor', c)}
                            />
                        ))}
                    </div>
                </div>
            </div>

            <div className="h-6 w-px bg-gray-300 mx-1"></div>

            {/* Styles */}
            <button
                onClick={() => toggleStyle('bold')}
                className={`p-1 w-8 h-8 rounded hover:bg-gray-100 font-bold ${element.fontWeight === 'bold' ? 'bg-gray-200' : ''}`}
            >B</button>
            <button
                onClick={() => toggleStyle('italic')}
                // @ts-ignore
                className={`p-1 w-8 h-8 rounded hover:bg-gray-100 italic font-serif ${element.italic ? 'bg-gray-200' : ''}`}
            >I</button>
            <button
                onClick={() => toggleStyle('underline')}
                // @ts-ignore
                className={`p-1 w-8 h-8 rounded hover:bg-gray-100 underline ${element.underline ? 'bg-gray-200' : ''}`}
            >U</button>
            <button
                onClick={() => toggleStyle('strikethrough')}
                // @ts-ignore
                className={`p-1 w-8 h-8 rounded hover:bg-gray-100 line-through ${element.strikethrough ? 'bg-gray-200' : ''}`}
            >S</button>
            <button
                onClick={() => onUpdate({ uppercase: !element.uppercase })}
                className={`p-1 w-8 h-8 rounded hover:bg-gray-100 ${element.uppercase ? 'bg-gray-200' : ''}`}
            >aA</button>

            <div className="h-6 w-px bg-gray-300 mx-1"></div>

            {/* Align */}
            <button onClick={toggleAlign} className="p-1 w-8 h-8 rounded hover:bg-gray-100" title="Alignment">
                {element.align === 'center' ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="10" x2="6" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="18" y1="18" x2="6" y2="18" /></svg>
                ) : element.align === 'right' ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="21" y1="10" x2="7" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="21" y1="18" x2="7" y2="18" /></svg>
                ) : element.align === 'justify' ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="21" y1="10" x2="3" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="21" y1="18" x2="3" y2="18" /></svg>
                ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="17" y1="10" x2="3" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="17" y1="18" x2="3" y2="18" /></svg>
                )}
            </button>

            <div className="h-6 w-px bg-gray-300 mx-1"></div>

            {/* Spacing / Opacity */}
            <div className="relative group">
                <button className="p-1 w-8 h-8 rounded hover:bg-gray-100 flex items-center justify-center" title="Spacing">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16M12 4v16" /></svg>
                </button>
                <div className="absolute top-full left-0 mt-1 bg-white border shadow-lg p-3 rounded hidden group-hover:block w-[200px]">
                    <div className="text-xs font-bold mb-1">Letter Spacing</div>
                    <input
                        type="range" min="-2" max="10" step="0.1"
                        value={element.letterSpacing || 0}
                        onChange={(e) => onUpdate({ letterSpacing: parseFloat(e.target.value) })}
                        className="w-full mb-3"
                    />

                    <div className="text-xs font-bold mb-1">Line Height</div>
                    <input
                        type="range" min="0.5" max="3" step="0.1"
                        value={element.lineHeight || 1.2}
                        onChange={(e) => onUpdate({ lineHeight: parseFloat(e.target.value) })}
                        className="w-full mb-3"
                    />

                    <div className="text-xs font-bold mb-1">Opacity</div>
                    <input
                        type="range" min="0" max="1" step="0.1"
                        value={typeof element.opacity === 'number' ? element.opacity : 1}
                        onChange={(e) => onUpdate({ opacity: parseFloat(e.target.value) })}
                        className="w-full"
                    />
                </div>
            </div>

            {/* Effects (Placeholder) */}
            <button className="px-2 py-1 ml-2 text-xs font-medium text-gray-500 hover:bg-gray-100 rounded">
                Effects
            </button>
        </div>
    );
};
