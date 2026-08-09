/**
 * RENDERING A PAPER TO PDF
 * ----------------------------------------------------------------------------
 * A paper built in the setter is a list of question ids, not a file. Until it
 * becomes one it cannot be printed, sold or sent over WhatsApp — so the shop's
 * own content was the one thing it could not deliver. This turns the questions
 * into the printed paper.
 *
 * Laid out with jsPDF's text primitives rather than by rasterising HTML. A
 * screenshot of a web page is heavy, blurry on a staffroom photocopier, breaks
 * questions in half wherever the image happens to cross a page boundary, and
 * needs a browser on the server. Real text is a fiftieth of the size, prints
 * sharp, can be searched and copied, and paginates where we say it does.
 *
 * Everything about the *shape* of the paper — sections, numbering, how much room
 * an answer needs, the rubric — is decided in services/paperLayout and shared
 * with the on-screen preview, so what a teacher approves is what prints.
 *
 * The rules this file is responsible for:
 *
 *   · black text on white, at printable sizes. Nothing grey, ever: a photocopy
 *     of grey text is an unreadable page.
 *   · the same header on every page — subject, level, paper, Page X of Y — so a
 *     dropped sheet can be put back.
 *   · a question is never split across a page break when it would fit whole.
 *   · no blank or near-blank pages, and no page added just to carry a footer.
 *   · the standard-14 fonts only, so nothing is embedded and a full paper is
 *     tens of kilobytes rather than the several megabytes an image PDF costs.
 */

import { jsPDF } from 'jspdf';
import {
    layoutFor,
    markingSchemeOf,
    partMarkingScheme,
    type LaidOutQuestion,
    type PaperLayout,
    type PaperSection,
    type PaperSource,
    type QuestionSource,
    type SectionDeclaration,
} from './paperLayout';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Kept for callers that were written against the old shape.
export type RenderablePaper = PaperSource;
export type RenderableQuestion = QuestionSource;

// ---------------------------------------------------------------------------
// GEOMETRY — A4 in points, margins wide enough to survive a photocopier
// ---------------------------------------------------------------------------

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 52;

/** The band above CONTENT_TOP belongs to the running header. */
const HEADER_BASELINE = 34;
const HEADER_RULE = 42;
const CONTENT_TOP = 60;

const FOOTER_RULE = PAGE_HEIGHT - 44;
const FOOTER_BASELINE = PAGE_HEIGHT - 32;
const CONTENT_BOTTOM = PAGE_HEIGHT - 56;

const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
/** Marks sit in their own right-hand column, as they do on a printed paper. */
const MARKS_COLUMN = 54;
const TEXT_WIDTH = CONTENT_WIDTH - MARKS_COLUMN;

const BODY_SIZE = 10.5;
const LINE_HEIGHT = 13.2;
const ANSWER_LINE_GAP = 19;
const QUESTION_INDENT = 20;
const PART_INDENT = 40;

const SERIF = 'times';
const SANS = 'helvetica';

// ---------------------------------------------------------------------------
// THE SHEET
// ---------------------------------------------------------------------------

/**
 * Tracks the cursor and turns the page when it runs out of room, so the drawing
 * code can just write and never think about pagination.
 */
class Sheet {
    doc: jsPDF;
    y: number;
    /** Whether anything has been drawn on the current page. */
    private dirty = false;

    constructor() {
        this.doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
        this.doc.setTextColor(0, 0, 0);
        this.doc.setDrawColor(0, 0, 0);
        this.y = CONTENT_TOP;
    }

    /** How much vertical room is left on this page. */
    get room(): number {
        return CONTENT_BOTTOM - this.y;
    }

    /** How much of the current page has been used, 0–1. */
    get fill(): number {
        return (this.y - CONTENT_TOP) / Sheet.pageRoom;
    }

    /** The most any single block can occupy without being split. */
    static get pageRoom(): number {
        return CONTENT_BOTTOM - CONTENT_TOP;
    }

    newPage(): void {
        this.doc.addPage();
        this.y = CONTENT_TOP;
        this.dirty = false;
    }

    /** Makes room for `needed` points, starting a new page if there is not any. */
    reserve(needed: number): void {
        if (needed <= this.room) return;
        this.newPage();
    }

    /**
     * Keeps a block whole. Blocks taller than a page have to flow — but they
     * should start on a page that can hold a useful amount of them rather than
     * on the last two lines of one.
     */
    keepTogether(height: number): void {
        if (height <= Sheet.pageRoom) {
            this.reserve(height);
            return;
        }
        if (this.room < Sheet.pageRoom * 0.25) this.newPage();
    }

    font(family: string, style: string, size: number): void {
        this.doc.setFont(family, style);
        this.doc.setFontSize(size);
    }

    /** Draws one line of text at the cursor. Does not advance it. */
    text(value: string, x: number, options?: any): void {
        this.doc.text(value, x, this.y, options);
        this.dirty = true;
    }

    /** Wraps to a column and advances the cursor, paginating as needed. */
    paragraph(value: string, x: number, width: number, lineHeight = LINE_HEIGHT): void {
        for (const line of this.wrap(value, width)) {
            this.reserve(lineHeight);
            this.doc.text(line, x, this.y);
            this.y += lineHeight;
            this.dirty = true;
        }
    }

    wrap(value: string, width: number): string[] {
        if (!value) return [];
        return this.doc.splitTextToSize(value, width) as string[];
    }

    /** Height a wrapped paragraph will occupy, for reserving room up front. */
    measure(value: string, width: number, lineHeight = LINE_HEIGHT): number {
        return this.wrap(value, width).length * lineHeight;
    }

    line(x1: number, y: number, x2: number, weight = 0.5): void {
        this.doc.setLineWidth(weight);
        this.doc.line(x1, y, x2, y);
        this.dirty = true;
    }

    rule(weight = 0.6, gapAfter = 10): void {
        this.reserve(gapAfter + 2);
        this.line(MARGIN_X, this.y, PAGE_WIDTH - MARGIN_X, weight);
        this.y += gapAfter;
    }

    /** The heavy double rule under a masthead. */
    doubleRule(gapAfter = 12): void {
        this.reserve(gapAfter + 5);
        this.line(MARGIN_X, this.y, PAGE_WIDTH - MARGIN_X, 1.4);
        this.line(MARGIN_X, this.y + 3, PAGE_WIDTH - MARGIN_X, 0.5);
        this.y += gapAfter;
    }

    box(height: number, weight = 0.8): void {
        this.doc.setLineWidth(weight);
        this.doc.rect(MARGIN_X, this.y, CONTENT_WIDTH, height);
        this.dirty = true;
    }

    /**
     * A page that carries nothing is worse than no page: it is a sheet of paper
     * per pupil in a class of forty. `reserve` turns the page optimistically, so
     * a block that happened to be the last one can leave one behind.
     */
    dropTrailingBlank(): void {
        const pages = this.doc.getNumberOfPages();
        if (this.dirty || pages <= 1) return;
        if (typeof (this.doc as any).deletePage === 'function') {
            (this.doc as any).deletePage(pages);
        }
    }

    /**
     * The running header and footer, added at the end because "of Y" is not
     * known until the last page exists.
     */
    finish(layout: PaperLayout, kind: string, closing: string): void {
        const { doc } = this;
        const total = doc.getNumberOfPages();
        const right = PAGE_WIDTH - MARGIN_X;

        for (let page = 1; page <= total; page++) {
            doc.setPage(page);
            doc.setTextColor(0, 0, 0);
            doc.setDrawColor(0, 0, 0);

            // Subject and level on the left, the paper on the right — the three
            // things you need to reunite a loose sheet with its paper.
            doc.setFont(SANS, 'bold');
            doc.setFontSize(8);
            const left = layout.identity.runningLabel || layout.identity.subject;
            doc.text(left, MARGIN_X, HEADER_BASELINE);

            const pageLabel = `Page ${page} of ${total}`;
            doc.setFont(SANS, 'normal');
            doc.text(pageLabel, right, HEADER_BASELINE, { align: 'right' });

            const leftEnd = MARGIN_X + doc.getTextWidth(left);
            doc.setFont(SANS, 'bold');
            const rightStart = right - doc.getTextWidth(pageLabel);
            doc.setFont(SANS, 'normal');

            const title = kind ? `${layout.identity.title} — ${kind}` : layout.identity.title;
            const centre = fit(doc, title, rightStart - leftEnd - 28);
            if (centre) {
                doc.text(centre, PAGE_WIDTH / 2, HEADER_BASELINE, { align: 'center' });
            }

            doc.setLineWidth(0.5);
            doc.line(MARGIN_X, HEADER_RULE, right, HEADER_RULE);

            // Footer: whose paper it is, and whether there is more of it.
            doc.setLineWidth(0.5);
            doc.line(MARGIN_X, FOOTER_RULE, right, FOOTER_RULE);
            doc.setFont(SANS, 'normal');
            doc.setFontSize(7.5);
            doc.text(
                layout.identity.institution || 'Skulbase Exams',
                MARGIN_X,
                FOOTER_BASELINE
            );
            // "Turn over" until the last page, then the closing line. Both belong
            // in the footer rather than the body: a paper whose last page has
            // room for four ruled lines and not for the sentence saying it has
            // ended looks unfinished, and printing it in the body was exactly
            // that gamble.
            doc.setFont(SANS, 'bold');
            doc.text(
                page < total ? 'Turn over' : closing,
                right,
                FOOTER_BASELINE,
                { align: 'right' }
            );
        }
    }

    buffer(): Buffer {
        return Buffer.from(this.doc.output('arraybuffer'));
    }
}

/** Trims a string to a width, with an ellipsis, or drops it if hopeless. */
function fit(doc: jsPDF, value: string, width: number): string {
    if (width < 40) return '';
    if (doc.getTextWidth(value) <= width) return value;

    let trimmed = value;
    while (trimmed.length > 4 && doc.getTextWidth(`${trimmed}…`) > width) {
        trimmed = trimmed.slice(0, -1);
    }
    return trimmed.length > 4 ? `${trimmed.trim()}…` : '';
}

// ---------------------------------------------------------------------------
// THE FRONT MATTER
// ---------------------------------------------------------------------------

function drawMasthead(sheet: Sheet, layout: PaperLayout, subtitle?: string): void {
    const centre = PAGE_WIDTH / 2;
    const { identity } = layout;

    if (identity.institution) {
        sheet.font(SERIF, 'bold', 13);
        sheet.text(identity.institution.toUpperCase(), centre, { align: 'center' });
        sheet.y += 16;
    }

    sheet.font(SERIF, 'bold', 15);
    sheet.text(identity.title.toUpperCase(), centre, { align: 'center' });
    sheet.y += 17;

    if (subtitle) {
        sheet.font(SANS, 'bold', 11);
        sheet.text(subtitle.toUpperCase(), centre, { align: 'center' });
        sheet.y += 15;
    }

    if (identity.context) {
        sheet.font(SERIF, 'normal', 10.5);
        sheet.text(identity.context, centre, { align: 'center' });
        sheet.y += 13;
    }

    sheet.doubleRule(11);
}

/**
 * Somewhere to write a name. A paper without one comes back anonymous, and forty
 * anonymous scripts is a lost afternoon.
 */
function drawCandidateBox(sheet: Sheet): void {
    const height = 46;
    sheet.reserve(height + 8);
    sheet.box(height);

    const { doc } = sheet;
    const columnWidth = CONTENT_WIDTH / 2;
    const rows = [
        ['NAME:', 'ADM NO:'],
        ['CLASS:', 'DATE:'],
    ];

    sheet.font(SERIF, 'bold', 9.5);
    rows.forEach((row, r) => {
        const baseline = sheet.y + 17 + r * 20;
        row.forEach((label, c) => {
            const x = MARGIN_X + 10 + c * columnWidth;
            doc.setFont(SERIF, 'bold');
            doc.text(label, x, baseline);
            const labelWidth = doc.getTextWidth(label);
            sheet.line(x + labelWidth + 6, baseline + 2, MARGIN_X + (c + 1) * columnWidth - 10, 0.4);
        });
    });

    sheet.y += height + 10;
}

/** Time and total marks — the two things a candidate checks first. */
function drawTimeAndMarks(sheet: Sheet, layout: PaperLayout): void {
    const left = layout.identity.duration ? `TIME: ${layout.identity.duration.toUpperCase()}` : '';
    const right = layout.totalMarks > 0 ? `TOTAL MARKS: ${layout.totalMarks}` : '';
    if (!left && !right) return;

    sheet.reserve(18);
    sheet.font(SANS, 'bold', 9.5);
    if (left) sheet.text(left, MARGIN_X);
    if (right) sheet.text(right, PAGE_WIDTH - MARGIN_X, { align: 'right' });
    sheet.y += 15;
}

function drawInstructions(sheet: Sheet, layout: PaperLayout, pageCount: number): void {
    if (layout.instructions.length === 0) return;

    sheet.reserve(40);
    sheet.font(SANS, 'bold', 10);
    sheet.text('INSTRUCTIONS TO CANDIDATES', MARGIN_X);
    sheet.y += 14;

    sheet.font(SERIF, 'normal', BODY_SIZE);
    layout.instructions.forEach((instruction, i) => {
        const label = `${i + 1}.`;
        sheet.reserve(LINE_HEIGHT);
        const top = sheet.y;
        sheet.doc.text(label, MARGIN_X + 4, top);
        sheet.paragraph(instruction, MARGIN_X + 22, CONTENT_WIDTH - 22, LINE_HEIGHT);
    });

    // The printing-integrity notice every KNEC paper carries. It is the reason
    // the document is rendered twice: the sentence needs its own page count.
    sheet.y += 2;
    sheet.font(SERIF, 'bold', 9.5);
    sheet.paragraph(
        `This paper consists of ${pageCount} printed page${pageCount === 1 ? '' : 's'}. ` +
            'Candidates should check the question paper to ascertain that all the pages are printed as ' +
            'indicated and that no questions are missing.',
        MARGIN_X,
        CONTENT_WIDTH,
        11.5
    );
    sheet.y += 8;
}

/**
 * "For Examiner's Use Only" — question numbers across, a row for the maximum and
 * a row for what the candidate scored. Drawn as a real table because a teacher
 * adds up in it.
 */
function drawExaminerTable(sheet: Sheet, layout: PaperLayout): void {
    const rows = layout.examinerRows;
    if (rows.length === 0) return;

    // The total is the sum of the columns beside it, so the row a teacher adds up
    // agrees with the row above it.
    const columns = [
        ...rows.map((r) => ({ label: r.label, marks: r.marks })),
        { label: 'TOTAL', marks: rows.reduce((sum, r) => sum + r.marks, 0) },
    ];

    const titleHeight = 15;
    const rowHeight = 15;
    const height = titleHeight + rowHeight * 3;

    sheet.keepTogether(height + 12);
    const top = sheet.y;
    const { doc } = sheet;

    doc.setLineWidth(0.8);
    doc.rect(MARGIN_X, top, CONTENT_WIDTH, height);

    sheet.font(SANS, 'bold', 8.5);
    doc.text("FOR EXAMINER'S USE ONLY", PAGE_WIDTH / 2, top + 10.5, { align: 'center' });
    sheet.line(MARGIN_X, top + titleHeight, PAGE_WIDTH - MARGIN_X, 0.8);

    // A label column, then one column per band.
    const labelWidth = 96;
    const gridLeft = MARGIN_X + labelWidth;
    const columnWidth = (CONTENT_WIDTH - labelWidth) / columns.length;

    const rowTops = [0, 1, 2].map((i) => top + titleHeight + i * rowHeight);
    rowTops.slice(1).forEach((y) => sheet.line(MARGIN_X, y, PAGE_WIDTH - MARGIN_X, 0.4));

    doc.setLineWidth(0.4);
    doc.line(gridLeft, top + titleHeight, gridLeft, top + height);
    for (let i = 1; i <= columns.length; i++) {
        const x = gridLeft + i * columnWidth;
        doc.line(x, top + titleHeight, x, top + height);
    }

    const labels = layout.sections.length > 1 ? 'SECTION' : 'QUESTION';
    sheet.font(SANS, 'bold', 8);
    doc.text(labels, MARGIN_X + 6, rowTops[0] + 10.5);
    doc.text('MAXIMUM SCORE', MARGIN_X + 6, rowTops[1] + 10.5);
    doc.text("CANDIDATE'S SCORE", MARGIN_X + 6, rowTops[2] + 10.5);

    columns.forEach((column, i) => {
        const centre = gridLeft + i * columnWidth + columnWidth / 2;
        sheet.font(SANS, 'bold', 8);
        doc.text(fit(doc, column.label, columnWidth - 4), centre, rowTops[0] + 10.5, { align: 'center' });
        sheet.font(SERIF, 'normal', 9);
        doc.text(column.marks > 0 ? String(column.marks) : '', centre, rowTops[1] + 10.5, {
            align: 'center',
        });
        // The third row is left empty on purpose — it is what the marker writes in.
    });

    sheet.y = top + height + 12;
}

/**
 * The CBC rubric, with the marks each band actually means for this paper.
 *
 * An empty four-box grid is decoration. A teacher cannot mark against a picture
 * of a rubric, so the bands come out filled and the only blank left is the one
 * they tick.
 */
function drawRubric(sheet: Sheet, layout: PaperLayout): void {
    const bands = layout.rubric;
    if (!bands || bands.length === 0) return;

    const titleHeight = 15;
    const headHeight = 29;
    const rangeHeight = 15;
    const tickHeight = 18;
    const height = titleHeight + headHeight + rangeHeight + tickHeight;

    sheet.keepTogether(height + 12);
    const top = sheet.y;
    const { doc } = sheet;

    doc.setLineWidth(0.8);
    doc.rect(MARGIN_X, top, CONTENT_WIDTH, height);

    sheet.font(SANS, 'bold', 8.5);
    doc.text(
        "ASSESSMENT RUBRIC  ·  TICK THE BAND THE CANDIDATE'S SCORE FALLS IN",
        PAGE_WIDTH / 2,
        top + 10.5,
        { align: 'center' }
    );
    sheet.line(MARGIN_X, top + titleHeight, PAGE_WIDTH - MARGIN_X, 0.8);

    const columnWidth = CONTENT_WIDTH / bands.length;
    const headTop = top + titleHeight;
    const rangeTop = headTop + headHeight;
    const tickTop = rangeTop + rangeHeight;

    doc.setLineWidth(0.4);
    doc.line(MARGIN_X, rangeTop, PAGE_WIDTH - MARGIN_X, rangeTop);
    doc.line(MARGIN_X, tickTop, PAGE_WIDTH - MARGIN_X, tickTop);
    for (let i = 1; i < bands.length; i++) {
        const x = MARGIN_X + i * columnWidth;
        doc.line(x, headTop, x, top + height);
    }

    bands.forEach((band, i) => {
        const centre = MARGIN_X + i * columnWidth + columnWidth / 2;

        // Code and percentage on one line, the band's name under it. Set on a
        // single line each: a heading that wraps into the row below it is how
        // the old rubric came out overlapping itself.
        sheet.font(SANS, 'bold', 8.5);
        doc.text(`${band.code}  ·  ${band.percent}`, centre, headTop + 11, { align: 'center' });
        sheet.font(SANS, 'normal', 7.5);
        doc.text(fit(doc, band.name.toUpperCase(), columnWidth - 8), centre, headTop + 22, {
            align: 'center',
        });

        sheet.font(SERIF, 'bold', 9);
        doc.text(`${band.range} marks`, centre, rangeTop + 10.5, { align: 'center' });
    });

    sheet.y = top + height + 12;
}

// ---------------------------------------------------------------------------
// THE QUESTIONS
// ---------------------------------------------------------------------------

/** How tall a section heading is, so it can be kept with its first question. */
function measureSectionHeading(sheet: Sheet, section: PaperSection): number {
    const instruction = section.instruction
        ? sheet.measure(section.instruction, CONTENT_WIDTH, 12.5)
        : 0;
    return 4 + 13 + instruction + 12;
}

function drawSectionHeading(
    sheet: Sheet,
    label: string,
    title: string | null,
    marks: number,
    instruction: string | null
): void {
    sheet.y += 4;

    sheet.font(SANS, 'bold', 11);
    const heading = title ? `${label}: ${title.toUpperCase()}` : label;
    sheet.text(heading, MARGIN_X);
    if (marks > 0) {
        sheet.font(SANS, 'bold', 10);
        sheet.text(`(${marks} marks)`, PAGE_WIDTH - MARGIN_X, { align: 'right' });
    }
    sheet.y += 13;

    if (instruction) {
        sheet.font(SERIF, 'normal', 10);
        sheet.paragraph(instruction, MARGIN_X, CONTENT_WIDTH, 12.5);
    }

    sheet.rule(0.8, 10);
}

/**
 * Answer lines under a tightening pass. Never below one line, so a question
 * always has somewhere to write.
 */
function scaledLines(count: number, scale: number): number {
    if (count <= 0) return 0;
    return Math.max(1, Math.round(count * scale));
}

/** How tall a question will be, so it can be kept off a page break. */
function measureQuestion(sheet: Sheet, question: LaidOutQuestion, scale: number): number {
    let height = measureStem(sheet, question, scale);

    for (const part of question.parts) {
        height +=
            sheet.measure(part.text, TEXT_WIDTH - PART_INDENT) +
            scaledLines(part.answerLines, scale) * ANSWER_LINE_GAP +
            6;
    }

    height += scaledLines(question.answerLines, scale) * ANSWER_LINE_GAP;
    return height + 12;
}

/**
 * The part of a question that must not be left behind on its own: the number,
 * what is being asked, and any choices. Ruled answer space may flow.
 */
function measureStem(sheet: Sheet, question: LaidOutQuestion, scale: number, figures?: FigureMap): number {
    let height = sheet.measure(question.text, TEXT_WIDTH - QUESTION_INDENT) + 4;

    // The diagram is part of the stem: a question number and its graph must not
    // be separated by a page break.
    height += measureFigure(question, figures);

    if (question.options.length > 0) {
        const rows = question.optionsFitTwoColumns
            ? Math.ceil(question.options.length / 2)
            : question.options.length;
        height += rows * 13 + 4;
    }

    if (question.parts.length > 0) {
        const first = question.parts[0];
        height += sheet.measure(first.text, TEXT_WIDTH - PART_INDENT) + 6;
        height += Math.min(2, scaledLines(first.answerLines, scale)) * ANSWER_LINE_GAP;
    } else {
        height += Math.min(2, scaledLines(question.answerLines, scale)) * ANSWER_LINE_GAP;
    }

    return height;
}

/** Half the text column: wide enough to read a graph, narrow enough to leave writing room. */
const FIGURE_MAX_WIDTH = (TEXT_WIDTH - QUESTION_INDENT) * 0.62;

/** Beyond this a diagram pushes the answer space onto another page. */
const FIGURE_MAX_HEIGHT = 210;

const CAPTION_SIZE = 8.5;
const CAPTION_GAP = 5;

/**
 * How much room the figure will take, at the size it will actually be drawn.
 *
 * Measured from the same numbers `drawFigure` uses, because a figure the
 * pagination did not account for is a figure printed over the next question.
 */
function measureFigure(question: LaidOutQuestion, figures?: FigureMap): number {
    if (!question.figure) return 0;
    const art = figures?.get(question.figure.key);
    if (!art) return 0;
    return figureBox(art).height + (question.figure.caption ? CAPTION_GAP + CAPTION_SIZE : 0) + 10;
}

/** Fitted inside the box, keeping the aspect ratio — a squashed graph is a wrong graph. */
function figureBox(art: FigureBytes): { width: number; height: number } {
    const ratio = art.height / Math.max(1, art.width);
    let width = Math.min(FIGURE_MAX_WIDTH, art.width);
    let height = width * ratio;
    if (height > FIGURE_MAX_HEIGHT) {
        height = FIGURE_MAX_HEIGHT;
        width = height / Math.max(0.01, ratio);
    }
    return { width, height };
}

/**
 * The diagram a question is about.
 *
 * Silence when the bytes are absent is deliberate. A figure can be missing for
 * dull reasons — storage down, a key that no longer resolves — and a paper that
 * prints a broken-image box, or the words "figure missing", is worse than one
 * that prints the question plainly. `image_required` is how a question says it
 * cannot survive that, and the builder is expected to have filtered those out
 * before anything reached this function.
 */
function drawFigure(sheet: Sheet, question: LaidOutQuestion, figures?: FigureMap): void {
    if (!question.figure) return;
    const art = figures?.get(question.figure.key);
    if (!art) return;

    const { width, height } = figureBox(art);

    // Keep the whole diagram on one page. Splitting a graph across a fold makes
    // it unreadable in a way splitting a paragraph does not.
    sheet.keepTogether(height + (question.figure.caption ? CAPTION_GAP + CAPTION_SIZE : 0));

    sheet.y += 4;
    try {
        sheet.doc.addImage(art.dataUrl, 'JPEG', MARGIN_X + QUESTION_INDENT, sheet.y, width, height);
    } catch {
        // A corrupt or unsupported image must not take the whole paper down.
        return;
    }
    sheet.y += height;

    if (question.figure.caption) {
        /*
         * `text` draws at the baseline, not the top, so advancing by the gap
         * alone puts the ascenders back inside the image. The line height has
         * to be crossed before the caption is placed or it sits on the bottom
         * edge of the diagram.
         */
        sheet.y += CAPTION_GAP + CAPTION_SIZE;
        sheet.font(SERIF, 'italic', CAPTION_SIZE);
        sheet.doc.text(question.figure.caption, MARGIN_X + QUESTION_INDENT, sheet.y);
        sheet.font(SERIF, 'normal', BODY_SIZE);
    }

    sheet.y += 6;
}

function drawQuestion(sheet: Sheet, question: LaidOutQuestion, scale: number, figures?: FigureMap): void {
    const { doc } = sheet;

    sheet.font(SERIF, 'normal', BODY_SIZE);

    // What must not be split is the stem — the number, what is being asked, and
    // the first line or two to answer it on. Ruled writing lines read the same
    // either side of a page break; a question number stranded at the foot of a
    // page does not. Moving whole questions over instead would leave a third of
    // a page white every time one straddled the join, and that is a sheet of
    // paper per pupil in a class of forty.
    const full = measureQuestion(sheet, question, scale) + measureFigure(question, figures);
    if (full > sheet.room) sheet.keepTogether(measureStem(sheet, question, scale, figures));

    const top = sheet.y;

    sheet.font(SERIF, 'bold', BODY_SIZE + 0.5);
    doc.text(`${question.number}.`, MARGIN_X, top);

    if (question.marks > 0) {
        sheet.font(SERIF, 'normal', BODY_SIZE - 0.5);
        doc.text(
            `(${question.marks} mark${question.marks === 1 ? '' : 's'})`,
            PAGE_WIDTH - MARGIN_X,
            top,
            { align: 'right' }
        );
    }

    sheet.font(SERIF, 'normal', BODY_SIZE);
    sheet.paragraph(question.text, MARGIN_X + QUESTION_INDENT, TEXT_WIDTH - QUESTION_INDENT);

    drawFigure(sheet, question, figures);

    drawOptions(sheet, question);

    question.parts.forEach((part) => {
        sheet.reserve(LINE_HEIGHT * 2);
        const partTop = sheet.y;

        sheet.font(SERIF, 'normal', BODY_SIZE);
        doc.text(part.label, MARGIN_X + QUESTION_INDENT, partTop);

        if (part.marks > 0) {
            sheet.font(SERIF, 'normal', BODY_SIZE - 1);
            doc.text(
                `(${part.marks} mark${part.marks === 1 ? '' : 's'})`,
                PAGE_WIDTH - MARGIN_X,
                partTop,
                { align: 'right' }
            );
            sheet.font(SERIF, 'normal', BODY_SIZE);
        }

        sheet.paragraph(part.text, MARGIN_X + PART_INDENT, TEXT_WIDTH - PART_INDENT);
        drawAnswerLines(sheet, scaledLines(part.answerLines, scale), MARGIN_X + PART_INDENT);
        sheet.y += 2;
    });

    drawAnswerLines(sheet, scaledLines(question.answerLines, scale), MARGIN_X + QUESTION_INDENT);
    sheet.y += 8;
}

/**
 * Lettered choices. Short ones go two to a line — an objective paper set one
 * option per line runs to twice the paper for no gain in readability.
 */
function drawOptions(sheet: Sheet, question: LaidOutQuestion): void {
    if (question.options.length === 0) return;
    const { doc } = sheet;

    sheet.y += 2;
    sheet.font(SERIF, 'normal', BODY_SIZE);

    if (question.optionsFitTwoColumns) {
        const columnWidth = (TEXT_WIDTH - QUESTION_INDENT) / 2;
        for (let i = 0; i < question.options.length; i += 2) {
            sheet.reserve(13);
            for (const offset of [0, 1]) {
                const option = question.options[i + offset];
                if (!option) continue;
                const letter = String.fromCharCode(65 + i + offset);
                const x = MARGIN_X + QUESTION_INDENT + 12 + offset * columnWidth;
                doc.text(`${letter}.  ${fit(doc, option, columnWidth - 26)}`, x, sheet.y);
            }
            sheet.y += 13;
        }
    } else {
        question.options.forEach((option, i) => {
            const letter = String.fromCharCode(65 + i);
            sheet.paragraph(
                `${letter}.  ${option}`,
                MARGIN_X + QUESTION_INDENT + 12,
                TEXT_WIDTH - QUESTION_INDENT - 12,
                13
            );
        });
    }

    sheet.y += 3;
}

function drawAnswerLines(sheet: Sheet, count: number, x: number): void {
    if (count <= 0) return;

    for (let i = 0; i < count; i++) {
        sheet.reserve(ANSWER_LINE_GAP);
        sheet.y += ANSWER_LINE_GAP - 5;
        sheet.line(x, sheet.y, PAGE_WIDTH - MARGIN_X, 0.5);
        sheet.y += 5;
    }
    sheet.y += 3;
}

// ---------------------------------------------------------------------------
// THE DOCUMENTS
// ---------------------------------------------------------------------------

function renderPaper(layout: PaperLayout, pageCountHint: number, scale = 1, figures?: FigureMap): Sheet {
    const sheet = new Sheet();

    drawMasthead(sheet, layout);
    drawCandidateBox(sheet);
    drawTimeAndMarks(sheet, layout);
    drawInstructions(sheet, layout, pageCountHint);
    drawExaminerTable(sheet, layout);
    drawRubric(sheet, layout);

    layout.sections.forEach((section) => {
        if (section.label) {
            // A section heading alone at the foot of a page announces questions
            // that are not there. It travels with the start of its first one.
            const first = section.questions[0];
            sheet.keepTogether(
                measureSectionHeading(sheet, section) +
                    (first ? measureStem(sheet, first, scale, figures) : 0)
            );
            drawSectionHeading(sheet, section.label, section.title, section.marks, section.instruction);
        }
        section.questions.forEach((question) => drawQuestion(sheet, question, scale, figures));
    });

    // The closing line is printed in the footer, not here — see Sheet.finish.
    sheet.dropTrailingBlank();
    return sheet;
}

/**
 * Renders until the page count it prints agrees with the page count it has.
 *
 * The instructions carry "this paper consists of N printed pages", which is not
 * knowable until the paper has been laid out. The sentence is the same height
 * whatever N is, so this settles on the second pass in practice; the loop is
 * only there so a pathological paper cannot print a number it disproves.
 */
function renderStable(layout: PaperLayout, scale: number, figures?: FigureMap): Sheet {
    let sheet = renderPaper(layout, 1, scale, figures);

    for (let attempt = 0; attempt < 3; attempt++) {
        const pages = sheet.doc.getNumberOfPages();
        const next = renderPaper(layout, pages, scale, figures);
        if (next.doc.getNumberOfPages() === pages) return next;
        sheet = next;
    }

    return sheet;
}

/**
 * The question paper.
 *
 * When the paper spills a little way onto a final page, that page is mostly
 * white — and it is still a sheet of paper per pupil, forty times over, for four
 * ruled lines. Rather than ship it, the paper is set again with slightly less
 * writing space and kept only if that buys back the page. Answer space is the
 * one dimension that can give: nothing is dropped, no type is shrunk, and a
 * question never ends up with less than a line.
 */
export function buildPaperDocument(
    paper: PaperSource,
    questions: QuestionSource[],
    declaration?: SectionDeclaration,
    figures?: FigureMap
): jsPDF {
    const layout = layoutFor(paper, questions, declaration);
    let sheet = renderStable(layout, 1, figures);

    if (sheet.doc.getNumberOfPages() > 1 && sheet.fill < 0.45) {
        for (const scale of [0.85, 0.7]) {
            const tighter = renderStable(layout, scale, figures);
            if (tighter.doc.getNumberOfPages() < sheet.doc.getNumberOfPages()) {
                sheet = tighter;
                break;
            }
        }
    }

    sheet.finish(layout, '', 'THIS IS THE LAST PRINTED PAGE');
    return sheet.doc;
}

/**
 * The marking scheme.
 *
 * Kept as a separate document rather than an appendix: it is sold and delivered
 * separately, and a teacher handing out the paper must not hand out the answers
 * with it.
 */
export function buildMarkingSchemeDocument(
    paper: PaperSource,
    questions: QuestionSource[],
    declaration?: SectionDeclaration
): jsPDF {
    const layout = layoutFor(paper, questions, declaration);
    const sheet = new Sheet();
    const { doc } = sheet;

    drawMasthead(sheet, layout, 'Marking Scheme');

    sheet.font(SANS, 'bold', 9);
    sheet.reserve(18);
    sheet.text('CONFIDENTIAL — FOR THE TEACHER ONLY', MARGIN_X);
    if (layout.totalMarks > 0) {
        sheet.text(`TOTAL MARKS: ${layout.totalMarks}`, PAGE_WIDTH - MARGIN_X, { align: 'right' });
    }
    sheet.y += 14;
    sheet.rule(0.8, 10);

    const schemes = new Map<number, string>();
    questions.forEach((q, i) => schemes.set(i + 1, markingSchemeOf(q)));
    const partSchemes = new Map<number, string[]>();
    questions.forEach((q, i) => {
        const parts = (q.sub_parts ?? q.subParts) as any;
        partSchemes.set(i + 1, (Array.isArray(parts) ? parts : []).map(partMarkingScheme));
    });

    layout.questions.forEach((question) => {
        const scheme = schemes.get(question.number) ?? '';
        const parts = partSchemes.get(question.number) ?? [];

        sheet.keepTogether(
            sheet.measure(question.text, TEXT_WIDTH - QUESTION_INDENT, 12) +
                sheet.measure(scheme, TEXT_WIDTH - QUESTION_INDENT) +
                34
        );

        const top = sheet.y;
        sheet.font(SERIF, 'bold', BODY_SIZE + 0.5);
        doc.text(`${question.number}.`, MARGIN_X, top);

        if (question.marks > 0) {
            sheet.font(SERIF, 'normal', BODY_SIZE - 0.5);
            doc.text(
                `(${question.marks} mark${question.marks === 1 ? '' : 's'})`,
                PAGE_WIDTH - MARGIN_X,
                top,
                { align: 'right' }
            );
        }

        // The question itself, so the marker knows what is being answered. Set
        // smaller than the answer rather than lighter: a photocopied grey line
        // is a line nobody reads.
        sheet.font(SERIF, 'normal', BODY_SIZE - 1);
        sheet.paragraph(question.text, MARGIN_X + QUESTION_INDENT, TEXT_WIDTH - QUESTION_INDENT, 12);
        sheet.y += 3;

        sheet.font(SERIF, 'bold', BODY_SIZE);
        if (scheme) {
            sheet.paragraph(scheme, MARGIN_X + QUESTION_INDENT, TEXT_WIDTH - QUESTION_INDENT);
        } else if (question.parts.length > 0) {
            question.parts.forEach((part, i) => {
                const answer = parts[i] || '—';
                sheet.paragraph(
                    `${part.label}  ${answer}${part.marks > 0 ? `  (${part.marks} mark${part.marks === 1 ? '' : 's'})` : ''}`,
                    MARGIN_X + QUESTION_INDENT,
                    TEXT_WIDTH - QUESTION_INDENT
                );
            });
        } else {
            // Honest about a gap rather than leaving a blank that reads as an
            // answer of "nothing".
            sheet.font(SERIF, 'normal', BODY_SIZE);
            sheet.paragraph(
                '[ No marking scheme recorded for this question. ]',
                MARGIN_X + QUESTION_INDENT,
                TEXT_WIDTH - QUESTION_INDENT
            );
        }

        sheet.y += 6;
        sheet.line(MARGIN_X + QUESTION_INDENT, sheet.y, PAGE_WIDTH - MARGIN_X, 0.3);
        sheet.y += 8;
    });

    sheet.dropTrailingBlank();
    sheet.finish(layout, 'Marking Scheme', 'END OF MARKING SCHEME');
    return sheet.doc;
}

// ---------------------------------------------------------------------------
// SERVER AND BROWSER ENTRY POINTS
// ---------------------------------------------------------------------------

/** Bytes, for storing and streaming. Server only — `Buffer` is a Node type. */
/**
 * The figures a render may draw, keyed by storage key.
 *
 * Passed in rather than fetched here, because rendering is synchronous and must
 * stay that way — every caller returns its Buffer straight into a response, and
 * a render that reaches the network is a render that can hang a request. The
 * route fetches first and hands the bytes over; this function stays pure and
 * testable with no storage behind it.
 */
export interface FigureBytes {
    /** A `data:image/…;base64,…` URL, which is what jsPDF's addImage wants. */
    dataUrl: string;
    width: number;
    height: number;
}

export type FigureMap = Map<string, FigureBytes>;

export function renderPaperPdf(
    paper: PaperSource,
    questions: QuestionSource[],
    declaration?: SectionDeclaration,
    figures?: FigureMap
): Buffer {
    return Buffer.from(buildPaperDocument(paper, questions, declaration, figures).output('arraybuffer'));
}

/** Bytes, for storing and streaming. Server only — `Buffer` is a Node type. */
export function renderMarkingSchemePdf(
    paper: PaperSource,
    questions: QuestionSource[],
    declaration?: SectionDeclaration
): Buffer {
    return Buffer.from(buildMarkingSchemeDocument(paper, questions, declaration).output('arraybuffer'));
}

/** Saves the paper straight from the browser, with no round trip to the server. */
export function downloadPaperPdf(
    paper: PaperSource,
    questions: QuestionSource[],
    filename: string,
    declaration?: SectionDeclaration
): void {
    buildPaperDocument(paper, questions, declaration).save(filename);
}

/** Saves the marking scheme straight from the browser. */
export function downloadMarkingSchemePdf(
    paper: PaperSource,
    questions: QuestionSource[],
    filename: string,
    declaration?: SectionDeclaration
): void {
    buildMarkingSchemeDocument(paper, questions, declaration).save(filename);
}
