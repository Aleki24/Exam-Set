'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { downloadMarkingSchemePdf, downloadPaperPdf } from '@/services/paperPdf';
import type { PaperSource, QuestionSource, SectionDeclaration } from '@/services/paperLayout';

interface PaperPdfButtonProps {
    paper: PaperSource;
    questions: QuestionSource[];
    asset: 'paper' | 'scheme';
    /** Set when the paper was built from a format, so its own sections print. */
    declaration?: SectionDeclaration;
    filename: string;
    className?: string;
    children: React.ReactNode;
}

/**
 * DOWNLOADING THE PAPER
 * ----------------------------------------------------------------------------
 * This replaces a button that photographed the preview: it rasterised the whole
 * page into one PNG, dropped that image into a PDF and sliced it every 297mm.
 * The result was a several-megabyte file of blurry grey text, with questions cut
 * in half wherever the image happened to cross a page boundary, no page numbers,
 * and nothing selectable or searchable. It also inherited whatever the app's
 * theme was doing, so a paper downloaded in dark mode came out unreadable.
 *
 * Nothing here touches the DOM. The same renderer that produces the file a buyer
 * downloads from the shop draws this one, from the questions themselves — so the
 * teacher who sets a paper and the teacher who buys one get the same document,
 * as real text, at tens of kilobytes.
 */
export default function PaperPdfButton({
    paper,
    questions,
    asset,
    declaration,
    filename,
    className = '',
    children,
}: PaperPdfButtonProps) {
    const [working, setWorking] = useState(false);

    const download = async () => {
        if (working) return;
        if (questions.length === 0) {
            toast.error('Add some questions before downloading');
            return;
        }

        setWorking(true);
        try {
            // Yield once so the button can show it is working before the render
            // blocks the main thread. A long paper is still only milliseconds.
            await new Promise((resolve) => setTimeout(resolve, 0));

            if (asset === 'scheme') {
                downloadMarkingSchemePdf(paper, questions, filename, declaration);
            } else {
                downloadPaperPdf(paper, questions, filename, declaration);
            }
        } catch (error) {
            console.error('Could not render the paper:', error);
            toast.error('Could not build the PDF. Please try again.');
        } finally {
            setWorking(false);
        }
    };

    return (
        <button
            type="button"
            onClick={download}
            disabled={working}
            className={`${className}${working ? ' cursor-wait opacity-60' : ''}`}
        >
            {working ? 'Building PDF…' : children}
        </button>
    );
}
