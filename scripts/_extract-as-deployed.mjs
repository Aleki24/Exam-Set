/**
 * Reads a PDF with the two things the deployed function turned out not to
 * have, made unreachable here: the native canvas package, and pdfjs's worker
 * by the runtime-computed path it normally loads that from.
 *
 * Both failed in production and nowhere else, because a machine with a full
 * node_modules resolves them without being asked twice. Blocking them puts the
 * deployment's conditions on this machine, which is the only way a check that
 * runs here could ever have caught either.
 *
 * Run as a child process by verify-document-text.mjs, because the blocks have
 * to be in place before pdfjs is ever loaded, and a process that has already
 * loaded it cannot go back. Prints the extracted text on stdout, or `THREW: …`.
 */

import { registerHooks } from 'node:module';
import { jsPDF } from 'jspdf';
import { createJiti } from 'jiti';

registerHooks({
    resolve(specifier, context, nextResolve) {
        // pdfjs reaches for the native package through createRequire().
        // Refusing it produces exactly the "Cannot find module" production hit.
        if (specifier === '@napi-rs/canvas') {
            throw Object.assign(new Error("Cannot find module '@napi-rs/canvas'"), {
                code: 'MODULE_NOT_FOUND',
            });
        }

        // The specifier pdfjs assembles at runtime for its worker, marked
        // `webpackIgnore` so that nothing follows it — which is why it was
        // never bundled. Refusing it proves the extractor no longer depends on
        // it: the worker is imported by its literal path instead, a different
        // specifier that stays allowed here exactly as it stays visible to
        // whatever traces the build.
        if (specifier === './pdf.worker.mjs') {
            throw Object.assign(
                new Error("Cannot find module './pdf.worker.mjs' — the fake-worker path is not available"),
                { code: 'MODULE_NOT_FOUND' }
            );
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
