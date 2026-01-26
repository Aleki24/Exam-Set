import { NextRequest, NextResponse } from 'next/server';

// Dynamic import to avoid bundling issues
// Helper to parse PDF buffer
async function parsePDF(buffer: Buffer): Promise<string> {
    try {
        const pdfParse = require('pdf-parse');
        const data = await pdfParse(buffer);
        return data.text || '';
    } catch (error) {
        console.error('PDF parse error:', error);
        throw new Error('Failed to parse PDF');
    }
}

async function parseWord(buffer: Buffer): Promise<string> {
    try {
        // Use dynamic import for mammoth
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ buffer });
        return result.value || '';
    } catch (error) {
        console.error('Word parse error:', error);
        throw new Error('Failed to parse Word document');
    }
}

// Extract questions from uploaded document using AI
export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const text = formData.get('text') as string | null;

        if (!file && !text) {
            return NextResponse.json(
                { error: 'No file or text provided' },
                { status: 400 }
            );
        }

        let contentToProcess = text || '';
        let isImageContent = false;

        // If file is provided, process it based on type
        if (file) {
            const mimeType = file.type;
            const buffer = Buffer.from(await file.arrayBuffer());

            if (mimeType.startsWith('image/')) {
                // For images, convert to base64 data URL for vision model
                const base64 = buffer.toString('base64');
                contentToProcess = `data:${mimeType};base64,${base64}`;
                isImageContent = true;
            } else if (mimeType === 'application/pdf') {
                // Parse PDF
                try {
                    contentToProcess = await parsePDF(buffer);
                } catch (e: any) {
                    return NextResponse.json({
                        error: 'Failed to parse PDF. Please copy and paste the text instead.',
                        suggestion: 'Open your PDF, select all text (Ctrl+A), copy (Ctrl+C), and paste it in the text box.'
                    }, { status: 400 });
                }
            } else if (
                mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                mimeType === 'application/msword'
            ) {
                // Parse Word Document
                try {
                    contentToProcess = await parseWord(buffer);
                } catch (e: any) {
                    return NextResponse.json({
                        error: 'Failed to parse Word document. Please copy and paste the text instead.',
                        suggestion: 'Open your document, select all text (Ctrl+A), copy (Ctrl+C), and paste it in the text box.'
                    }, { status: 400 });
                }
            } else if (mimeType === 'text/plain') {
                // Plain text files
                contentToProcess = buffer.toString('utf-8');
            } else {
                return NextResponse.json({
                    error: `Unsupported file type: ${mimeType}`,
                    suggestion: 'Please upload a PDF, Word document, image, or paste text directly.'
                }, { status: 400 });
            }

            // Truncate if too long
            if (!isImageContent && contentToProcess.length > 25000) {
                contentToProcess = contentToProcess.substring(0, 25000) + '...[truncated]';
            }
        }

        if (!contentToProcess.trim()) {
            return NextResponse.json(
                { error: 'Could not extract any text from the file. Please paste text directly.' },
                { status: 400 }
            );
        }

        // Build the prompt
        const systemPrompt = `You are an expert at extracting exam questions from educational content.

TASK: Carefully analyze the provided content and extract ALL exam/test questions you can find.

IMPORTANT:
- Look for numbered questions (1., 2., etc.), lettered questions (a., b., c.), or questions marked with Q1, Q2, etc.
- Identify multiple choice questions by looking for options A, B, C, D
- Look for point/mark allocations like [2 marks], (3 pts), etc.
- Extract the COMPLETE question text, not just partial text
- If you see question numbers, include them in context

For each question, provide:
- text: The full question text
- marks: Number of marks/points (default to 1 if not specified)
- difficulty: Easy, Medium, or Difficult (estimate based on complexity)
- topic: Main topic/subject area
- subtopic: More specific topic if identifiable
- type: One of: Multiple Choice, True/False, Matching, Fill-in-the-blank, Numeric, Structured, Short Answer, Essay
- options: For MCQ, list all options as array
- markingScheme: Expected answer or marking criteria if visible

OUTPUT FORMAT (strict JSON):
{
    "questions": [
        {
            "text": "What is the capital of France?",
            "marks": 1,
            "difficulty": "Easy",
            "topic": "Geography",
            "subtopic": "European Capitals",
            "type": "Short Answer",
            "markingScheme": "Paris"
        }
    ],
    "metadata": {
        "documentTitle": "Inferred title or 'Unknown'",
        "estimatedSubject": "Main subject area",
        "totalQuestionsFound": 1
    }
}`;

        const userMessage = isImageContent
            ? 'Extract all exam questions from this image. Look carefully at all text visible in the image.'
            : `Extract all exam questions from the following content:\n\n${contentToProcess}`;

        // Call AI
        const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/perplexity`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'sonar',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.1,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('AI API error:', errText);
            throw new Error('AI extraction failed');
        }

        const aiResult = await response.json();
        const aiContent = aiResult.choices?.[0]?.message?.content || '';

        // Parse the AI response
        let extractedData;
        try {
            let cleaned = aiContent
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim();

            const firstBrace = cleaned.indexOf('{');
            const lastBrace = cleaned.lastIndexOf('}');

            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                cleaned = cleaned.substring(firstBrace, lastBrace + 1);
            }

            extractedData = JSON.parse(cleaned);
        } catch (parseError) {
            console.error('Failed to parse AI response:', parseError);
            return NextResponse.json({
                error: 'Failed to parse AI response',
                raw: aiContent.substring(0, 1000)
            }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            ...extractedData,
        });
    } catch (error: any) {
        console.error('Document extraction error:', error);
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}
