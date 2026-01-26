"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';

export interface CoverElement {
    id: string;
    type: 'text' | 'field' | 'box' | 'instructions' | 'table';
    content: string;
    label?: string;
    x: number;  // Percentage 0-100
    y: number;  // Percentage 0-100
    width?: number; // Percentage 0-100
    height?: number; // Percentage 0-100 (for Manual Resize)

    // Rich Text Styles
    fontFamily?: string;
    fontSize?: number | 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl'; // Support number (px) or legacy class
    textColor?: string;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    lineHeight?: number;
    letterSpacing?: number;
    opacity?: number;

    fontWeight?: 'normal' | 'medium' | 'semibold' | 'bold' | 'black';
    align?: 'left' | 'center' | 'right' | 'justify';
    uppercase?: boolean;
}

interface DraggableCoverElementProps {
    element: CoverElement;
    containerRef: React.RefObject<HTMLDivElement | null>;
    onUpdate: (id: string, updates: Partial<CoverElement>) => void;
    onDelete?: (id: string) => void;
    isEditing?: boolean;
}

const fontSizeClasses: Record<string, string> = {
    'xs': 'text-xs',
    'sm': 'text-sm',
    'base': 'text-base',
    'lg': 'text-lg',
    'xl': 'text-xl',
    '2xl': 'text-2xl',
    '3xl': 'text-3xl',
};

const fontWeightClasses: Record<string, string> = {
    'normal': 'font-normal',
    'medium': 'font-medium',
    'semibold': 'font-semibold',
    'bold': 'font-bold',
    'black': 'font-black',
};

export const DraggableCoverElement: React.FC<DraggableCoverElementProps> = ({
    element,
    containerRef,
    onUpdate,
    onDelete,
    isEditing = true
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [isTextEditing, setIsTextEditing] = useState(false);
    const elementRef = useRef<HTMLDivElement>(null);
    const startPosRef = useRef({ x: 0, y: 0 });
    const startElPosRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
    const resizeHandleRef = useRef<string | null>(null);

    // Default width if not set
    const currentWidth = element.width || 40; // Default 40% width
    // Current height logic: 'auto' if not set, or percentage
    const currentHeightStyle = element.height ? `${element.height}%` : 'auto';

    const handleMouseDown = (e: React.MouseEvent) => {
        if (isTextEditing || (e.target as HTMLElement).tagName.match(/INPUT|TEXTAREA/)) return;
        if ((e.target as HTMLElement).getAttribute('data-resize-handle')) return; // Let resize handler take care

        e.preventDefault();
        setIsDragging(true);
        startPosRef.current = { x: e.clientX, y: e.clientY };
        startElPosRef.current = { x: element.x, y: element.y, w: 0, h: 0 };
    };

    const handleResizeStart = (e: React.MouseEvent, handle: string) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        resizeHandleRef.current = handle;
        startPosRef.current = { x: e.clientX, y: e.clientY };
        startElPosRef.current = {
            x: element.x,
            y: element.y,
            w: element.width || 20,
            h: element.height || 5 // approximate
        };
    };

    useEffect(() => {
        if (!isDragging && !isResizing) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!containerRef.current) return;
            const container = containerRef.current.getBoundingClientRect();

            if (isDragging) {
                const deltaX = ((e.clientX - startPosRef.current.x) / container.width) * 100;
                const deltaY = ((e.clientY - startPosRef.current.y) / container.height) * 100;

                const newX = Math.max(0, Math.min(99, startElPosRef.current.x + deltaX));
                const newY = Math.max(0, Math.min(99, startElPosRef.current.y + deltaY));

                onUpdate(element.id, { x: newX, y: newY });
            } else if (isResizing && resizeHandleRef.current) {
                const deltaX = ((e.clientX - startPosRef.current.x) / container.width) * 100;
                const deltaY = ((e.clientY - startPosRef.current.y) / container.height) * 100;

                let newW = startElPosRef.current.w;
                let newH = element.height || 0; // If null, we might need to initialize it?
                // Calculate current height percentage if not set? Hard to do perfectly without initial pixel measure.
                // For simplified "Canva-like", if user resizes, we switch to explicit % height.
                if (!element.height && elementRef.current) {
                    newH = (elementRef.current.offsetHeight / container.height) * 100;
                }


                if (resizeHandleRef.current.includes('r')) newW = Math.max(2, startElPosRef.current.w + deltaX);
                if (resizeHandleRef.current.includes('b')) newH = Math.max(2, (element.height || startElPosRef.current.h) + deltaY); // Simple addition for now

                // Corner resizing logic
                // If dragging 'l' (left), we adjust X and Width
                // If dragging 't' (top), we adjust Y and Height (not implementing left/top resize for simplicity unless requested)
                // Focusing on Right/Bottom resize as explicitly requested "x and y".

                onUpdate(element.id, { width: newW, height: newH });
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            setIsResizing(false);
            resizeHandleRef.current = null;
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, isResizing, containerRef, element.id, onUpdate, element.height, element.width, element.x, element.y]);

    const handleContentChange = (value: string) => {
        onUpdate(element.id, { content: value });
    };

    const handleLabelChange = (value: string) => {
        onUpdate(element.id, { label: value });
    };

    // Style Calculation
    const getStyles = () => {
        const styles: React.CSSProperties = {
            fontFamily: element.fontFamily, // Default inherited if undefined
            color: element.textColor,
            fontStyle: element.italic ? 'italic' : 'normal',
            textDecoration: [
                element.underline ? 'underline' : '',
                element.strikethrough ? 'line-through' : ''
            ].filter(Boolean).join(' ') || 'none',
            lineHeight: element.lineHeight,
            letterSpacing: element.letterSpacing ? `${element.letterSpacing}px` : undefined,
            opacity: element.opacity,
            textAlign: element.align || 'left',
            textTransform: element.uppercase ? 'uppercase' : 'none',
            fontWeight: element.fontWeight === 'bold' ? 700 : (element.fontWeight === 'black' ? 900 : (element.fontWeight === 'semibold' ? 600 : (element.fontWeight === 'medium' ? 500 : 400))),
        };

        // Handle Font Size
        if (typeof element.fontSize === 'number') {
            styles.fontSize = `${element.fontSize}px`;
        }

        return styles;
    };

    // Legacy class mappings if fontSize is string
    const fontSizeClass = typeof element.fontSize === 'string' ? fontSizeClasses[element.fontSize] : '';
    // fontWeight class is just a fallback if we use classes, but we are moving to inline styles for finer control
    // Keeping classes for now to avoid breaking existing elements completely if they rely on tailwind defaults
    const fontWeightClass = fontWeightClasses[element.fontWeight || 'normal'];

    const commonStyle = getStyles();

    // Render Resize Handles
    const ResizeHandles = isEditing && (
        <>
            {/* Right Handle */}
            <div
                data-resize-handle="r"
                className="absolute right-[-4px] top-1/2 -translate-y-1/2 w-2 h-4 bg-blue-500 rounded sm cursor-ew-resize opacity-0 group-hover:opacity-100"
                onMouseDown={(e) => handleResizeStart(e, 'r')}
            />
            {/* Bottom Handle */}
            <div
                data-resize-handle="b"
                className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 h-2 w-4 bg-blue-500 rounded sm cursor-ns-resize opacity-0 group-hover:opacity-100"
                onMouseDown={(e) => handleResizeStart(e, 'b')}
            />
            {/* Corner Handle */}
            <div
                data-resize-handle="rb"
                className="absolute right-[-4px] bottom-[-4px] w-3 h-3 bg-white border-2 border-blue-500 rounded-full cursor-nwse-resize opacity-0 group-hover:opacity-100 shadow-sm z-50"
                onMouseDown={(e) => handleResizeStart(e, 'rb')}
            />
        </>
    );

    const renderContent = () => {
        switch (element.type) {
            case 'field':
                return (
                    <div className="flex items-end gap-2 w-full h-full">
                        {isEditing ? (
                            <input
                                type="text"
                                value={element.label || ''}
                                onChange={(e) => handleLabelChange(e.target.value)}
                                className={`bg-white/90 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-1 ${fontSizeClass}`}
                                placeholder="Label"
                                style={{
                                    ...commonStyle,
                                    width: 'auto',
                                    flexShrink: 0,
                                    padding: '0 4px', // slight padding for edit target
                                    margin: 0,
                                    border: 'none',
                                    outline: 'none',
                                    font: 'inherit',
                                    color: 'inherit'
                                }}
                            />
                        ) : (
                            <span className={`${fontSizeClass} whitespace-nowrap`} style={commonStyle}>{element.label}:</span>
                        )}
                        <div className="border-b border-black border-dashed flex-grow h-[1px] self-end mb-1"></div>
                    </div>
                );

            case 'box':
                return (
                    <div className="border-2 border-black p-4 rounded-sm w-full h-full overflow-hidden" style={commonStyle}>
                        {isEditing ? (
                            <textarea
                                value={element.content}
                                onChange={(e) => handleContentChange(e.target.value)}
                                className={`w-full h-full bg-transparent focus:outline-none resize-none ${fontSizeClass}`}
                                style={{
                                    ...commonStyle,
                                    height: '100%',
                                    width: '100%',
                                    padding: 0,
                                    margin: 0,
                                    border: 'none',
                                    outline: 'none',
                                    font: 'inherit',
                                    color: 'inherit'
                                }}
                            />
                        ) : (
                            <div className={`whitespace-pre-wrap w-full h-full ${fontSizeClass}`} style={commonStyle}>
                                {element.content}
                            </div>
                        )}
                    </div>
                );

            case 'instructions':
                return (
                    <div className="bg-gray-50 p-4 rounded w-full h-full overflow-auto text-left" style={{ ...commonStyle, textAlign: 'left' }}>
                        <h3 className="font-bold underline mb-3 text-base">INSTRUCTIONS TO CANDIDATES</h3>
                        {isEditing ? (
                            <textarea
                                value={element.content}
                                onChange={(e) => handleContentChange(e.target.value)}
                                className="w-full h-full min-h-[100px] bg-transparent border border-gray-200 rounded p-2 focus:outline-none focus:border-blue-400 text-sm resize-none"
                                placeholder="Enter instructions (one per line)"
                                style={{
                                    ...commonStyle,
                                    font: 'inherit',
                                    lineHeight: 'inherit'
                                }}
                            />
                        ) : (
                            <ol className="list-decimal ml-6 space-y-1 text-sm">
                                {element.content.split('\n').filter(l => l.trim()).map((line, i) => (
                                    <li key={i}>{line}</li>
                                ))}
                            </ol>
                        )}
                    </div>
                );

            default: // 'text'
                return isEditing ? (
                    <textarea
                        value={element.content}
                        onChange={(e) => handleContentChange(e.target.value)}
                        onFocus={() => setIsTextEditing(true)}
                        onBlur={() => setIsTextEditing(false)}
                        className={`bg-white/50 hover:bg-white/90 focus:bg-white focus:outline-none transition-colors rounded resize-none overflow-hidden w-full h-full ${fontSizeClass}`}
                        style={{
                            ...commonStyle,
                            background: 'transparent',
                            padding: 0,
                            margin: 0,
                            border: 'none',
                            outline: 'none',
                            font: 'inherit',
                            color: 'inherit',
                            lineHeight: commonStyle.lineHeight || 'inherit'
                        }}
                    />
                ) : (
                    <div
                        className={`whitespace-pre-wrap w-full h-full overflow-visible ${fontSizeClass}`}
                        style={{ ...commonStyle, wordBreak: 'break-word' }}
                    >
                        {element.content}
                    </div>
                );
        }
    };

    return (
        <div
            ref={elementRef}
            className={`absolute group ${isEditing ? 'cursor-move' : ''} ${isResizing ? 'cursor-nwse-resize' : ''}`}
            style={{
                left: `${element.x}%`,
                top: `${element.y}%`,
                width: `${currentWidth}%`,
                height: currentHeightStyle,
                transform: isDragging ? 'translate(1px, 1px)' : 'none', // Subtle feedback
                zIndex: (isDragging || isResizing) ? 1000 : (isTextEditing ? 500 : 10),
                border: isEditing ? '1px dashed rgba(0,0,0,0.1)' : 'none', // Outline hint
            }}
            onMouseDown={isEditing ? handleMouseDown : undefined}
        >
            {/* Hover Outline */}
            <div className={`absolute inset-0 border border-blue-400 border-dashed rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity ${isResizing || isTextEditing ? 'opacity-100' : ''}`} />

            {/* Drag Handle (Left side indicator) */}
            {isEditing && (
                <div className="absolute -left-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing p-1">
                    {/* Hand icon */}
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                        <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
                        <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v6" />
                        <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
                        <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
                    </svg>
                </div>
            )}

            {/* Delete Button */}
            {isEditing && onDelete && (
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(element.id); }}
                    className="absolute -right-2 -top-6 w-5 h-5 text-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center font-bold"
                    title="Delete"
                >
                    ×
                </button>
            )}

            {ResizeHandles}
            {renderContent()}
        </div>
    );
};
