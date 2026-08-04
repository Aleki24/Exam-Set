/**
 * THE AI PROVIDER — server only
 * ----------------------------------------------------------------------------
 * Every AI feature in this app goes through here: reading questions off an
 * uploaded paper, marking an answer, writing a marking scheme. One place that
 * knows the key, the model, the timeout, and what to do when the provider says
 * no.
 *
 * WHY THIS REPLACED PERPLEXITY
 *
 * The three features above were built on Perplexity's `sonar`, which is
 * search-grounded — the model can reach out to the web while it works. For the
 * job actually being done here that is a cost with nothing to buy: the paper to
 * extract from, the scheme to mark against, and the answer to mark are all
 * already in the request. It is also a correctness risk. A model that can
 * search while transcribing a Grade 9 paper can blend in a question that was
 * never on it, and nothing downstream would know the difference.
 *
 * WHAT STRUCTURED OUTPUT REMOVED
 *
 * Every one of these calls wants JSON back, and every one of them used to ask
 * for JSON in the prompt and then fight the answer: strip a ```json fence, hunt
 * for the first `{` and the last `}`, parse, and give up with an error nobody
 * could act on when the model wrapped its reply in a sentence. Three copies of
 * that, each subtly different.
 *
 * `output_config.format` constrains the reply to a schema at the API, so the
 * shape is guaranteed before it reaches us and the fence-stripping and
 * brace-hunting are all gone. What is *not* guaranteed is that the values make
 * sense — a schema can say `marks_awarded` is a number, not that it is within
 * the marks available — so callers still check meaning. They no longer check
 * syntax.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import Anthropic from '@anthropic-ai/sdk';

/**
 * `claude-sonnet-5` across all three features.
 *
 * Not search-grounded, which is the point. Marking and scheme generation could
 * arguably run on something cheaper, but both decide something about a real
 * learner — a mark, or the scheme a mark will be made against — and that is the
 * one place in this app worth paying for headroom.
 */
export const MODEL = 'claude-sonnet-5';

function apiKey(): string {
    return process.env.ANTHROPIC_API_KEY || '';
}

/** Whether AI features can run at all on this deployment. */
export function aiAvailable(): boolean {
    return apiKey().length > 0;
}

let client: Anthropic | undefined;

function getClient(): Anthropic {
    if (!client) client = new Anthropic({ apiKey: apiKey() });
    return client;
}

/** How the caller should describe a failure, and whether trying again may help. */
export interface AiFailure {
    /** What to tell the person looking at the screen. */
    message: string;
    /** The provider's own words, for a `detail` field. Never a stack trace. */
    detail?: string;
    /** True when the same request might succeed later (rate limit, overload). */
    retryable: boolean;
}

export type AiResult<T> = { ok: true; value: T } | { ok: false; failure: AiFailure };

/**
 * Turns whatever went wrong into something a human can act on.
 *
 * The distinction that matters is not the status code but what the reader has
 * to go and do: top up an account, wait, fix a key, or nothing at all because
 * it is the provider's problem. A single "AI request failed" — which is what
 * this app used to return — pointed at none of them and sent whoever had to
 * fix it back to a server log.
 */
function describe(error: unknown): AiFailure {
    if (error instanceof Anthropic.AuthenticationError) {
        return {
            message: 'The AI service rejected the API key. Check ANTHROPIC_API_KEY on the deployment.',
            detail: shortly(error),
            retryable: false,
        };
    }
    if (error instanceof Anthropic.PermissionDeniedError) {
        return {
            message: 'The AI key does not have access to this model. Check the key’s permissions.',
            detail: shortly(error),
            retryable: false,
        };
    }
    if (error instanceof Anthropic.RateLimitError) {
        return {
            message: 'The AI service is rate limiting this account. Wait a moment and try again.',
            detail: shortly(error),
            retryable: true,
        };
    }
    if (error instanceof Anthropic.NotFoundError) {
        return {
            message: `The AI service does not recognise the model ${MODEL}.`,
            detail: shortly(error),
            retryable: false,
        };
    }
    if (error instanceof Anthropic.BadRequestError) {
        return {
            message: 'The AI service refused the request. The detail below says why.',
            detail: shortly(error),
            retryable: false,
        };
    }
    if (error instanceof Anthropic.APIConnectionTimeoutError) {
        return {
            message: 'The AI service did not answer in time. Try a shorter document, or try again.',
            detail: shortly(error),
            retryable: true,
        };
    }
    if (error instanceof Anthropic.APIConnectionError) {
        return {
            message: 'Could not reach the AI service. Try again in a moment.',
            detail: shortly(error),
            retryable: true,
        };
    }
    if (error instanceof Anthropic.APIError) {
        // 5xx and anything else the SDK types but this does not name.
        return {
            message: 'The AI service is having trouble at their end. Try again shortly.',
            detail: shortly(error),
            retryable: (error.status ?? 500) >= 500,
        };
    }
    return {
        message: 'The AI request failed unexpectedly.',
        detail: shortly(error),
        retryable: false,
    };
}

/**
 * One readable line. Never a stack trace, never an API key.
 *
 * The SDK already builds an `APIError`'s message as the status followed by the
 * response body, so prefixing the status again would read `HTTP 401: 401 {…}`.
 */
function shortly(error: unknown): string | undefined {
    if (error instanceof Anthropic.APIError) {
        const message = String(error.message).trim();
        return (message || `HTTP ${error.status ?? '?'}`).slice(0, 240);
    }
    if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, 240);
    return undefined;
}

/**
 * The image formats the model can actually read.
 *
 * A photo of a paper is a real way teachers upload one, and every other format
 * — HEIC straight off an iPhone, a TIFF scan — is a 400 from the provider if it
 * gets that far. `supportedImageType` lets the caller say so plainly instead.
 */
export const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

export function supportedImageType(mimeType: string): SupportedImageType | null {
    const found = SUPPORTED_IMAGE_TYPES.find((t) => t === mimeType.toLowerCase());
    return found ?? null;
}

/** A `text` block, or an image the model should read. */
export type AiContent =
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'base64'; media_type: SupportedImageType; data: string } };

export interface AiJsonRequest {
    /** The instruction that governs the whole call. */
    system: string;
    /** What to work on. A plain string is sent as one text block. */
    content: string | AiContent[];
    /**
     * A JSON Schema the reply is constrained to.
     *
     * Objects need `additionalProperties: false`. Value ranges (`minimum`,
     * `maxLength`) are not enforced — check those yourself after.
     */
    schema: Record<string, unknown>;
    maxTokens: number;
    /**
     * How hard to think. `low` for mechanical work like transcribing a paper;
     * leave unset for anything that decides something about a learner.
     */
    effort?: 'low' | 'medium' | 'high';
    timeoutMs: number;
}

/**
 * Asks for JSON matching `schema`, and gets it or an honest failure.
 *
 * There is no "the model replied but we could not read it" outcome here — the
 * API will not return a reply that does not fit the schema. That whole branch,
 * which every caller used to carry its own version of, is gone.
 */
export async function aiJson<T>(request: AiJsonRequest): Promise<AiResult<T>> {
    if (!aiAvailable()) {
        return {
            ok: false,
            failure: {
                message: 'AI is not configured on this deployment.',
                detail: 'ANTHROPIC_API_KEY is not set.',
                retryable: false,
            },
        };
    }

    const content: AiContent[] =
        typeof request.content === 'string' ? [{ type: 'text', text: request.content }] : request.content;

    try {
        const response = await getClient().messages.create(
            {
                model: MODEL,
                max_tokens: request.maxTokens,
                system: request.system,
                messages: [{ role: 'user', content }],
                output_config: {
                    ...(request.effort ? { effort: request.effort } : {}),
                    format: { type: 'json_schema', schema: request.schema },
                },
            },
            { timeout: request.timeoutMs }
        );

        // A refusal is a real outcome, not an error: the model declined rather
        // than failed, and saying "try again" would be wrong.
        if (response.stop_reason === 'refusal') {
            return {
                ok: false,
                failure: {
                    message: 'The AI declined to answer this request.',
                    detail: 'stop_reason: refusal',
                    retryable: false,
                },
            };
        }

        // Running out of room mid-object is the one way the guarantee breaks.
        if (response.stop_reason === 'max_tokens') {
            return {
                ok: false,
                failure: {
                    message: 'The AI reply was too long to finish. Try a smaller batch or a shorter document.',
                    detail: 'stop_reason: max_tokens',
                    retryable: false,
                },
            };
        }

        const text = response.content
            .filter((block): block is Anthropic.TextBlock => block.type === 'text')
            .map((block) => block.text)
            .join('');

        if (!text.trim()) {
            return {
                ok: false,
                failure: { message: 'The AI returned an empty reply.', detail: 'no text block', retryable: true },
            };
        }

        return { ok: true, value: JSON.parse(text) as T };
    } catch (error) {
        console.error('AI call failed:', error);
        return { ok: false, failure: describe(error) };
    }
}

/** Exported for the verify script, which checks the mapping without a network call. */
export const __describeFailure = describe;
