import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { presentedKey, resolveKey } from '@/lib/ingestKeys';
import { figureKeyForType, isQuestionId, FIGURE_TYPES } from '@/lib/figures';
import { objectInfo, putObject, storageUnavailableReason } from '@/utils/storage';
import { imageSize } from '@/services/imageSize';

/**
 * POST /api/ingest/figures — a program attaches a diagram to a question.
 *
 * The companion to `/api/ingest/questions`, and the reason it exists is the
 * same: a third of a Kenyan science or maths paper is unanswerable as text, the
 * extractor takes the words and leaves the picture, and until now putting the
 * picture back meant a person opening /admin/review and dragging a file in for
 * every single question. That does not scale to a catalogue.
 *
 * WHY THE BYTES COME THROUGH THIS ROUTE RATHER THAN STRAIGHT TO THE BUCKET
 *
 * The browser upload in /admin/review is handed a presigned URL and writes to
 * R2 directly, because a multipart POST to a route handler dies at Vercel's
 * ~4.5 MB body limit. A program has the opposite problem: presigning is a
 * second round trip to a second host, and a caller behind a network policy
 * that allows this app may well not be allowed to reach the storage endpoint.
 * So this one takes base64 inline and does the upload server-side.
 *
 * That reintroduces the body limit, which is why `MAX_BYTES` is well under it
 * rather than matching the 4 MB the browser path allows. base64 adds a third,
 * so 3 MB of image is 4 MB of request — about as close to the platform ceiling
 * as is safe. A figure is a crop of one diagram out of a scanned page; the
 * ones this was built for are tens of kilobytes.
 *
 * NOTHING HERE BYPASSES REVIEW
 *
 * Attaching a figure does not approve a question, and cannot: `review_status`
 * is never written by this route. A key that can add a picture cannot put it
 * in front of a buyer.
 */

export const maxDuration = 60;

/** 3 MB of image, which is 4 MB of base64 — under Vercel's request ceiling. */
const MAX_BYTES = 3 * 1024 * 1024;

export async function POST(req: NextRequest) {
    try {
        const admin = createAdminClient();
        if (!admin) {
            return NextResponse.json({ error: 'Ingest is not configured on this deployment.' }, { status: 503 });
        }

        const presented = presentedKey(req.headers);
        if (!presented) {
            return NextResponse.json(
                { error: 'Missing ingest key. Send it as `Authorization: Bearer <key>`.' },
                { status: 401 }
            );
        }

        const owner = await resolveKey(admin, presented);
        if (!owner) {
            return NextResponse.json({ error: 'That ingest key is not valid or has been revoked.' }, { status: 401 });
        }

        const unavailable = storageUnavailableReason();
        if (unavailable) return NextResponse.json({ error: unavailable }, { status: 503 });

        const body = await req.json().catch(() => ({}));
        const questionId = String(body?.questionId || '');
        const contentType = String(body?.contentType || '');
        const caption = typeof body?.caption === 'string' ? body.caption.trim() : null;
        const required = typeof body?.required === 'boolean' ? body.required : undefined;

        if (!isQuestionId(questionId)) {
            return NextResponse.json({ error: 'questionId must be a question UUID.' }, { status: 400 });
        }

        /*
         * The key is minted from a validated content type and a UUID, never
         * taken from the caller. A caller who could name their own key would be
         * writing anywhere in a bucket that holds every paid PDF in the
         * catalogue.
         */
        const key = figureKeyForType(questionId, contentType);
        if (!key) {
            return NextResponse.json(
                { error: `contentType must be one of ${Object.keys(FIGURE_TYPES).join(', ')}.` },
                { status: 400 }
            );
        }

        const base64 = String(body?.dataBase64 || '').replace(/^data:[^;]+;base64,/, '');
        if (!base64) {
            return NextResponse.json({ error: 'dataBase64 is required.' }, { status: 400 });
        }

        let bytes: Buffer;
        try {
            bytes = Buffer.from(base64, 'base64');
        } catch {
            return NextResponse.json({ error: 'dataBase64 is not valid base64.' }, { status: 400 });
        }

        if (bytes.length === 0) {
            return NextResponse.json({ error: 'That image is empty.' }, { status: 400 });
        }
        if (bytes.length > MAX_BYTES) {
            return NextResponse.json(
                {
                    error: `That image is ${(bytes.length / 1024 / 1024).toFixed(1)} MB. The limit here is ${
                        MAX_BYTES / 1024 / 1024
                    } MB — crop it to the diagram.`,
                },
                { status: 413 }
            );
        }

        /*
         * The bytes have to BE an image of the type claimed. `imageSize` reads
         * the format's own header, so a PDF renamed to image/jpeg is refused
         * here rather than discovered by the renderer, which would silently
         * skip it and print the question with a hole where the graph was.
         */
        const size = imageSize(new Uint8Array(bytes));
        if (!size || size.width < 1 || size.height < 1) {
            return NextResponse.json(
                { error: 'Those bytes are not a readable JPEG, PNG or WebP.' },
                { status: 400 }
            );
        }

        const { data: question, error: readError } = await admin
            .from('questions')
            .select('id')
            .eq('id', questionId)
            .maybeSingle();

        if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
        if (!question) return NextResponse.json({ error: 'No such question.' }, { status: 404 });

        await putObject(key, bytes, contentType.toLowerCase().trim());

        // Confirmed present before the row is touched, for the same reason the
        // browser path does it: a question pointing at nothing prints a blank
        // box into something somebody bought.
        const stored = await objectInfo(key);
        if (!stored) {
            return NextResponse.json(
                { error: 'The upload did not land in the bucket. Nothing was changed.' },
                { status: 502 }
            );
        }

        const patch: Record<string, unknown> = { image_path: key };
        if (caption !== null) patch.image_caption = caption || null;
        if (required !== undefined) patch.image_required = required;

        const { error } = await admin.from('questions').update(patch).eq('id', questionId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        return NextResponse.json({
            ok: true,
            key,
            bytes: stored.size,
            width: size.width,
            height: size.height,
            by: owner.name,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not attach that figure';
        console.error('POST /api/ingest/figures:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
