'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import Underline from '@tiptap/extension-underline';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import Gapcursor from '@tiptap/extension-gapcursor';
import { MathExtension } from '@aarkue/tiptap-math-extension';
import {
    Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered,
    Image as ImageIcon, Table as TableIcon, Undo, Redo,
    Heading1, Heading2, Heading3, Quote, Code, Minus,
    Sigma, AlignLeft, AlignCenter, AlignRight, AlignJustify,
    Subscript as SubIcon, Superscript as SupIcon,
    TableCellsMerge, Trash2, X, ChevronDown
} from 'lucide-react';
import 'katex/dist/katex.min.css';

interface RichTextEditorProps {
    value: string;
    onChange: (content: string) => void;
    placeholder?: string;
}

// Math symbols organized by category
// useSymbol: true = insert Unicode symbol directly, false = use LaTeX rendering
const MATH_SYMBOLS = {
    'Greek Letters': [
        { symbol: 'α', latex: '\\alpha', name: 'alpha', useSymbol: true },
        { symbol: 'β', latex: '\\beta', name: 'beta', useSymbol: true },
        { symbol: 'γ', latex: '\\gamma', name: 'gamma', useSymbol: true },
        { symbol: 'δ', latex: '\\delta', name: 'delta', useSymbol: true },
        { symbol: 'ε', latex: '\\epsilon', name: 'epsilon', useSymbol: true },
        { symbol: 'θ', latex: '\\theta', name: 'theta', useSymbol: true },
        { symbol: 'λ', latex: '\\lambda', name: 'lambda', useSymbol: true },
        { symbol: 'μ', latex: '\\mu', name: 'mu', useSymbol: true },
        { symbol: 'π', latex: '\\pi', name: 'pi', useSymbol: true },
        { symbol: 'σ', latex: '\\sigma', name: 'sigma', useSymbol: true },
        { symbol: 'τ', latex: '\\tau', name: 'tau', useSymbol: true },
        { symbol: 'φ', latex: '\\phi', name: 'phi', useSymbol: true },
        { symbol: 'ω', latex: '\\omega', name: 'omega', useSymbol: true },
        { symbol: 'Δ', latex: '\\Delta', name: 'Delta', useSymbol: true },
        { symbol: 'Σ', latex: '\\Sigma', name: 'Sigma', useSymbol: true },
        { symbol: 'Ω', latex: '\\Omega', name: 'Omega', useSymbol: true },
    ],
    'Operators': [
        { symbol: '±', latex: '\\pm', name: 'plus-minus', useSymbol: true },
        { symbol: '×', latex: '\\times', name: 'times', useSymbol: true },
        { symbol: '÷', latex: '\\div', name: 'divide', useSymbol: true },
        { symbol: '≠', latex: '\\neq', name: 'not equal', useSymbol: true },
        { symbol: '≤', latex: '\\leq', name: 'less than or equal', useSymbol: true },
        { symbol: '≥', latex: '\\geq', name: 'greater than or equal', useSymbol: true },
        { symbol: '≈', latex: '\\approx', name: 'approximately', useSymbol: true },
        { symbol: '∝', latex: '\\propto', name: 'proportional to', useSymbol: true },
        { symbol: '∞', latex: '\\infty', name: 'infinity', useSymbol: true },
        { symbol: '√', latex: '\\sqrt{}', name: 'square root', useSymbol: true },
        { symbol: '∛', latex: '\\sqrt[3]{}', name: 'cube root', useSymbol: true },
    ],
    'Calculus': [
        { symbol: '∫', latex: '\\int', name: 'integral', useSymbol: true },
        { symbol: '∮', latex: '\\oint', name: 'contour integral', useSymbol: true },
        { symbol: '∂', latex: '\\partial', name: 'partial derivative', useSymbol: true },
        { symbol: '∇', latex: '\\nabla', name: 'nabla', useSymbol: true },
        { symbol: 'lim', latex: '\\lim_{x \\to a}', name: 'limit', useSymbol: false },
        { symbol: '∑', latex: '\\sum_{i=1}^{n}', name: 'summation', useSymbol: false },
        { symbol: '∏', latex: '\\prod_{i=1}^{n}', name: 'product', useSymbol: false },
    ],
    'Sets & Logic': [
        { symbol: '∈', latex: '\\in', name: 'element of', useSymbol: true },
        { symbol: '∉', latex: '\\notin', name: 'not element of', useSymbol: true },
        { symbol: '⊂', latex: '\\subset', name: 'subset', useSymbol: true },
        { symbol: '⊃', latex: '\\supset', name: 'superset', useSymbol: true },
        { symbol: '∪', latex: '\\cup', name: 'union', useSymbol: true },
        { symbol: '∩', latex: '\\cap', name: 'intersection', useSymbol: true },
        { symbol: '∅', latex: '\\emptyset', name: 'empty set', useSymbol: true },
        { symbol: '∀', latex: '\\forall', name: 'for all', useSymbol: true },
        { symbol: '∃', latex: '\\exists', name: 'exists', useSymbol: true },
        { symbol: '¬', latex: '\\neg', name: 'not', useSymbol: true },
        { symbol: '∧', latex: '\\land', name: 'and', useSymbol: true },
        { symbol: '∨', latex: '\\lor', name: 'or', useSymbol: true },
        { symbol: '→', latex: '\\rightarrow', name: 'implies', useSymbol: true },
        { symbol: '↔', latex: '\\leftrightarrow', name: 'iff', useSymbol: true },
    ],
    'Arrows': [
        { symbol: '→', latex: '\\rightarrow', name: 'right arrow', useSymbol: true },
        { symbol: '←', latex: '\\leftarrow', name: 'left arrow', useSymbol: true },
        { symbol: '↑', latex: '\\uparrow', name: 'up arrow', useSymbol: true },
        { symbol: '↓', latex: '\\downarrow', name: 'down arrow', useSymbol: true },
        { symbol: '⇒', latex: '\\Rightarrow', name: 'double right arrow', useSymbol: true },
        { symbol: '⇔', latex: '\\Leftrightarrow', name: 'double left-right arrow', useSymbol: true },
    ],
    'Common Formulas': [
        { symbol: 'x²', latex: 'x^2', name: 'x squared', useSymbol: false },
        { symbol: 'xⁿ', latex: 'x^n', name: 'x to the n', useSymbol: false },
        { symbol: '√x', latex: '\\sqrt{x}', name: 'square root of x', useSymbol: false },
        { symbol: 'a/b', latex: '\\frac{a}{b}', name: 'fraction', useSymbol: false },
        { symbol: 'sin', latex: '\\sin(x)', name: 'sine', useSymbol: false },
        { symbol: 'cos', latex: '\\cos(x)', name: 'cosine', useSymbol: false },
        { symbol: 'tan', latex: '\\tan(x)', name: 'tangent', useSymbol: false },
        { symbol: 'log', latex: '\\log(x)', name: 'logarithm', useSymbol: false },
        { symbol: 'ln', latex: '\\ln(x)', name: 'natural log', useSymbol: false },
    ],
    'Chemistry': [
        { symbol: '→', latex: '\\rightarrow', name: 'reaction arrow', useSymbol: true },
        { symbol: '⇌', latex: '\\rightleftharpoons', name: 'equilibrium', useSymbol: true },
        { symbol: '↑', latex: '\\uparrow', name: 'gas evolution', useSymbol: true },
        { symbol: '↓', latex: '\\downarrow', name: 'precipitate', useSymbol: true },
        { symbol: 'H₂O', latex: 'H_2O', name: 'water', useSymbol: true },
        { symbol: 'CO₂', latex: 'CO_2', name: 'carbon dioxide', useSymbol: true },
    ],
};

// Toolbar button component
const ToolbarButton = ({
    onClick,
    active = false,
    disabled = false,
    title,
    children,
    variant = 'default'
}: {
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    title: string;
    children: React.ReactNode;
    variant?: 'default' | 'danger';
}) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`p-1.5 rounded transition-colors ${variant === 'danger'
            ? 'hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400'
            : active
                ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'
                : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
            } disabled:opacity-30 disabled:cursor-not-allowed`}
        title={title}
        type="button"
    >
        {children}
    </button>
);

const ToolbarDivider = () => (
    <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
);

// Math Symbol Picker Modal
const MathSymbolPicker = ({
    isOpen,
    onClose,
    onInsert
}: {
    isOpen: boolean;
    onClose: () => void;
    onInsert: (content: string, useSymbol: boolean) => void;
}) => {
    const [activeCategory, setActiveCategory] = useState('Greek Letters');
    const [customLatex, setCustomLatex] = useState('');

    if (!isOpen) return null;

    const categories = Object.keys(MATH_SYMBOLS);

    return (
        <div className="absolute top-full left-0 mt-2 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl w-[420px] max-h-[450px] flex flex-col">
            <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
                <h3 className="font-semibold text-gray-900 dark:text-white">Math Symbols</h3>
                <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Custom LaTeX Input */}
            <div className="p-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Custom LaTeX:</label>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={customLatex}
                        onChange={(e) => setCustomLatex(e.target.value)}
                        placeholder="e.g., \frac{a}{b}"
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                    />
                    <button
                        onClick={() => {
                            if (customLatex) {
                                onInsert(customLatex, false); // Custom LaTeX always uses LaTeX rendering
                                setCustomLatex('');
                            }
                        }}
                        className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                    >
                        Insert
                    </button>
                </div>
            </div>

            {/* Category Tabs - Scrollable horizontally */}
            <div className="flex overflow-x-auto border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 shrink-0">
                {categories.map((cat) => (
                    <button
                        key={cat}
                        onClick={() => setActiveCategory(cat)}
                        className={`px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${activeCategory === cat
                            ? 'text-blue-600 border-b-2 border-blue-600 bg-white dark:bg-gray-800'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                            }`}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {/* Symbols Grid - Scrollable vertically */}
            <div className="p-3 max-h-[250px] overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-7 gap-1">
                    {MATH_SYMBOLS[activeCategory as keyof typeof MATH_SYMBOLS].map((item, idx) => (
                        <button
                            key={idx}
                            onClick={() => onInsert(item.useSymbol ? item.symbol : item.latex, item.useSymbol)}
                            title={item.name}
                            className="p-2 text-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors text-gray-900 dark:text-white border border-transparent hover:border-blue-200 dark:hover:border-blue-800 aspect-square flex items-center justify-center"
                        >
                            {item.symbol}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

const MenuBar = ({ editor }: { editor: Editor | null }) => {
    const [showMathPicker, setShowMathPicker] = useState(false);

    // All hooks must be called before any conditional returns
    const addImage = useCallback(() => {
        if (!editor) return;
        // Create a hidden file input to pick images from local storage
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                // Convert file to base64
                const reader = new FileReader();
                reader.onload = () => {
                    const base64 = reader.result as string;
                    editor.chain().focus().setImage({ src: base64 }).run();
                };
                reader.readAsDataURL(file);
            }
        };
        input.click();
    }, [editor]);

    const insertTable = useCallback(() => {
        if (!editor) return;
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    }, [editor]);

    const insertMath = useCallback((content: string, useSymbol: boolean) => {
        if (!editor) return;
        if (useSymbol) {
            // Insert Unicode symbol directly as plain text
            editor.chain().focus().insertContent(content).run();
        } else {
            // Insert as LaTeX formula wrapped in $...$
            editor.chain().focus().insertContent(`$${content}$`).run();
        }
        setShowMathPicker(false);
    }, [editor]);

    if (!editor) {
        return null;
    }

    const isTableActive = editor.isActive('table');


    return (
        <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-2 rounded-t-lg relative">
            <div className="flex flex-wrap gap-0.5 items-center">
                {/* Text Formatting */}
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    active={editor.isActive('bold')}
                    disabled={!editor.can().chain().focus().toggleBold().run()}
                    title="Bold (Ctrl+B)"
                >
                    <Bold className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    active={editor.isActive('italic')}
                    disabled={!editor.can().chain().focus().toggleItalic().run()}
                    title="Italic (Ctrl+I)"
                >
                    <Italic className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                    active={editor.isActive('underline')}
                    title="Underline (Ctrl+U)"
                >
                    <UnderlineIcon className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                    active={editor.isActive('strike')}
                    title="Strikethrough"
                >
                    <Strikethrough className="w-4 h-4" />
                </ToolbarButton>

                <ToolbarDivider />

                {/* Subscript/Superscript */}
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleSubscript().run()}
                    active={editor.isActive('subscript')}
                    title="Subscript (H₂O)"
                >
                    <SubIcon className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleSuperscript().run()}
                    active={editor.isActive('superscript')}
                    title="Superscript (x²)"
                >
                    <SupIcon className="w-4 h-4" />
                </ToolbarButton>

                <ToolbarDivider />

                {/* Headings */}
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                    active={editor.isActive('heading', { level: 1 })}
                    title="Heading 1"
                >
                    <Heading1 className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    active={editor.isActive('heading', { level: 2 })}
                    title="Heading 2"
                >
                    <Heading2 className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                    active={editor.isActive('heading', { level: 3 })}
                    title="Heading 3"
                >
                    <Heading3 className="w-4 h-4" />
                </ToolbarButton>

                <ToolbarDivider />

                {/* Text Alignment */}
                <ToolbarButton
                    onClick={() => editor.chain().focus().setTextAlign('left').run()}
                    active={editor.isActive({ textAlign: 'left' })}
                    title="Align Left"
                >
                    <AlignLeft className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().setTextAlign('center').run()}
                    active={editor.isActive({ textAlign: 'center' })}
                    title="Align Center"
                >
                    <AlignCenter className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().setTextAlign('right').run()}
                    active={editor.isActive({ textAlign: 'right' })}
                    title="Align Right"
                >
                    <AlignRight className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().setTextAlign('justify').run()}
                    active={editor.isActive({ textAlign: 'justify' })}
                    title="Justify"
                >
                    <AlignJustify className="w-4 h-4" />
                </ToolbarButton>

                <ToolbarDivider />

                {/* Lists */}
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    active={editor.isActive('bulletList')}
                    title="Bullet List"
                >
                    <List className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    active={editor.isActive('orderedList')}
                    title="Numbered List"
                >
                    <ListOrdered className="w-4 h-4" />
                </ToolbarButton>

                <ToolbarDivider />

                {/* Block Elements */}
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBlockquote().run()}
                    active={editor.isActive('blockquote')}
                    title="Quote"
                >
                    <Quote className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                    active={editor.isActive('codeBlock')}
                    title="Code Block"
                >
                    <Code className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().setHorizontalRule().run()}
                    title="Horizontal Line"
                >
                    <Minus className="w-4 h-4" />
                </ToolbarButton>

                <ToolbarDivider />

                {/* Insert Elements */}
                <ToolbarButton onClick={addImage} title="Insert Image">
                    <ImageIcon className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton onClick={insertTable} title="Insert Table (3x3)">
                    <TableIcon className="w-4 h-4" />
                </ToolbarButton>

                {/* Math Symbol Picker Button */}
                <div className="relative">
                    <ToolbarButton
                        onClick={() => setShowMathPicker(!showMathPicker)}
                        title="Insert Math Symbol"
                        active={showMathPicker}
                    >
                        <div className="flex items-center gap-0.5">
                            <Sigma className="w-4 h-4" />
                            <ChevronDown className="w-3 h-3" />
                        </div>
                    </ToolbarButton>
                    <MathSymbolPicker
                        isOpen={showMathPicker}
                        onClose={() => setShowMathPicker(false)}
                        onInsert={insertMath}
                    />
                </div>

                {/* Undo/Redo */}
                <div className="flex items-center gap-0.5 ml-auto">
                    <ToolbarButton
                        onClick={() => editor.chain().focus().undo().run()}
                        disabled={!editor.can().chain().focus().undo().run()}
                        title="Undo (Ctrl+Z)"
                    >
                        <Undo className="w-4 h-4" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().redo().run()}
                        disabled={!editor.can().chain().focus().redo().run()}
                        title="Redo (Ctrl+Y)"
                    >
                        <Redo className="w-4 h-4" />
                    </ToolbarButton>
                </div>
            </div>

            {/* Table Controls - Second Row */}
            {isTableActive && (
                <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 flex-wrap">
                    <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold mr-2">Table Controls:</span>
                    <button
                        onClick={() => editor.chain().focus().addColumnBefore().run()}
                        className="px-2 py-1 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50"
                        title="Add Column Before"
                        type="button"
                    >
                        + Col ←
                    </button>
                    <button
                        onClick={() => editor.chain().focus().addColumnAfter().run()}
                        className="px-2 py-1 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50"
                        title="Add Column After"
                        type="button"
                    >
                        + Col →
                    </button>
                    <button
                        onClick={() => editor.chain().focus().addRowBefore().run()}
                        className="px-2 py-1 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50"
                        title="Add Row Before"
                        type="button"
                    >
                        + Row ↑
                    </button>
                    <button
                        onClick={() => editor.chain().focus().addRowAfter().run()}
                        className="px-2 py-1 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50"
                        title="Add Row After"
                        type="button"
                    >
                        + Row ↓
                    </button>
                    <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
                    <button
                        onClick={() => editor.chain().focus().deleteColumn().run()}
                        className="px-2 py-1 text-xs bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded hover:bg-red-100 dark:hover:bg-red-900/50"
                        title="Delete Column"
                        type="button"
                    >
                        − Col
                    </button>
                    <button
                        onClick={() => editor.chain().focus().deleteRow().run()}
                        className="px-2 py-1 text-xs bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded hover:bg-red-100 dark:hover:bg-red-900/50"
                        title="Delete Row"
                        type="button"
                    >
                        − Row
                    </button>
                    <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
                    <button
                        onClick={() => editor.chain().focus().mergeCells().run()}
                        className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                        title="Merge Cells"
                        type="button"
                    >
                        Merge
                    </button>
                    <button
                        onClick={() => editor.chain().focus().splitCell().run()}
                        className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                        title="Split Cell"
                        type="button"
                    >
                        Split
                    </button>
                    <button
                        onClick={() => editor.chain().focus().toggleHeaderRow().run()}
                        className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                        title="Toggle Header Row"
                        type="button"
                    >
                        Header
                    </button>
                    <button
                        onClick={() => editor.chain().focus().deleteTable().run()}
                        className="px-2 py-1 text-xs bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/70 ml-auto"
                        title="Delete Table"
                        type="button"
                    >
                        <Trash2 className="w-3 h-3 inline mr-1" />
                        Delete Table
                    </button>
                </div>
            )}
        </div>
    );
};

const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, placeholder }) => {
    // Track the last value we set to the editor to prevent infinite loops
    const [lastSetValue, setLastSetValue] = useState<string>('');

    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3] },
                gapcursor: false, // We'll add our own
            }),
            Image.configure({
                allowBase64: true,
                inline: true,
            }),
            Table.configure({
                resizable: true,
                HTMLAttributes: {
                    class: 'border-collapse table-auto w-full',
                },
            }),
            TableRow,
            TableHeader,
            TableCell,
            Underline,
            Subscript,
            Superscript,
            TextAlign.configure({
                types: ['heading', 'paragraph'],
            }),
            Placeholder.configure({
                placeholder: placeholder || 'Start typing your content...',
            }),
            Gapcursor,
            MathExtension.configure({
                evaluation: false,
            }),
        ],
        content: value,
        onUpdate: ({ editor }) => {
            const html = editor.getHTML();
            setLastSetValue(html);
            onChange(html);
        },
        editorProps: {
            attributes: {
                class: 'prose dark:prose-invert max-w-none focus:outline-none min-h-[200px] p-4 bg-white dark:bg-gray-900 rounded-b-lg',
            },
        },
    });

    // Sync editor content when prop value changes externally (e.g., opening edit modal with new question)
    useEffect(() => {
        if (editor && value !== lastSetValue) {
            // Only update if the value is meaningfully different from what we last set
            const currentContent = editor.getHTML();
            if (value !== currentContent) {
                editor.commands.setContent(value || '');
                setLastSetValue(value || '');
            }
        }
    }, [editor, value, lastSetValue]);

    return (
        <div className="border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all">
            <MenuBar editor={editor} />
            <EditorContent editor={editor} />
            <style jsx global>{`
                .ProseMirror { outline: none; }
                .ProseMirror > * + * { margin-top: 0.75em; }
                
                .ProseMirror h1 { font-size: 1.75rem; font-weight: 700; line-height: 1.2; margin: 1.5rem 0 0.5rem; }
                .ProseMirror h2 { font-size: 1.5rem; font-weight: 600; line-height: 1.3; margin: 1.25rem 0 0.5rem; }
                .ProseMirror h3 { font-size: 1.25rem; font-weight: 600; line-height: 1.4; margin: 1rem 0 0.5rem; }
                
                .ProseMirror ul, .ProseMirror ol { padding-left: 1.5rem; margin: 0.5rem 0; }
                .ProseMirror ul { list-style-type: disc; }
                .ProseMirror ol { list-style-type: decimal; }
                .ProseMirror li { margin: 0.25rem 0; }
                .ProseMirror li p { margin: 0; }
                
                .ProseMirror blockquote { border-left: 4px solid #3b82f6; padding-left: 1rem; margin: 1rem 0; font-style: italic; color: #6b7280; }
                .dark .ProseMirror blockquote { color: #9ca3af; border-left-color: #60a5fa; }
                
                .ProseMirror pre { background: #1f2937; color: #e5e7eb; font-family: 'JetBrains Mono', monospace; padding: 0.75rem 1rem; border-radius: 0.5rem; overflow-x: auto; }
                .ProseMirror code { background: rgba(0, 0, 0, 0.1); padding: 0.125rem 0.25rem; border-radius: 0.25rem; font-family: 'JetBrains Mono', monospace; font-size: 0.875em; }
                .dark .ProseMirror code { background: rgba(255, 255, 255, 0.1); }
                
                .ProseMirror hr { border: none; border-top: 2px solid #e5e7eb; margin: 1.5rem 0; }
                .dark .ProseMirror hr { border-top-color: #4b5563; }
                
                .ProseMirror table { border-collapse: collapse; margin: 1rem 0; overflow: hidden; table-layout: fixed; width: 100%; }
                .ProseMirror td, .ProseMirror th { border: 2px solid #d1d5db; box-sizing: border-box; min-width: 1em; padding: 8px 12px; position: relative; vertical-align: top; }
                .ProseMirror th { background-color: #f3f4f6; font-weight: 600; text-align: left; }
                .dark .ProseMirror td, .dark .ProseMirror th { border-color: #4b5563; }
                .dark .ProseMirror th { background-color: #374151; color: #e5e7eb; }
                .ProseMirror .selectedCell:after { background: rgba(59, 130, 246, 0.2); content: ""; left: 0; bottom: 0; right: 0; top: 0; position: absolute; pointer-events: none; z-index: 2; }
                .ProseMirror .column-resize-handle { background-color: #3b82f6; bottom: -2px; position: absolute; right: -2px; pointer-events: none; top: 0; width: 4px; }
                
                .ProseMirror img { max-width: 100%; height: auto; border-radius: 0.5rem; margin: 0.5rem 0; }
                .ProseMirror img.ProseMirror-selectednode { outline: 3px solid #3b82f6; }
                
                .ProseMirror p.is-editor-empty:first-child::before { color: #9ca3af; content: attr(data-placeholder); float: left; height: 0; pointer-events: none; }
                
                .tiptap-math { cursor: text; display: inline-block; padding: 0 4px; background: rgba(59, 130, 246, 0.1); border-radius: 4px; }
                .tiptap-math.ProseMirror-selectednode { background-color: rgba(59, 130, 246, 0.3); }
                
                .ProseMirror .gapcursor { position: relative; }
                .ProseMirror .gapcursor:after { position: absolute; top: -2px; left: -1px; width: 20px; border-top: 1px solid black; content: ""; animation: blink 1.1s steps(2, start) infinite; }
                @keyframes blink { to { visibility: hidden; } }
            `}</style>
        </div>
    );
};

export default RichTextEditor;
