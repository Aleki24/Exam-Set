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

        let lastIndex = 0;
        let match;

        while ((match = latexRegex.exec(remaining)) !== null) {
            // Add text before the match
            if (match.index > lastIndex) {
                parts.push(
                    <span key={key++}>
                        {remaining.slice(lastIndex, match.index)}
                    </span>
                );
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
            parts.push(
                <span key={key++}>
                    {remaining.slice(lastIndex)}
                </span>
            );
        }

        return parts.length > 0 ? parts : [<span key={0}>{text}</span>];
    };

    // Check if content contains any LaTeX
    const hasLatex = /\$/.test(content);

    if (!hasLatex) {
        return <span className={className}>{content}</span>;
    }

    return (
        <span className={`latex-content ${className}`}>
            {renderLatex(content)}
        </span>
    );
};

export default LatexRenderer;
