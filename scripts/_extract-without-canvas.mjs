/**
 * Reads a PDF with `@napi-rs/canvas` made unreachable — the deployed function's
 * actual condition, reproduced without touching node_modules.
 *
 * Run as a child process by verify-document-text.mjs, because the block has to
 * be in place before pdfjs is ever loaded, and a process that has already
 * loaded it cannot go back. Prints the extracted text on stdout, or `THREW: …`.
 */

import { registerHooks } from 'node:module';
import { jsPDF } from 'jspdf';
import { createJiti } from 'jiti';

// pdfjs reaches for the native package through createRequire(). Refusing to
// resolve it here produces exactly the "Cannot find module" the deployment hit.
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === '@napi-rs/canvas') {
            throw Object.assign(new Error("Cannot find module '@napi-rs/canvas'"), {
                code: 'MODULE_NOT_FOUND',
            });
        }
        return nextResolve(specifier, context);
    },
});

const jiti = createJiti(import.meta.url, {
    alias: { '@': new URL('../src', import.meta.url).pathname },
    interopDefault: true,
});

const { extractPdfText } = await jiti.import('../src/services/documentText.ts');

const doc = new jsPDF();
doc.text('1. Define photosynthesis. (2 marks)', 20, 20);
doc.text('2. State two factors affecting osmosis. (3 marks)', 20, 30);
const buffer = Buffer.from(doc.output('arraybuffer'));

try {
    const text = await extractPdfText(buffer);
    process.stdout.write(`TEXT:${JSON.stringify(text)}`);
} catch (error) {
    process.stdout.write(`THREW: ${error?.constructor?.name} | ${error?.message}`);
}
