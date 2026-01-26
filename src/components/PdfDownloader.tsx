'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import * as htmlToImage from 'html-to-image';
import jsPDF from 'jspdf';

interface PdfDownloaderProps {
    elementId?: string;
    filename?: string;
    children: React.ReactNode;
    className?: string;
    // Optional callback to save exam after PDF is generated
    onPdfGenerated?: (pdfBlob: Blob) => Promise<void>;
}

export default function PdfDownloader({
    elementId,
    filename = 'document.pdf',
    children,
    className = '',
    onPdfGenerated
}: PdfDownloaderProps) {
    const [loading, setLoading] = useState(false);

    const generatePdf = async () => {
        if (loading) return;

        const element = elementId ? document.getElementById(elementId) : null;
        if (!element) {
            toast.error('Content not found. Please ensure questions are added.');
            return;
        }

        setLoading(true);

        try {
            // Clone the element
            const clone = element.cloneNode(true) as HTMLElement;

            // Setup hidden container
            const container = document.createElement('div');
            container.style.position = 'absolute';
            container.style.left = '-9999px';
            container.style.top = '0';
            container.style.width = '210mm';
            document.body.appendChild(container);
            container.appendChild(clone);

            // 1. SAFELY EXTRACT AND INLINE CSS
            // Iterate over all loaded stylesheets and extract rules where allowed
            // This bypasses the "Cannot access rules" error by catching it per-sheet
            const cssRules: string[] = [];
            Array.from(document.styleSheets).forEach(sheet => {
                try {
                    // Try to access rules - this explicitly fails for CORS sheets
                    const rules = sheet.cssRules;
                    if (rules) {
                        Array.from(rules).forEach(rule => {
                            cssRules.push(rule.cssText);
                        });
                    }
                } catch (e) {
                    // CORS error likely - ignore this sheet to prevent crash
                    console.warn('Skipping stylesheet due to security access:', sheet.href);
                }
            });

            // Create a single style tag with all safe CSS
            const styleTag = document.createElement('style');
            styleTag.textContent = cssRules.join('\n');
            clone.insertBefore(styleTag, clone.firstChild);

            // Remove existing link/style tags from the clone to prevent double-loading/errors
            // We only keep our safe inline style
            const links = clone.querySelectorAll('link[rel="stylesheet"], style');
            links.forEach(el => {
                if (el !== styleTag) el.remove();
            });

            // 2. CLEANUP UI STYLES (Margins, Shadows)
            clone.classList.remove('bg-secondary/50');
            clone.style.backgroundColor = 'white';

            Array.from(clone.children).forEach((child) => {
                const node = child as HTMLElement;
                if (!node.tagName) return; // Skip non-element nodes

                // Remove margins/shadows for seamless A4 stacking
                node.classList.remove('mb-12');
                node.style.marginBottom = '0';
                node.style.boxShadow = 'none';
                node.classList.remove('shadow-[0_20px_50px_rgba(0,0,0,0.1)]');
                node.style.backgroundColor = 'white';
            });

            // 3. GENERATE IMAGE
            const dataUrl = await htmlToImage.toPng(clone, {
                quality: 0.95,
                backgroundColor: '#ffffff',
                cacheBust: true,
                skipFonts: true, // Double safety
            });

            // Clean up DOM
            document.body.removeChild(container);

            // 4. GENERATE PDF
            const pdfWidth = 210;
            const pdfHeight = 297;

            const img = new Image();
            img.src = dataUrl;
            await new Promise((resolve) => { img.onload = resolve; });

            const imgWidth = pdfWidth;
            const imgHeight = (img.height * pdfWidth) / img.width;

            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            let heightLeft = imgHeight;
            let position = 0;

            pdf.addImage(dataUrl, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pdfHeight;

            while (heightLeft > 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(dataUrl, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pdfHeight;
            }

            // Get PDF as blob for potential upload
            const pdfBlob = pdf.output('blob');

            // Save locally
            pdf.save(filename);

            // Call optional callback to save to database/R2
            if (onPdfGenerated) {
                try {
                    await onPdfGenerated(pdfBlob);
                } catch (uploadError) {
                    console.error('Failed to save exam to database:', uploadError);
                    // Don't alert - PDF was still generated successfully
                }
            }


        } catch (error: any) {
            console.error('PDF generation detailed error:', error);
            // Show more detailed error to user
            toast.error(`PDF generation failed: ${error.message || 'Unknown error'}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            onClick={generatePdf}
            disabled={loading}
            className={className + (loading ? ' opacity-50 cursor-wait' : '')}
            title="Download PDF"
        >
            {loading ? (
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            ) : children}
        </button>
    );
}
