import { Question, ExamPaper, ExamMetadata } from '@/types';

// ============================================================================
// EXPORT SERVICE
// Provides export functionality for questions and exams
// ============================================================================

/**
 * Export questions to CSV format
 */
export function exportQuestionsToCSV(questions: Question[]): string {
    const headers = [
        'ID',
        'Text',
        'Type',
        'Marks',
        'Difficulty',
        'Topic',
        'Subtopic',
        'Bloom\'s Level',
        'Options',
        'Marking Scheme'
    ];

    const rows = questions.map((q) => [
        q.id,
        escapeCSV(stripHTML(q.text)),
        q.type,
        q.marks.toString(),
        q.difficulty,
        q.topic || '',
        q.subtopic || '',
        q.bloomsLevel || '',
        q.options ? q.options.join('|') : '',
        escapeCSV(stripHTML(q.markingScheme || ''))
    ]);

    const csvContent = [
        headers.join(','),
        ...rows.map((row) => row.join(','))
    ].join('\n');

    return csvContent;
}

/**
 * Export exam to CSV format
 */
export function exportExamToCSV(paper: ExamPaper): string {
    const metadataRows = [
        ['Exam Title', paper.metadata.title],
        ['Subject', paper.metadata.subject],
        ['Code', paper.metadata.code],
        ['Time Limit', paper.metadata.timeLimit],
        ['Total Marks', paper.metadata.totalMarks.toString()],
        ['Institution', paper.metadata.institution],
        [''],
        ['Questions:']
    ];

    const questionHeaders = ['#', 'Question', 'Type', 'Marks', 'Topic'];
    const questionRows = paper.questions.map((q, idx) => [
        (idx + 1).toString(),
        escapeCSV(stripHTML(q.text)),
        q.type,
        q.marks.toString(),
        q.topic || ''
    ]);

    const csvContent = [
        ...metadataRows.map((row) => row.join(',')),
        questionHeaders.join(','),
        ...questionRows.map((row) => row.join(','))
    ].join('\n');

    return csvContent;
}

/**
 * Generate answer key in text format
 */
export function generateAnswerKey(questions: Question[]): string {
    const lines: string[] = [
        'ANSWER KEY',
        '='.repeat(50),
        ''
    ];

    questions.forEach((q, idx) => {
        lines.push(`Question ${idx + 1} (${q.marks} marks)`);
        lines.push('-'.repeat(30));

        if (q.options && q.options.length > 0) {
            // MCQ - show correct option if marked
            lines.push('Type: Multiple Choice');
            q.options.forEach((opt, optIdx) => {
                const letter = String.fromCharCode(65 + optIdx);
                lines.push(`  ${letter}. ${opt}`);
            });
        } else if (q.type === 'True/False') {
            lines.push('Type: True/False');
        } else {
            lines.push(`Type: ${q.type}`);
        }

        if (q.markingScheme) {
            lines.push('');
            lines.push('Marking Scheme:');
            lines.push(stripHTML(q.markingScheme));
        }

        if (q.answerSchema) {
            lines.push('');
            lines.push('Expected Answer:');
            lines.push(q.answerSchema);
        }

        lines.push('');
        lines.push('');
    });

    return lines.join('\n');
}

/**
 * Export questions to JSON format
 */
export function exportQuestionsToJSON(questions: Question[]): string {
    return JSON.stringify(questions, null, 2);
}

/**
 * Trigger download of content as a file
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Download CSV file
 */
export function downloadCSV(content: string, filename: string): void {
    downloadFile(content, filename, 'text/csv;charset=utf-8;');
}

/**
 * Download JSON file
 */
export function downloadJSON(content: string, filename: string): void {
    downloadFile(content, filename, 'application/json');
}

/**
 * Download text file
 */
export function downloadText(content: string, filename: string): void {
    downloadFile(content, filename, 'text/plain;charset=utf-8;');
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Strip HTML tags from string
 */
function stripHTML(html: string): string {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

/**
 * Escape value for CSV (handle commas, quotes, newlines)
 */
function escapeCSV(value: string): string {
    if (!value) return '';
    // If contains comma, quote, or newline, wrap in quotes and escape existing quotes
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

// ============================================================================
// DOCX EXPORT (simplified - for full features, use docx library)
// ============================================================================

/**
 * Generate a simple Word document XML
 * For production, consider using the 'docx' npm package
 */
export async function exportToDocx(paper: ExamPaper): Promise<Blob> {
    // This creates a simple .doc file using HTML (Word can open HTML files as .doc)
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: 'Times New Roman', serif; font-size: 12pt; }
        h1 { font-size: 16pt; text-align: center; margin-bottom: 20pt; }
        h2 { font-size: 14pt; margin-top: 20pt; }
        .header { text-align: center; margin-bottom: 30pt; }
        .meta { margin-bottom: 5pt; }
        .question { margin-bottom: 20pt; page-break-inside: avoid; }
        .question-number { font-weight: bold; }
        .marks { float: right; color: #666; }
        .options { margin-left: 20pt; }
        .answer-space { border-bottom: 1px dotted #999; height: 50pt; margin: 10pt 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${escapeHTML(paper.metadata.title)}</h1>
        <div class="meta"><strong>Subject:</strong> ${escapeHTML(paper.metadata.subject)}</div>
        <div class="meta"><strong>Code:</strong> ${escapeHTML(paper.metadata.code)}</div>
        <div class="meta"><strong>Time:</strong> ${escapeHTML(paper.metadata.timeLimit)}</div>
        <div class="meta"><strong>Total Marks:</strong> ${paper.metadata.totalMarks}</div>
        ${paper.metadata.institution ? `<div class="meta"><strong>Institution:</strong> ${escapeHTML(paper.metadata.institution)}</div>` : ''}
    </div>
    
    <h2>Instructions</h2>
    <p>${paper.metadata.instructions || 'Answer all questions.'}</p>
    
    <h2>Questions</h2>
    ${paper.questions.map((q, idx) => `
        <div class="question">
            <p>
                <span class="question-number">Question ${idx + 1}.</span>
                <span class="marks">[${q.marks} mark${q.marks !== 1 ? 's' : ''}]</span>
            </p>
            <p>${q.text}</p>
            ${q.options ? `
                <div class="options">
                    ${q.options.map((opt, optIdx) => `
                        <p>${String.fromCharCode(65 + optIdx)}. ${escapeHTML(opt)}</p>
                    `).join('')}
                </div>
            ` : `
                <div class="answer-space"></div>
            `}
        </div>
    `).join('')}
</body>
</html>
    `;

    return new Blob([html], { type: 'application/msword' });
}

/**
 * Download DOCX file
 */
export async function downloadDocx(paper: ExamPaper, filename: string): Promise<void> {
    const blob = await exportToDocx(paper);
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.doc') ? filename : `${filename}.doc`;
    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Escape HTML special characters
 */
function escapeHTML(str: string): string {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
