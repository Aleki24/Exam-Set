/**
 * MATHS, MEASURED AND DRAWN
 * ----------------------------------------------------------------------------
 * The half of the maths typesetter that needs a document: how wide a fraction
 * is, how far it reaches above the line, and where every piece of it lands.
 *
 * Split from `mathText.ts` so the parser stays testable with no jsPDF and no
 * fonts. This file is where the typography lives.
 *
 * MEASUREMENT IS THE POINT
 *
 * Everything here reports a box — width, ascent above the baseline, descent
 * below it — before anything is drawn. Without that the paginator cannot know
 * a line carrying a fraction is half again as tall as one that is not, and the
 * fraction gets drawn over the question above it. The renderer measures the
 * whole paper twice before committing, so measuring and drawing MUST agree;
 * they are written as one pair of functions per node for that reason.
 *
 * The proportions are the conventional ones — the fraction bar sits on the
 * maths axis a little above the baseline, scripts are three-quarter size, a
 * surd's bar continues the radical glyph across the top of what is under it.
 */

import type { jsPDF } from 'jspdf';
import type { MathNode } from './mathText';
import { SYM, SYMBOL_DEFAULT_WIDTH, SYMBOL_WIDTHS } from './mathText';

/** The Symbol standard-14 font. Nothing is embedded; see `mathText.ts`. */
const SYMBOL_FONT = 'symbol';

export interface Box {
    width: number;
    /** Distance the box reaches above the baseline. Always positive. */
    ascent: number;
    /** Distance below. Always positive. */
    descent: number;
}

export interface MathStyle {
    /** The serif face the surrounding prose is set in. */
    font: string;
    size: number;
}

/* Times ascends to about 0.72 of its size and descends about 0.21. Measured
 * rather than guessed would need a metrics table; these are close enough that
 * a line never collides, which is all the paginator asks. */
const ASCENT = 0.72;
const DESCENT = 0.21;

/** Where the fraction bar sits, above the baseline. */
const AXIS = 0.26;
/** Clearance between the bar and the numerator or denominator. */
const FRAC_GAP = 0.14;
const FRAC_PAD = 0.12;
const RULE_WEIGHT = 0.06;

const SCRIPT_SCALE = 0.72;
const MIN_SCRIPT = 5.5;
const SUP_RISE = 0.42;
const SUB_DROP = 0.16;

const RADICAL_GAP = 0.1;
/** How far the top of the radical stroke sits above the baseline, in ems. */
const RADICAL_TOP = 0.68;

const scriptSize = (size: number) => Math.max(MIN_SCRIPT, size * SCRIPT_SCALE);

function setFont(doc: jsPDF, font: string, size: number): void {
    doc.setFont(font, 'normal');
    doc.setFontSize(size);
}

/**
 * Width of a Symbol-font glyph.
 *
 * From our own table, not from `getTextWidth`: jsPDF has no metrics for this
 * font and answers a flat 580/1000 for every glyph in it. π is really 549 and
 * the integral sign is 274, so trusting jsPDF drew π on top of the next
 * character and left a hole after an ∫.
 */
function symbolWidth(code: number, size: number): number {
    return ((SYMBOL_WIDTHS[code] ?? SYMBOL_DEFAULT_WIDTH) / 1000) * size;
}

// ---------------------------------------------------------------------------
// MEASURE
// ---------------------------------------------------------------------------

export function measureNodes(doc: jsPDF, nodes: MathNode[], style: MathStyle): Box {
    let width = 0;
    let ascent = style.size * ASCENT * 0.6;
    let descent = style.size * DESCENT * 0.6;

    for (const node of nodes) {
        const box = measureNode(doc, node, style);
        width += box.width;
        ascent = Math.max(ascent, box.ascent);
        descent = Math.max(descent, box.descent);
    }

    return { width, ascent, descent };
}

function measureNode(doc: jsPDF, node: MathNode, style: MathStyle): Box {
    const { size } = style;

    switch (node.kind) {
        case 'text': {
            setFont(doc, style.font, size);
            return {
                width: doc.getTextWidth(node.value),
                ascent: size * ASCENT,
                descent: size * DESCENT,
            };
        }

        case 'sym':
            return {
                width: symbolWidth(node.code, size),
                ascent: size * ASCENT,
                descent: size * DESCENT,
            };

        case 'space':
            return { width: size * node.em, ascent: 0, descent: 0 };

        case 'frac': {
            const inner: MathStyle = { ...style, size: size * 0.94 };
            const num = measureNodes(doc, node.num, inner);
            const den = measureNodes(doc, node.den, inner);
            const pad = size * FRAC_PAD;
            const gap = size * FRAC_GAP;
            const axis = size * AXIS;

            return {
                width: Math.max(num.width, den.width) + pad * 2,
                ascent: axis + gap + num.ascent + num.descent,
                descent: Math.max(0, gap + den.ascent + den.descent - axis),
            };
        }

        case 'sup': {
            const inner: MathStyle = { ...style, size: scriptSize(size) };
            const body = measureNodes(doc, node.body, inner);
            return {
                width: body.width,
                ascent: size * SUP_RISE + body.ascent,
                descent: 0,
            };
        }

        case 'sub': {
            const inner: MathStyle = { ...style, size: scriptSize(size) };
            const body = measureNodes(doc, node.body, inner);
            return {
                width: body.width,
                ascent: 0,
                descent: Math.max(0, size * SUB_DROP + body.descent),
            };
        }

        case 'sqrt': {
            const body = measureNodes(doc, node.body, style);
            const glyph = radicalMetrics(body, style);
            const index = node.index
                ? measureNodes(doc, node.index, { ...style, size: scriptSize(size) * 0.8 })
                : null;

            return {
                width: glyph.width + body.width + size * 0.14 + (index?.width ?? 0),
                ascent: glyph.size * RADICAL_TOP,
                descent: body.descent,
            };
        }
    }
}

/**
 * The radical sign, scaled so its bar meets what sits under it.
 *
 * One glyph has one height, and √(b² − 4ac) reaches higher than √5. The size
 * is chosen so the top of the stroke — `RADICAL_TOP` above the baseline —
 * clears the radicand, because the vinculum is drawn AT that height and has to
 * start exactly where the glyph's hook ends. Getting this wrong is what left
 * the bar floating above a detached tick.
 */
function radicalMetrics(body: Box, style: MathStyle): Box & { size: number } {
    const needed = body.ascent + style.size * RADICAL_GAP;
    const size = Math.max(style.size, needed / RADICAL_TOP);
    return {
        size,
        width: symbolWidth(SYM.radical, size),
        ascent: size * RADICAL_TOP,
        descent: size * DESCENT,
    };
}

// ---------------------------------------------------------------------------
// DRAW
// ---------------------------------------------------------------------------

/** Draws at `x`, with `baseline` the y of the surrounding line's baseline. */
export function drawNodes(
    doc: jsPDF,
    nodes: MathNode[],
    x: number,
    baseline: number,
    style: MathStyle
): number {
    let cursor = x;
    for (const node of nodes) {
        cursor += drawNode(doc, node, cursor, baseline, style);
    }
    return cursor - x;
}

function drawNode(
    doc: jsPDF,
    node: MathNode,
    x: number,
    baseline: number,
    style: MathStyle
): number {
    const { size } = style;

    switch (node.kind) {
        case 'text': {
            setFont(doc, style.font, size);
            doc.text(node.value, x, baseline);
            return doc.getTextWidth(node.value);
        }

        case 'sym': {
            setFont(doc, SYMBOL_FONT, size);
            doc.text(String.fromCharCode(node.code), x, baseline);
            return symbolWidth(node.code, size);
        }

        case 'space':
            return size * node.em;

        case 'frac': {
            const inner: MathStyle = { ...style, size: size * 0.94 };
            const num = measureNodes(doc, node.num, inner);
            const den = measureNodes(doc, node.den, inner);
            const pad = size * FRAC_PAD;
            const gap = size * FRAC_GAP;
            const axis = size * AXIS;
            const width = Math.max(num.width, den.width) + pad * 2;
            const ruleY = baseline - axis;

            // Both parts centred on the bar, which is what makes a stack read
            // as one term rather than two.
            drawNodes(doc, node.num, x + (width - num.width) / 2, ruleY - gap - num.descent, inner);
            drawNodes(doc, node.den, x + (width - den.width) / 2, ruleY + gap + den.ascent, inner);

            doc.setLineWidth(size * RULE_WEIGHT);
            doc.line(x + pad * 0.4, ruleY, x + width - pad * 0.4, ruleY);

            return width;
        }

        case 'sup': {
            const inner: MathStyle = { ...style, size: scriptSize(size) };
            return drawNodes(doc, node.body, x, baseline - size * SUP_RISE, inner);
        }

        case 'sub': {
            const inner: MathStyle = { ...style, size: scriptSize(size) };
            return drawNodes(doc, node.body, x, baseline + size * SUB_DROP, inner);
        }

        case 'sqrt': {
            const body = measureNodes(doc, node.body, style);
            const glyph = radicalMetrics(body, style);

            let cursor = x;

            // The root index, tucked into the radical's crook.
            if (node.index) {
                const indexStyle: MathStyle = { ...style, size: scriptSize(size) * 0.8 };
                const index = measureNodes(doc, node.index, indexStyle);
                drawNodes(doc, node.index, cursor, baseline - glyph.size * 0.42, indexStyle);
                cursor += index.width;
            }

            setFont(doc, SYMBOL_FONT, glyph.size);
            doc.text(String.fromCharCode(SYM.radical), cursor, baseline);
            cursor += glyph.width;

            // Level with the top of the stroke, so the bar continues the glyph
            // rather than hovering over it.
            const barY = baseline - glyph.size * RADICAL_TOP;
            const barWidth = body.width + size * 0.14;

            doc.setLineWidth(size * RULE_WEIGHT);
            doc.line(cursor - size * 0.02, barY, cursor + barWidth, barY);

            drawNodes(doc, node.body, cursor + size * 0.07, baseline, style);
            return cursor + barWidth - x;
        }
    }
}
