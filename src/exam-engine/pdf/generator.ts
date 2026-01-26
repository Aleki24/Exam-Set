import { jsPDF } from 'jspdf';
import { toJpeg } from 'html-to-image';

/**
 * Generates a PDF from a list of Page container elements.
 * 
 * @param pageElements Array of HTMLElements representing the .page-container nodes
 * @param filename Output filename
 */
export async function generatePDF(pageElements: HTMLElement[], filename: string = 'exam-paper.pdf') {
    // A4 dimensions in mm
    const doc = new jsPDF('p', 'mm', 'a4');
    const width = 210;
    const height = 297;

    for (let i = 0; i < pageElements.length; i++) {
        const pageEl = pageElements[i];

        // Ensure the element is visible for capture (it might be in a hidden container off-screen)
        // html-to-image handles off-screen if it's in the DOM.

        try {
            // Capture as JPEG with high quality
            // We use a scale of 2 for better text resolution (retina-like), 
            // but not too high to crash memory.
            const dataUrl = await toJpeg(pageEl, {
                quality: 0.95,
                pixelRatio: 2,
                backgroundColor: '#ffffff',
                skipFonts: true, // Skip cross-origin fonts to avoid CORS cssRules error
            });

            if (i > 0) {
                doc.addPage();
            }

            doc.addImage(dataUrl, 'JPEG', 0, 0, width, height);

        } catch (error) {
            console.error(`Error capturing page ${i + 1}:`, error);
        }
    }

    doc.save(filename);
}
