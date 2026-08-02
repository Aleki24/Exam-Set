/**
 * RENDERING A PAPER TO PDF
 * ----------------------------------------------------------------------------
 * A paper built in the setter is a list of question ids, not a file. Until it
 * becomes one it cannot be downloaded, sold or sent over WhatsApp — so the
 * shop's own content was the one thing it could not deliver. This turns the
 * questions into the printed paper.
 *
 * Laid out with jsPDF's text primitives rather than by rasterising HTML. A
 * screenshot of a web page is heavy, blurry when printed, and needs a browser on
 * the server; real text is a tenth of the size, prints sharp on the worst
 * staffroom printer, and can be searched and copied. It also runs anywhere,
 * which matters when the same function has to work in a serverless request.
 *
 * The look follows the conventions of a Kenyan exam paper, because a teacher
 * photocopies this and hands it to a class: school name and paper title
 * centred at the top, a details line, numbered instructions, then questions with
 * their marks in the right margin and ruled space to write in.
 */

import { jsPDF } from 'jspdf';
import { examTypeName } from '@/lib/catalog';

/* eslint-disable @typescript-eslint/no-explicit-any */

// A4 in points, with margins wide enough to survive a photocopier.
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 56;
const MARGIN_TOP = 56;
const MARGIN_BOTTOM = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
// Marks sit in their own right-hand column, as they do on a printed paper.
const MARKS_COLUMN = 46;
const TEXT_WIDTH = CONTENT_WIDTH - MARKS_COLUMN;

const LINE_HEIGHT = 15;
const ANSWER_LINE_GAP = 22;

export interface RenderablePaper {
    title: string;
    subject?: string | null;
    grade_label?: string | null;
    exam_type?: string | null;
    term_slug?: string | null;
    year?: number | null;
    time_limit?: string | null;
    institution?: string | null;
    total_marks?: number | null;
    instructions?: string | null;
}

export interface RenderableQuestion {
    text: string;
    marks?: number | null;
    type?: string | null;
    options?: any;
    sub_parts?: any;
    answer_lines?: number | null;
    marking_scheme?: string | null;
    topic?: string | null;
}

/**
 * Tracks the cursor and turns the page when it runs out of room, so callers can
 * just write and never think about pagination.
 */
class Sheet {
    doc: jsPDF;
    y: number;
    page = 1;

    constructor() {
        this.doc = new jsPDF({ unit: 'pt', format: 'a4' });
        this.y = MARGIN_TOP;
    }

    /** Makes room for `needed` points, starting a new page if there is not any. */
    reserve(needed: number): void {
        if (this.y + needed <= PAGE_HEIGHT - MARGIN_BOTTOM) return;
        this.doc.addPage();
        this.page += 1;
        this.y = MARGIN_TOP;
    }

    text(value: string, x: number, options?: any): void {
        this.doc.text(value, x, this.y, options);
    }

    /** Wraps to the text column and advances the cursor, paginating as needed. */
    paragraph(value: string, x: number, width: number, lineHeight = LINE_HEIGHT): void {
        const lines = this.doc.splitTextToSize(value, width) as string[];
        for (const line of lines) {
            this.reserve(lineHeight);
            this.doc.text(line, x, this.y);
            this.y += lineHeight;
        }
    }

    rule(): void {
        this.reserve(12);
        this.doc.setLineWidth(0.6);
        this.doc.line(MARGIN_X, this.y, PAGE_WIDTH - MARGIN_X, this.y);
        this.y += 12;
    }

    /** Page numbers, added at the end when the total is known. */
    paginate(label: string): void {
        const total = this.doc.getNumberOfPages();
        for (let i = 1; i <= total; i++) {
            this.doc.setPage(i);
            this.doc.setFont('times', 'italic');
            this.doc.setFontSize(9);
            this.doc.setTextColor(110);
            this.doc.text(`${label}`, MARGIN_X, PAGE_HEIGHT - 30);
            this.doc.text(`Page ${i} of ${total}`, PAGE_WIDTH - MARGIN_X, PAGE_HEIGHT - 30, { align: 'right' });
            this.doc.setTextColor(0);
        }
    }

    buffer(): Buffer {
        return Buffer.from(this.doc.output('arraybuffer'));
    }
}

/** Sub-parts carry their own marks when they have them; otherwise the parent's. */
function marksOf(q: RenderableQuestion): number {
    if (Array.isArray(q.sub_parts) && q.sub_parts.length > 0) {
        const partTotal = q.sub_parts.reduce((sum: number, p: any) => sum + (Number(p?.marks) || 0), 0);
        if (partTotal > 0) return partTotal;
    }
    return Number(q.marks) || 0;
}

function headerLine(paper: RenderablePaper): string {
    return [
        paper.grade_label,
        paper.subject,
        paper.exam_type ? examTypeName(paper.exam_type) : null,
        paper.term_slug ? paper.term_slug.replace('term-', 'Term ') : null,
        paper.year ? String(paper.year) : null,
    ]
        .filter(Boolean)
        .join('  ·  ');
}

/** The masthead, shared by the paper and its marking scheme. */
function drawHeader(
    sheet: Sheet,
    paper: RenderablePaper,
    totalMarks: number,
    subtitle?: string,
    /** Only the question paper is written on, so only it gets a name line. */
    forCandidate = true
): void {
    const { doc } = sheet;
    const centre = PAGE_WIDTH / 2;

    if (paper.institution) {
        doc.setFont('times', 'bold');
        doc.setFontSize(13);
        sheet.text(paper.institution.toUpperCase(), centre, { align: 'center' });
        sheet.y += 18;
    }

    doc.setFont('times', 'bold');
    doc.setFontSize(15);
    sheet.text(paper.title.toUpperCase(), centre, { align: 'center' });
    sheet.y += 19;

    if (subtitle) {
        doc.setFont('times', 'bold');
        doc.setFontSize(12);
        sheet.text(subtitle.toUpperCase(), centre, { align: 'center' });
        sheet.y += 17;
    }

    const context = headerLine(paper);
    if (context) {
        doc.setFont('times', 'normal');
        doc.setFontSize(10.5);
        sheet.text(context, centre, { align: 'center' });
        sheet.y += 16;
    }

    sheet.rule();

    // Time and marks, the two things a candidate checks first.
    doc.setFont('times', 'normal');
    doc.setFontSize(10.5);
    const left = paper.time_limit ? `Time: ${paper.time_limit}` : '';
    const right = totalMarks > 0 ? `Total: ${totalMarks} marks` : '';
    if (left) sheet.text(left, MARGIN_X);
    if (right) sheet.text(right, PAGE_WIDTH - MARGIN_X, { align: 'right' });
    if (left || right) sheet.y += 18;

    // Somewhere to write a name — a paper without one comes back anonymous.
    // The marking scheme is the teacher's copy and is never filled in, so it
    // does not get one.
    if (forCandidate) {
        doc.setFontSize(10.5);
        sheet.text('Name: ............................................................', MARGIN_X);
        sheet.text('Adm: ......................', PAGE_WIDTH - MARGIN_X, { align: 'right' });
        sheet.y += 20;
    }

    sheet.rule();
}

function drawInstructions(sheet: Sheet, instructions?: string | null): void {
    if (!instructions?.trim()) return;
    const { doc } = sheet;

    doc.setFont('times', 'bold');
    doc.setFontSize(11);
    sheet.reserve(LINE_HEIGHT);
    sheet.text('INSTRUCTIONS TO CANDIDATES', MARGIN_X);
    sheet.y += 16;

    doc.setFont('times', 'normal');
    doc.setFontSize(10.5);
    for (const line of instructions.split('\n').map((l) => l.trim()).filter(Boolean)) {
        sheet.paragraph(line, MARGIN_X, CONTENT_WIDTH, 14);
    }
    sheet.y += 6;
    sheet.rule();
}

/**
 * The question paper.
 */
export function renderPaperPdf(paper: RenderablePaper, questions: RenderableQuestion[]): Buffer {
    const sheet = new Sheet();
    const { doc } = sheet;

    const totalMarks = paper.total_marks || questions.reduce((sum, q) => sum + marksOf(q), 0);

    drawHeader(sheet, paper, totalMarks);
    drawInstructions(sheet, paper.instructions);

    questions.forEach((question, index) => {
        const marks = marksOf(question);
        const number = `${index + 1}.`;

        // Keep the number attached to at least the first line of its question.
        sheet.reserve(LINE_HEIGHT * 2);

        doc.setFont('times', 'bold');
        doc.setFontSize(11);
        const numberY = sheet.y;
        doc.text(number, MARGIN_X, numberY);

        if (marks > 0) {
            doc.setFont('times', 'normal');
            doc.setFontSize(10);
            doc.text(`(${marks} mark${marks === 1 ? '' : 's'})`, PAGE_WIDTH - MARGIN_X, numberY, { align: 'right' });
        }

        doc.setFont('times', 'normal');
        doc.setFontSize(11);
        sheet.paragraph(cleanText(question.text), MARGIN_X + 22, TEXT_WIDTH - 22);

        // Multiple choice options, lettered.
        const options = normaliseOptions(question.options);
        if (options.length > 0) {
            sheet.y += 2;
            options.forEach((option, i) => {
                const letter = String.fromCharCode(65 + i);
                sheet.paragraph(`${letter}.  ${cleanText(option)}`, MARGIN_X + 40, TEXT_WIDTH - 40, 14);
            });
        }

        // Sub-parts: (a), (b), (c)…
        const parts = Array.isArray(question.sub_parts) ? question.sub_parts : [];
        parts.forEach((part: any, i: number) => {
            const label = `(${String.fromCharCode(97 + i)})`;
            const partMarks = Number(part?.marks) || 0;

            sheet.reserve(LINE_HEIGHT);
            const partY = sheet.y;
            doc.setFont('times', 'normal');
            doc.setFontSize(11);
            doc.text(label, MARGIN_X + 22, partY);

            if (partMarks > 0) {
                doc.setFontSize(10);
                doc.text(`(${partMarks} mk${partMarks === 1 ? '' : 's'})`, PAGE_WIDTH - MARGIN_X, partY, { align: 'right' });
                doc.setFontSize(11);
            }

            sheet.paragraph(cleanText(part?.text ?? ''), MARGIN_X + 48, TEXT_WIDTH - 48);
            drawAnswerLines(sheet, Number(part?.answer_lines) || 2, MARGIN_X + 48);
        });

        // Room to answer. Multiple choice needs none; otherwise scale the space
        // to the marks, because two lines for a ten-mark essay is useless.
        if (parts.length === 0 && options.length === 0) {
            const lines = question.answer_lines ?? defaultAnswerLines(marks, question.type);
            drawAnswerLines(sheet, lines, MARGIN_X + 22);
        }

        sheet.y += 10;
    });

    // The conventional closing line, but never at the cost of an extra sheet of
    // paper — this gets photocopied for a whole class.
    if (sheet.y + 30 <= PAGE_HEIGHT - MARGIN_BOTTOM) {
        sheet.y += 8;
        doc.setFont('times', 'bold');
        doc.setFontSize(11);
        sheet.text('THIS IS THE LAST PRINTED PAGE', PAGE_WIDTH / 2, { align: 'center' });
    }

    sheet.paginate(paper.title);
    return sheet.buffer();
}

/**
 * The marking scheme.
 *
 * Kept as a separate document rather than an appendix: it is sold and delivered
 * separately, and a teacher handing out the paper must not hand out the answers
 * with it.
 */
export function renderMarkingSchemePdf(paper: RenderablePaper, questions: RenderableQuestion[]): Buffer {
    const sheet = new Sheet();
    const { doc } = sheet;

    const totalMarks = paper.total_marks || questions.reduce((sum, q) => sum + marksOf(q), 0);
    drawHeader(sheet, paper, totalMarks, 'Marking Scheme', false);

    questions.forEach((question, index) => {
        const marks = marksOf(question);

        sheet.reserve(LINE_HEIGHT * 2);

        const numberY = sheet.y;
        doc.setFont('times', 'bold');
        doc.setFontSize(11);
        doc.text(`${index + 1}.`, MARGIN_X, numberY);

        if (marks > 0) {
            doc.setFont('times', 'normal');
            doc.setFontSize(10);
            doc.text(`(${marks} mark${marks === 1 ? '' : 's'})`, PAGE_WIDTH - MARGIN_X, numberY, { align: 'right' });
        }

        // The question itself, dimmed, so the marker knows what is being answered.
        doc.setFont('times', 'italic');
        doc.setFontSize(10);
        doc.setTextColor(90);
        sheet.paragraph(cleanText(question.text), MARGIN_X + 22, TEXT_WIDTH - 22, 13);
        doc.setTextColor(0);

        sheet.y += 4;

        doc.setFont('times', 'normal');
        doc.setFontSize(11);

        const scheme = question.marking_scheme?.trim();
        const parts = Array.isArray(question.sub_parts) ? question.sub_parts : [];

        if (scheme) {
            sheet.paragraph(scheme, MARGIN_X + 22, TEXT_WIDTH - 22);
        } else if (parts.length > 0) {
            parts.forEach((part: any, i: number) => {
                const label = `(${String.fromCharCode(97 + i)})`;
                const answer = part?.marking_scheme?.trim() || part?.answer?.trim() || '—';
                sheet.paragraph(`${label}  ${cleanText(answer)}`, MARGIN_X + 22, TEXT_WIDTH - 22);
            });
        } else {
            // Honest about a gap rather than leaving a blank that reads as an
            // answer of "nothing".
            doc.setTextColor(140);
            sheet.paragraph('No marking scheme recorded for this question.', MARGIN_X + 22, TEXT_WIDTH - 22);
            doc.setTextColor(0);
        }

        sheet.y += 10;
    });

    sheet.paginate(`${paper.title} — Marking Scheme`);
    return sheet.buffer();
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Questions may carry light HTML from the rich-text editor. The PDF is plain
 * text, so tags are stripped rather than printed literally — a paper reading
 * "&lt;p&gt;What is photosynthesis?&lt;/p&gt;" is not a paper.
 */
function cleanText(value: string): string {
    if (!value) return '';
    return value
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li)>/gi, '\n')
        .replace(/<li>/gi, '• ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function normaliseOptions(options: any): string[] {
    if (!options) return [];
    if (Array.isArray(options)) {
        return options
            .map((o) => (typeof o === 'string' ? o : (o?.text ?? o?.label ?? '')))
            .filter((o: string) => o && o.trim());
    }
    if (typeof options === 'object') {
        return Object.values(options).filter((o): o is string => typeof o === 'string' && o.trim().length > 0);
    }
    return [];
}

/** Writing space proportional to what is being asked for. */
function defaultAnswerLines(marks: number, type?: string | null): number {
    if (type === 'Multiple Choice' || type === 'True/False') return 1;
    if (marks <= 1) return 2;
    if (marks <= 3) return 3;
    if (marks <= 6) return 6;
    return Math.min(14, Math.ceil(marks * 1.5));
}

function drawAnswerLines(sheet: Sheet, count: number, x: number): void {
    if (count <= 0) return;
    const { doc } = sheet;
    doc.setLineWidth(0.4);
    doc.setDrawColor(170);

    for (let i = 0; i < count; i++) {
        sheet.reserve(ANSWER_LINE_GAP);
        sheet.y += ANSWER_LINE_GAP - 6;
        doc.line(x, sheet.y, PAGE_WIDTH - MARGIN_X, sheet.y);
        sheet.y += 6;
    }

    doc.setDrawColor(0);
    sheet.y += 4;
}
