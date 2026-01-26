import React, { forwardRef } from 'react';
import { ExamTheme } from '../themes';

interface PageProps {
    children: React.ReactNode;
    theme: ExamTheme;
    pageNumber?: number;
    className?: string; // For additional styling if needed
    autoHeight?: boolean; // New prop to allow growing
}

export const Page = forwardRef<HTMLDivElement, PageProps>(({ children, theme, pageNumber, className = '', autoHeight = false }, ref) => {
    return (
        <div
            ref={ref}
            className={`page-container bg-white relative box-border ${className} ${!autoHeight ? 'overflow-hidden' : ''}`}
            style={{
                width: '210mm',
                height: autoHeight ? 'auto' : '297mm',
                minHeight: '297mm', // Strict A4 height
                maxHeight: autoHeight ? 'none' : '297mm',
                padding: `${theme.margin}mm`,
                fontFamily: theme.fontFamily,
                fontSize: `${theme.fontSize}pt`,
                lineHeight: theme.lineHeight,
            }}
        >
            <div className="page-content min-h-full w-full">
                {children}
            </div>

            {/* Footer / Page Number */}
            <div
                className="absolute bottom-4 left-0 right-0 text-center text-xs opacity-60"
                style={{ fontFamily: 'sans-serif' }}
            >
                {pageNumber && <span>Page {pageNumber}</span>}
            </div>
        </div>
    );
});

Page.displayName = 'Page';
