'use client';

import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface LatexRendererProps {
    content: string;
    className?: string;
}

/**
 * Renders text with LaTeX expressions.
 * Supports inline math: $...$
 * Supports block math: $$...$$
 */
const LatexRenderer: React.FC<LatexRendererProps> = ({ content, className = '' }) => {
    const renderLatex = (text: string): React.ReactNode[] => {
        const parts: React.ReactNode[] = [];
        let remaining = text;
        let key = 0;

        // Pattern to match both block ($$...$$) and inline ($...$) LaTeX
        const latexRegex = /\$\$([\s\S]*?)\$\$|\$((?!\$)[^\n$]*?)\$/g;

        // Pattern for inline blanks (3 or more underscores: ___)
        const blankRegex = /_{3,}/g;

        let lastIndex = 0;
        let match;

        while ((match = latexRegex.exec(remaining)) !== null) {
            // Add text before the match
            if (match.index > lastIndex) {
                const textSegment = remaining.slice(lastIndex, match.index);
                // Process blanks within the text segment
                const partsWithBlanks = textSegment.split(blankRegex);
                const matches = textSegment.match(blankRegex);

                partsWithBlanks.forEach((part, i) => {
                    parts.push(
                        <span key={key++} dangerouslySetInnerHTML={{ __html: part }} />
                    );
                    if (matches && i < matches.length) {
                        parts.push(
                            <span
                                key={key++}
                                className="inline-block border-b-2 border-current min-w-[3rem] mx-1 relative top-1"
                                aria-hidden="true"
                            ></span>
                        );
                    }
                });
            }

            const isBlock = match[1] !== undefined;
            const latex = isBlock ? match[1] : match[2];

            try {
                const html = katex.renderToString(latex, {
                    throwOnError: false,
                    displayMode: isBlock,
                    strict: false,
                });

                if (isBlock) {
                    parts.push(
                        <div
                            key={key++}
                            className="my-4 overflow-x-auto"
                            dangerouslySetInnerHTML={{ __html: html }}
                        />
                    );
                } else {
                    parts.push(
                        <span
                            key={key++}
                            dangerouslySetInnerHTML={{ __html: html }}
                        />
                    );
                }
            } catch (error) {
                // If parsing fails, show the original text
                parts.push(
                    <span key={key++} className="text-destructive font-bold" title="LaTeX parsing error">
                        {match[0]}
                    </span>
                );
            }

            lastIndex = match.index + match[0].length;
        }

        // Add remaining text after last match
        if (lastIndex < remaining.length) {
            const textSegment = remaining.slice(lastIndex);
            // Process blanks within the remaining text segment
            const partsWithBlanks = textSegment.split(blankRegex);
            const matches = textSegment.match(blankRegex);

            partsWithBlanks.forEach((part, i) => {
                parts.push(
                    <span key={key++} dangerouslySetInnerHTML={{ __html: part }} />
                );
                if (matches && i < matches.length) {
                    parts.push(
                        <span
                            key={key++}
                            className="inline-block border-b-2 border-current min-w-[3rem] mx-1 relative top-1"
                            aria-hidden="true"
                        ></span>
                    );
                }
            });
        }

        return parts.length > 0 ? parts : [<span key={0}>{text}</span>];
    };

    // Check if content contains any LaTeX or blanks
    const hasLatex = /\$/.test(content) || /_{3,}/.test(content);

    if (!hasLatex) {
        return <span className={className} dangerouslySetInnerHTML={{ __html: content }} />;
    }

    return (
        <span className={`latex-content ${className}`}>
            {renderLatex(content)}
        </span>
    );
};

export default LatexRenderer;
