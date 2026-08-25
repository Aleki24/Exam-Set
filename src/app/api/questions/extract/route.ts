import { createClient } from '@/utils/supabase/server';
import { requireUser } from '@/utils/auth/guards';
import {
    DIFFICULTIES,
    QUESTION_TYPES,
    errorDetail,
    sanitiseExtractedBatch,
} from '@/services/questionExtraction';
import { extractPdfPageImages, extractPdfText, extractWordText } from '@/services/documentText';
import { aiAvailable, aiJson, supportedImageType, type AiContent } from '@/services/claude';
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
 * WHAT USED TO BE WRONG HERE
 *
 * It called `/api/perplexity` — its own sibling route — over HTTP, using
 * `NEXT_PUBLIC_BASE_URL` to build the URL, which defaults to localhost and so
 * failed on every deployment that did not set it. For an image upload it built
 * a base64 data URL and then never sent it, so the model was asked to read an
 * image it had not been given and answered from nothing. There was no timeout.
 * And the reply was parsed by stripping a code fence, hunting for the first `{`
 * and the last `}`, and hoping — a step that failed whenever the model wrapped
 * its answer in a sentence.
 *
 * All four are gone. The provider is called directly through `services/claude`,
 * an image is sent as an actual image block, the call carries a timeout, and
 * the reply is constrained to a schema by the API, so there is no parsing step
 * left to fail. What remains is `sanitiseExtractedBatch`: the schema guarantees
 * the reply has the right *shape*, never that a mark allocation is sensible.
 */

/** However large the source document, a batch bigger than this is not a batch
 * anyone can review — see the module comment on why review is the point. */
const MAX_QUESTIONS = 80;

/** A paper is not a fast call, but it is not an unbounded one either. */
const CALL_TIMEOUT_MS = 90_000;

/** Room for 80 questions, their options and schemes, plus thinking. */
const MAX_OUTPUT_TOKENS = 16_000;

/** Beyond this the source is truncated — see the note where it is applied. */
const MAX_INPUT_CHARS = 100_000;

/**
 * How many pages of a scan to send.
 *
 * Each page is a full-resolution photograph, so this is the cost ceiling as
 * much as the token one. Eight covers a typical Kenyan paper; a longer one is
 * better split and uploaded in parts than silently truncated.
 */
const MAX_SCAN_PAGES = 8;

/** See services/documentText for why the actual reading is not done here. */
async function parsePDF(buffer: Buffer): Promise<string> {
    try {
        return await extractPdfText(buffer);
    } catch (error) {
        console.error('PDF parse error:', error);
        // Keep the original. See `errorDetail` on why it travels to the client.
        throw new Error('Failed to parse PDF', { cause: error });
    }
}

async function parseWord(buffer: Buffer): Promise<string> {
    try {
        return await extractWordText(buffer);
    } catch (error) {
        console.error('Word parse error:', error);
        throw new Error('Failed to parse Word document', { cause: error });
    }
}

const SYSTEM_PROMPT = `You are an expert at extracting exam questions from educational content, working with Kenyan KNEC and CBC papers.

TASK: Read the provided content and extract every exam or test question in it.

- Look for numbered questions (1., 2.), lettered parts (a., b., c.), or questions marked Q1, Q2.
- Identify multiple choice questions by their options, and put every option in "options".
- Read mark allocations like [2 marks] or (3 pts) into "marks". Use 1 only when the paper genuinely does not say.
- Extract the COMPLETE question text, not a fragment.
- Never invent a question that is not in the content. If there are none, return an empty list.
- "markingScheme" is only for an answer actually visible in the content — a printed answer key or worked solution. Never write one yourself. Leave it empty when the paper does not give one.
- Leave "subtopic" empty rather than guessing, and "options" empty for anything that is not multiple choice.`;

/**
 * The shape the reply is constrained to.
 *
 * The enums come from the same constants `sanitiseExtractedQuestion` validates
 * against, so the schema cannot drift away from what the app will accept — add
 * a question type in one place and both the model and the sanitiser learn it.
 *
 * Every field is required because a JSON schema cannot say "optional but
 * well-formed when present": the model fills unknowns with an empty string or
 * an empty list, which the sanitiser already reads as absent.
 */
const EXTRACTION_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['questions', 'metadata'],
    properties: {
        questions: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['text', 'marks', 'difficulty', 'topic', 'subtopic', 'type', 'options', 'markingScheme'],
                properties: {
                    text: { type: 'string', description: 'The complete question text.' },
                    marks: { type: 'integer', description: 'Marks available. 1 if the paper does not say.' },
                    difficulty: { type: 'string', enum: [...DIFFICULTIES] },
                    topic: { type: 'string', description: 'The main topic. Empty if unclear.' },
                    subtopic: { type: 'string', description: 'A narrower topic, or empty.' },
                    type: { type: 'string', enum: [...QUESTION_TYPES] },
                    options: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Every option, for multiple choice. Empty otherwise.',
                    },
                    markingScheme: {
                        type: 'string',
                        description: 'The answer, only if printed in the content. Empty otherwise.',
                    },
                },
            },
        },
        metadata: {
            type: 'object',
            additionalProperties: false,
            required: ['documentTitle', 'estimatedSubject'],
            properties: {
                documentTitle: { type: 'string', description: 'The paper’s title, or empty.' },
                estimatedSubject: { type: 'string', description: 'The subject, or empty.' },
            },
        },
    },
} as const;

interface ExtractionReply {
    questions?: unknown;
    metadata?: { documentTitle?: unknown; estimatedSubject?: unknown };
}

export async function POST(request: NextRequest) {
    {
        const supabase = await createClient();
        const { failure } = await requireUser(supabase);
        if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });
    }

    if (!aiAvailable()) {
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
        let images: AiContent[] = [];

        if (file) {
            const mimeType = file.type;
            const buffer = Buffer.from(await file.arrayBuffer());

            if (mimeType.startsWith('image/')) {
                // Refuse an unreadable format here, with the list, rather than
                // letting the provider return a 400 that says less.
                const mediaType = supportedImageType(mimeType);
                if (!mediaType) {
                    return NextResponse.json(
                        {
                            error: `Images of type ${mimeType} cannot be read.`,
                            suggestion: 'Save the photo as PNG or JPEG and upload it again, or upload the PDF instead.',
                        },
                        { status: 400 }
                    );
                }
                images = [{ type: 'image', source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') } }];
            } else if (mimeType === 'application/pdf') {
                try {
                    contentToProcess = await parsePDF(buffer);

                    /*
                     * A scan has no text layer, so `parsePDF` returns nothing
                     * and the request used to die on "no content" while the
                     * document was perfectly legible to a person. Most Kenyan
                     * past papers are photographs or photocopies, so this is
                     * the common case and not the edge one.
                     *
                     * The provider could always read images; only a JPEG
                     * uploaded directly could reach that path. A PDF can now
                     * take it too, by handing over the pages it is made of.
                     */
                    if (contentToProcess.trim().length < 40) {
                        const pages = await extractPdfPageImages(buffer, MAX_SCAN_PAGES);
                        images = pages.map((page) => ({
                            type: 'image' as const,
                            source: {
                                type: 'base64' as const,
                                media_type: page.mediaType,
                                data: page.data.toString('base64'),
                            },
                        }));
                        if (images.length === 0) {
                            return NextResponse.json(
                                {
                                    error: 'That PDF has no readable text and no readable page images.',
                                    suggestion:
                                        'It may be an unusual scan format. Export the pages as JPEG or PNG and upload one of those, or paste the text.',
                                },
                                { status: 400 }
                            );
                        }
                    }
                } catch (err) {
                    return NextResponse.json(
                        {
                            error: 'Failed to parse PDF. Please copy and paste the text instead.',
                            suggestion: 'Open your PDF, select all text (Ctrl+A), copy (Ctrl+C), and paste it in the text box.',
                            detail: errorDetail(err),
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
                } catch (err) {
                    return NextResponse.json(
                        {
                            error: 'Failed to parse Word document. Please copy and paste the text instead.',
                            suggestion: 'Open your document, select all text (Ctrl+A), copy (Ctrl+C), and paste it in the text box.',
                            detail: errorDetail(err),
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
        }

        // The old cap was 25,000 characters — around eight pages, which quietly
        // cut the back half off a full paper. The context window is a million
        // tokens; the real limit is what a person can review, and that is
        // MAX_QUESTIONS. This is only here so a pathological upload cannot bill
        // an unbounded amount.
        let truncatedInput = false;
        if (images.length === 0 && contentToProcess.length > MAX_INPUT_CHARS) {
            contentToProcess = contentToProcess.slice(0, MAX_INPUT_CHARS);
            truncatedInput = true;
        }

        if (images.length === 0 && !contentToProcess.trim()) {
            return NextResponse.json(
                { error: 'Could not extract any text from the file. Please paste text directly.' },
                { status: 400 }
            );
        }

        const content: AiContent[] =
            images.length > 0
                ? [
                      {
                          type: 'text',
                          text:
                              images.length === 1
                                  ? 'Extract every exam question visible in this image.'
                                  : `Extract every exam question visible across these ${images.length} pages of one paper. ` +
                                    'Keep the paper\u2019s own numbering, and do not repeat a question that spans a page break.',
                      },
                      ...images,
                  ]
                : [{ type: 'text', text: `Extract every exam question from the following content:\n\n${contentToProcess}` }];

        const result = await aiJson<ExtractionReply>({
            system: SYSTEM_PROMPT,
            content,
            schema: EXTRACTION_SCHEMA as unknown as Record<string, unknown>,
            maxTokens: MAX_OUTPUT_TOKENS,
            // Reading a paper is transcription with light classification, not a
            // judgement call. `medium` keeps it accurate on a dense paper
            // without paying for deliberation there is nothing to deliberate.
            effort: 'medium',
            timeoutMs: CALL_TIMEOUT_MS,
        });

        if (!result.ok) {
            return NextResponse.json(
                {
                    error: result.failure.message,
                    detail: result.failure.detail,
                    suggestion: 'You can paste the questions in as text instead.',
                },
                { status: result.failure.retryable ? 503 : 502 }
            );
        }

        const { questions, truncated } = sanitiseExtractedBatch(result.value?.questions, MAX_QUESTIONS);

        const title = result.value?.metadata?.documentTitle;
        const subject = result.value?.metadata?.estimatedSubject;

        return NextResponse.json({
            success: true,
            questions,
            metadata: {
                documentTitle: typeof title === 'string' && title.trim() ? title : null,
                estimatedSubject: typeof subject === 'string' && subject.trim() ? subject : null,
                totalQuestionsFound: questions.length,
                truncated,
                truncatedInput,
            },
        });
    } catch (error: any) {
        console.error('Document extraction error:', error);
        return NextResponse.json({ error: error?.message || 'Unexpected error' }, { status: 500 });
    }
}
