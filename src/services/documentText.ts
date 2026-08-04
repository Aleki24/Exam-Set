/**
 * READING TEXT OUT OF AN UPLOADED DOCUMENT
 * ----------------------------------------------------------------------------
 * `/api/questions/extract` hands a PDF or Word document here and gets back its
 * text. Pulled out of the route specifically so this exact code — not a
 * description of it — is what a verify script exercises against real files.
 *
 * That distinction is the whole reason this module exists. The PDF path was
 * broken from the day it was written: `pdf-parse` was rewritten as a class at
 * 2.x, the route still called it as the old callable function, and every
 * single PDF upload threw `TypeError: pdfParse is not a function` before the
 * file was ever looked at. The route's own try/catch turned that into "Failed
 * to parse PDF" — a clean, plausible-looking error that gave no sign it was
 * the same failure every time. Nothing caught it because nothing had run a
 * real PDF through the route; the only verification this shipped with checked
 * the code that reads the model's *response*, which is a different function
 * entirely and was never wrong. `scripts/verify-document-text.mjs` now runs
 * generated PDFs through this exact function, so the same class of mistake —
 * an upstream package rewriting its API out from under a call site — fails a
 * script instead of a teacher's upload.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Reads the text out of a PDF.
 *
 * `pdf-parse` 2.x exports a `PDFParse` class: `new PDFParse({ data: buffer })`,
 * then `await parser.getText()`. Not the callable function 1.x was.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
    const { PDFParse } = await import('pdf-parse');
    let parser: InstanceType<typeof PDFParse> | undefined;
    try {
        parser = new PDFParse({ data: buffer });
        const result = await parser.getText();
        // The library inserts a "-- N of M --" marker between pages. Useful
        // for a human reading a long document; noise in what gets sent to a
        // model that only needs the words. Stripping it leaves a run of blank
        // lines behind, so those are collapsed too.
        return result.text
            .replace(/--\s*\d+\s+of\s+\d+\s*--/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    } finally {
        await parser?.destroy();
    }
}

/** Reads the text out of a Word document (.doc or .docx). */
export async function extractWordText(buffer: Buffer): Promise<string> {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
}
