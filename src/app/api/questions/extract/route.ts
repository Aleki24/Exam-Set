import { createClient } from '@/utils/supabase/server';
import { requireUser } from '@/utils/auth/guards';
import { sanitiseExtractedBatch } from '@/services/questionExtraction';
import { NextRequest, NextResponse } from 'next/server';

/**
 * TURNING A PAPER INTO QUESTIONS
 * ----------------------------------------------------------------------------
 * Takes a PDF, a Word document, an image of a paper, or pasted text, and asks a
 * model to structure it into questions. This never writes to the bank itself —
 * it returns a list, and the caller (`EnhancedBulkImport`) puts every one of
 * them in front of a human to review, edit and select before anything is
 * saved. That review step is the whole safety argument for using AI here at
 * all: the model can misread a mark allocation or mistype an answer, and the
 * cost of that mistake landing unseen in a live question bank is a wrong
 * answer reaching a classroom. A wrong row in a preview table costs a
 * teacher one click to fix or discard.
 *
 * THREE THINGS THAT WERE WRONG HERE, FIXED IN THIS FILE
 *
 * It called `/api/perplexity` — its own sibling route — over HTTP, using
 * `NEXT_PUBLIC_BASE_URL` to build the URL. That variable defaults to
 * `http://localhost:3000`, so on any deployment where it is not set this
 * silently tries to call itself on localhost and fails. Calling the AI
 * provider directly, the way `aiMarking.ts` already does, removes the
 * self-call and the environment variable it depended on.
 *
 * For an image upload, the base64 data URL was built and then never sent: the
 * message given to the model was the plain instruction "Extract all exam
 * questions from this image", with no image attached. The model had nothing to
 * read and no way to say so — it would answer anyway, which means every image
 * extraction until now was answered from nothing. Image content is now sent as
 * an actual image block. If the configured model does not accept one, the
 * provider returns an error and that is reported honestly, which is a better
 * failure than a confident answer with no basis.
 *
 * There was no timeout. A hung upstream call had nothing to stop it short of
 * the platform's own limit, however long that is. It now carries the same
 * budget `aiMarking.ts` uses for a single call.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const API_URL = 'https://api.perplexity.ai/chat/completions';

/**
 * `sonar` is search-grounded — the model can reach for the web while reading
 * the text you handed it, which is a cost with nothing to buy here: the
 * content to extract from is already in the request. It is used anyway
 * because it is the model already configured and proven working (see
 * `aiMarking.ts`), and this is a fix for the extractor's real bugs, not a
 * provider change. Swapping to a plain chat model — cheaper, no search fee —
 * is a one-line change to `MODEL` once one is chosen and verified against a
 * live account; nothing else here depends on which model this constant names.
 */
const MODEL = 'sonar';

const CALL_TIMEOUT_MS = 45_000;

/** However large the source document, a batch bigger than this is not a batch
 * anyone can review — see the module comment on why review is the point. */
const MAX_QUESTIONS = 80;

function apiKey(): string {
    return process.env.PERPLEXITY_API_KEY || process.env.NEXT_PUBLIC_PERPLEXITY_API_KEY || '';
}

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
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ buffer });
        return result.value || '';
    } catch (error) {
        console.error('Word parse error:', error);
        throw new Error('Failed to parse Word document');
    }
}

const SYSTEM_PROMPT = `You are an expert at extracting exam questions from educational content.

TASK: Carefully analyse the provided content and extract every exam or test question in it.

IMPORTANT:
- Look for numbered questions (1., 2., etc.), lettered parts (a., b., c.), or questions marked Q1, Q2.
- Identify multiple choice questions by looking for options A, B, C, D.
- Look for mark allocations like [2 marks], (3 pts).
- Extract the COMPLETE question text, not a fragment of it.
- Do not invent a question that is not in the content. If the content has none, return an empty list.

For each question, give:
- text: the full question text
- marks: number of marks (default 1 if not specified)
- difficulty: Easy, Medium, or Difficult — estimate from complexity
- topic: the main topic
- subtopic: a more specific topic, if identifiable
- type: one of Multiple Choice, True/False, Matching, Fill-in-the-blank, Numeric, Structured, Short Answer, Essay, Practical, Oral
- options: for Multiple Choice, every option as an array of strings
- markingScheme: the expected answer or marking guidance, only if it is actually visible in the content — never invent one

Reply with JSON only, no prose and no code fence:
{
    "questions": [
        {
            "text": "What is the capital of France?",
            "marks": 1,
            "difficulty": "Easy",
            "topic": "Geography",
            "subtopic": "European capitals",
            "type": "Short Answer",
            "markingScheme": "Paris"
        }
    ],
    "metadata": {
        "documentTitle": "Inferred title, or Unknown",
        "estimatedSubject": "Main subject area",
        "totalQuestionsFound": 1
    }
}`;

export async function POST(request: NextRequest) {
    {
        const supabase = await createClient();
        const { failure } = await requireUser(supabase);
        if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });
    }

    const key = apiKey();
    if (!key) {
        return NextResponse.json(
            { error: 'AI extraction is not configured on this deployment. Paste the questions in instead.' },
            { status: 501 }
        );
    }

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const text = formData.get('text') as string | null;

        if (!file && !text) {
            return NextResponse.json({ error: 'No file or text provided' }, { status: 400 });
        }

        let contentToProcess = text || '';
        let imageDataUrl: string | null = null;

        if (file) {
            const mimeType = file.type;
            const buffer = Buffer.from(await file.arrayBuffer());

            if (mimeType.startsWith('image/')) {
                imageDataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
            } else if (mimeType === 'application/pdf') {
                try {
                    contentToProcess = await parsePDF(buffer);
                } catch {
                    return NextResponse.json(
                        {
                            error: 'Failed to parse PDF. Please copy and paste the text instead.',
                            suggestion: 'Open your PDF, select all text (Ctrl+A), copy (Ctrl+C), and paste it in the text box.',
                        },
                        { status: 400 }
                    );
                }
            } else if (
                mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                mimeType === 'application/msword'
            ) {
                try {
                    contentToProcess = await parseWord(buffer);
                } catch {
                    return NextResponse.json(
                        {
                            error: 'Failed to parse Word document. Please copy and paste the text instead.',
                            suggestion: 'Open your document, select all text (Ctrl+A), copy (Ctrl+C), and paste it in the text box.',
                        },
                        { status: 400 }
                    );
                }
            } else if (mimeType === 'text/plain') {
                contentToProcess = buffer.toString('utf-8');
            } else {
                return NextResponse.json(
                    {
                        error: `Unsupported file type: ${mimeType}`,
                        suggestion: 'Please upload a PDF, Word document, image, or paste text directly.',
                    },
                    { status: 400 }
                );
            }

            if (!imageDataUrl && contentToProcess.length > 25000) {
                contentToProcess = contentToProcess.substring(0, 25000) + '...[truncated]';
            }
        }

        if (!imageDataUrl && !contentToProcess.trim()) {
            return NextResponse.json(
                { error: 'Could not extract any text from the file. Please paste text directly.' },
                { status: 400 }
            );
        }

        const userContent: any = imageDataUrl
            ? [
                  { type: 'text', text: 'Extract all exam questions visible in this image.' },
                  { type: 'image_url', image_url: { url: imageDataUrl } },
              ]
            : `Extract all exam questions from the following content:\n\n${contentToProcess}`;

        let response: Response;
        try {
            response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${key}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: MODEL,
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        { role: 'user', content: userContent },
                    ],
                    temperature: 0.1,
                }),
                signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
            });
        } catch (err) {
            console.error('AI extraction call failed:', err instanceof Error ? err.message : err);
            return NextResponse.json(
                { error: 'Could not reach the AI service. Please try again, or paste the text instead.' },
                { status: 502 }
            );
        }

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            console.error('AI extraction HTTP error:', response.status, errText.slice(0, 500));

            // An image the model cannot read is a real, foreseeable limitation,
            // not a bug — worth telling the user plainly rather than a generic
            // failure, since the fix on their end is different (use a PDF or
            // paste the text instead of a photo).
            if (imageDataUrl && (response.status === 400 || response.status === 415)) {
                return NextResponse.json(
                    {
                        error: 'The configured AI model could not read this image. Try a text-based PDF, a Word document, or paste the text instead.',
                    },
                    { status: 400 }
                );
            }

            return NextResponse.json({ error: 'AI extraction failed' }, { status: 502 });
        }

        const aiResult = await response.json();
        const aiContent = aiResult?.choices?.[0]?.message?.content || '';

        let extractedData: any;
        try {
            let cleaned = String(aiContent)
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
            return NextResponse.json(
                { error: 'Failed to parse the AI response', raw: String(aiContent).substring(0, 1000) },
                { status: 502 }
            );
        }

        const { questions, truncated } = sanitiseExtractedBatch(extractedData?.questions, MAX_QUESTIONS);

        return NextResponse.json({
            success: true,
            questions,
            metadata: {
                documentTitle: typeof extractedData?.metadata?.documentTitle === 'string' ? extractedData.metadata.documentTitle : null,
                estimatedSubject: typeof extractedData?.metadata?.estimatedSubject === 'string' ? extractedData.metadata.estimatedSubject : null,
                totalQuestionsFound: questions.length,
                truncated,
            },
        });
    } catch (error: any) {
        console.error('Document extraction error:', error);
        return NextResponse.json({ error: error?.message || 'Unexpected error' }, { status: 500 });
    }
}
