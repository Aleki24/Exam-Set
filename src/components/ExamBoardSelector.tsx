'use client';

import React, { useRef } from 'react';
import { ExamBoard, ExamBoardConfig, EXAM_BOARD_CONFIGS } from '@/types';

interface ExamBoardSelectorProps {
    selectedBoard: ExamBoard;
    onSelectBoard: (board: ExamBoard) => void;
    primaryColor: string;
    accentColor: string;
    onPrimaryColorChange: (color: string) => void;
    onAccentColorChange: (color: string) => void;
    logo?: string;
    onLogoChange: (logo: string | undefined) => void;
    additionalMaterials?: string;
    onAdditionalMaterialsChange: (materials: string) => void;
}

const ExamBoardSelector: React.FC<ExamBoardSelectorProps> = ({
    selectedBoard,
    onSelectBoard,
    primaryColor,
    accentColor,
    onPrimaryColorChange,
    onAccentColorChange,
    logo,
    onLogoChange,
    additionalMaterials,
    onAdditionalMaterialsChange
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                onLogoChange(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleBoardSelect = (board: ExamBoard) => {
        onSelectBoard(board);
        // Apply board's default colors
        const config = EXAM_BOARD_CONFIGS[board];
        onPrimaryColorChange(config.primaryColor);
        onAccentColorChange(config.accentColor);
    };

    const boards = Object.values(EXAM_BOARD_CONFIGS);

    return (
        <div className="space-y-6">
            {/* Exam Board Selection */}
            <div>
                <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-3">
                    Exam Board
                </label>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {boards.map((board) => (
                        <button
                            key={board.id}
                            onClick={() => handleBoardSelect(board.id)}
                            className={`p-3 rounded-xl border-2 transition-all text-left hover:shadow-md ${selectedBoard === board.id
                                    ? 'border-primary bg-primary/5 shadow-sm'
                                    : 'border-border bg-card hover:border-primary/30'
                                }`}
                        >
                            <div className="flex items-center gap-2 mb-1">
                                {/* Color indicator */}
                                <div
                                    className="w-3 h-3 rounded-full border border-white shadow-sm"
                                    style={{ backgroundColor: board.primaryColor }}
                                />
                                <span className="text-xs font-bold text-foreground truncate">
                                    {board.name}
                                </span>
                            </div>
                            <p className="text-[9px] text-muted-foreground">
                                {board.country}
                            </p>
                            <p className="text-[8px] text-muted-foreground/70 mt-0.5 truncate">
                                {board.description}
                            </p>
                        </button>
                    ))}
                </div>
            </div>

            {/* Color Customization */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-2">
                        Primary Color
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            type="color"
                            value={primaryColor}
                            onChange={(e) => onPrimaryColorChange(e.target.value)}
                            className="w-10 h-10 rounded-lg border border-border cursor-pointer"
                        />
                        <input
                            type="text"
                            value={primaryColor}
                            onChange={(e) => onPrimaryColorChange(e.target.value)}
                            className="flex-1 p-2 bg-secondary rounded-lg text-xs font-mono border border-border focus:border-primary outline-none"
                            placeholder="#0066B3"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-2">
                        Accent Color
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            type="color"
                            value={accentColor}
                            onChange={(e) => onAccentColorChange(e.target.value)}
                            className="w-10 h-10 rounded-lg border border-border cursor-pointer"
                        />
                        <input
                            type="text"
                            value={accentColor}
                            onChange={(e) => onAccentColorChange(e.target.value)}
                            className="flex-1 p-2 bg-secondary rounded-lg text-xs font-mono border border-border focus:border-primary outline-none"
                            placeholder="#AC145A"
                        />
                    </div>
                </div>
            </div>

            {/* Logo Upload */}
            <div>
                <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-2">
                    Institution Logo
                </label>
                <div className="flex items-center gap-4">
                    {/* Logo Preview */}
                    <div
                        className="w-16 h-16 rounded-xl border-2 border-dashed border-border bg-secondary flex items-center justify-center overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        {logo ? (
                            <img src={logo} alt="Logo" className="w-full h-full object-contain" />
                        ) : (
                            <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        )}
                    </div>

                    <div className="flex-1">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleLogoUpload}
                            className="hidden"
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="px-4 py-2 bg-secondary text-foreground rounded-lg text-xs font-bold hover:bg-accent transition-colors"
                        >
                            Upload Logo
                        </button>
                        {logo && (
                            <button
                                onClick={() => onLogoChange(undefined)}
                                className="ml-2 px-3 py-2 text-destructive hover:bg-destructive/10 rounded-lg text-xs font-bold transition-colors"
                            >
                                Remove
                            </button>
                        )}
                        <p className="text-[9px] text-muted-foreground mt-1">
                            PNG, JPG up to 2MB. Will appear on cover page.
                        </p>
                    </div>
                </div>
            </div>

            {/* Additional Materials */}
            <div>
                <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-2">
                    Additional Materials
                </label>
                <input
                    type="text"
                    value={additionalMaterials || ''}
                    onChange={(e) => onAdditionalMaterialsChange(e.target.value)}
                    placeholder="e.g., Ruler, Calculator, Protractor"
                    className="w-full p-3 bg-secondary rounded-xl text-sm border border-border focus:border-primary outline-none"
                />
                <p className="text-[9px] text-muted-foreground mt-1">
                    Items students are allowed to use during the exam
                </p>
            </div>

            {/* Preview Colors */}
            <div className="p-4 rounded-xl border border-border bg-secondary/50">
                <p className="text-[10px] font-bold uppercase text-muted-foreground mb-3">Color Preview</p>
                <div className="flex gap-4">
                    <div className="flex-1 h-12 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: primaryColor }}>
                        Primary
                    </div>
                    <div className="flex-1 h-12 rounded-lg flex items-center justify-center text-xs font-bold border-2" style={{ backgroundColor: accentColor, borderColor: primaryColor, color: accentColor === '#FFFFFF' ? primaryColor : 'white' }}>
                        Accent
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExamBoardSelector;
