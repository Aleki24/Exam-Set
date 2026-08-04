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
 * WHY THIS FILE CARRIES A MATRIX CLASS
 *
 * Fixing the API call above made PDFs work locally and left them still failing
 * in production, with the same unhelpful message. The reason was not the call
 * at all:
 *
 *   Cannot load "@napi-rs/canvas" package: "Error: Cannot find module ..."
 *   Cannot polyfill `DOMMatrix`, rendering may be broken.
 *   ReferenceError: DOMMatrix is not defined
 *
 * `pdfjs` runs in browsers, where `DOMMatrix` is built in. In Node it has to
 * borrow one, and it borrows from `@napi-rs/canvas` — a native module that is
 * a dependency of `pdf-parse`, present locally, and absent from the deployed
 * function, because a `require()` reached through `createRequire` inside a
 * try/catch is not something a bundler's file tracing can follow. So the
 * package was never uploaded, `DOMMatrix` was never defined, and the first
 * thing that asked for one threw.
 *
 * The obvious repair — depend on `@napi-rs/canvas` directly and force it into
 * the bundle — costs about 58 MB of native binaries in every deployment of a
 * route that reads text. Before paying that, it is worth asking what pulling
 * text out of a PDF actually wants a matrix *for*. Instrumenting the real call
 * with a recording stand-in answers it exactly: `getText()` calls
 * `new DOMMatrix()` once and never reads a property, never calls a method,
 * never looks at the result. It constructs a default transform it does not go
 * on to use, because transforming glyphs onto a canvas is a rendering concern
 * and rendering is not happening here.
 *
 * So this supplies the matrix itself. It is a real implementation rather than
 * an empty shell on purpose: a stub whose methods silently returned nothing
 * would turn a loud `ReferenceError` into quietly wrong geometry if this path
 * ever does begin to use one, and wrong text pulled off a real paper is worse
 * than a failed upload. What is implemented is implemented correctly; what is
 * not implemented is simply absent, so an unsupported use throws where it
 * happens instead of returning a plausible wrong answer.
 *
 * Rendering a PDF to an image would still need the native package. Nothing
 * here does that, and if something ever does, it should depend on it openly.
 */

/**
 * The 2D affine transform `DOMMatrix` describes:
 *
 *     | a  c  e |
 *     | b  d  f |
 *     | 0  0  1 |
 */
class Affine2D {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;

    constructor(init?: number[] | string) {
        if (Array.isArray(init)) {
            if (init.length === 6) {
                [this.a, this.b, this.c, this.d, this.e, this.f] = init;
            } else if (init.length === 16) {
                // A 4x4 in column-major order, of which a 2D transform uses six.
                this.a = init[0];
                this.b = init[1];
                this.c = init[4];
                this.d = init[5];
                this.e = init[12];
                this.f = init[13];
            } else {
                throw new TypeError(`DOMMatrix: expected 6 or 16 values, received ${init.length}`);
            }
        } else if (typeof init === 'string' && init.trim() !== '') {
            // Parsing CSS transform syntax is a real feature of the real thing.
            // Nothing here passes one, so refuse rather than half-read it.
            throw new TypeError('DOMMatrix: parsing a transform string is not supported here');
        }
    }

    get is2D(): boolean {
        return true;
    }

    get isIdentity(): boolean {
        return this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0;
    }

    // The 4x4 names for the same six numbers, which callers may use instead.
    get m11(): number { return this.a; }
    get m12(): number { return this.b; }
    get m21(): number { return this.c; }
    get m22(): number { return this.d; }
    get m41(): number { return this.e; }
    get m42(): number { return this.f; }

    /** this × other, in that order. */
    multiply(other: Affine2D): Affine2D {
        const result = new Affine2D();
        result.a = this.a * other.a + this.c * other.b;
        result.b = this.b * other.a + this.d * other.b;
        result.c = this.a * other.c + this.c * other.d;
        result.d = this.b * other.c + this.d * other.d;
        result.e = this.a * other.e + this.c * other.f + this.e;
        result.f = this.b * other.e + this.d * other.f + this.f;
        return result;
    }

    translate(tx = 0, ty = 0): Affine2D {
        const t = new Affine2D();
        t.e = tx;
        t.f = ty;
        return this.multiply(t);
    }

    scale(sx = 1, sy?: number): Affine2D {
        const s = new Affine2D();
        s.a = sx;
        s.d = sy === undefined ? sx : sy;
        return this.multiply(s);
    }

    /** The inverse, or a matrix of NaN when there is none — as the real one does. */
    inverse(): Affine2D {
        const determinant = this.a * this.d - this.b * this.c;
        const result = new Affine2D();
        if (determinant === 0 || !Number.isFinite(determinant)) {
            result.a = result.b = result.c = result.d = result.e = result.f = NaN;
            return result;
        }
        result.a = this.d / determinant;
        result.b = -this.b / determinant;
        result.c = -this.c / determinant;
        result.d = this.a / determinant;
        result.e = (this.c * this.f - this.d * this.e) / determinant;
        result.f = (this.b * this.e - this.a * this.f) / determinant;
        return result;
    }

    transformPoint(point: { x?: number; y?: number } = {}): { x: number; y: number; z: number; w: number } {
        const x = point.x ?? 0;
        const y = point.y ?? 0;
        return { x: this.a * x + this.c * y + this.e, y: this.b * x + this.d * y + this.f, z: 0, w: 1 };
    }

    toString(): string {
        return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`;
    }
}

/**
 * Gives `pdfjs` a `DOMMatrix` when the platform has not.
 *
 * Never replaces one that already exists, so a browser's own implementation —
 * or the native package's, where it is installed — always wins over this.
 */
export function ensureDomMatrix(): void {
    const scope = globalThis as any;
    if (typeof scope.DOMMatrix === 'function') return;
    scope.DOMMatrix = Affine2D;
}

/** Exported for the verify script, which checks the arithmetic directly. */
export const __DOMMatrixImplementation = Affine2D;

/**
 * Reads the text out of a PDF.
 *
 * `pdf-parse` 2.x exports a `PDFParse` class: `new PDFParse({ data: buffer })`,
 * then `await parser.getText()`. Not the callable function 1.x was.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
    // Before pdfjs loads: it looks for a DOMMatrix as it initialises, and warns
    // that rendering "may be broken" when it finds none.
    ensureDomMatrix();

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
