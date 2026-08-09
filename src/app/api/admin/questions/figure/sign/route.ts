import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireAdmin } from '@/utils/auth/guards';
import { signedUploadTicket, storageUnavailableReason } from '@/utils/storage';
import { FIGURE_TYPES, MAX_FIGURE_BYTES, figureKeyForType } from '@/lib/figures';

/**
 * POST /api/admin/questions/figure/sign — permission to put one diagram in the
 * bucket.
 *
 * Step one of two, for the same reason paper uploads are split: a multipart
 * POST to a route handler dies at Vercel's ~4.5 MB body limit, and a photo of a
 * textbook page clears that. Only JSON crosses this route; the bytes go from
 * the reviewer's browser straight to R2.
 *
 * The key is minted here, never accepted. A caller who could name their own key
 * could be handed a signed PUT over any object in the bucket — which is every
 * paid PDF in the catalogue. `figureKeyForType` refuses anything but a UUID and
 * an allowed image type, and that refusal is the whole of the protection.
 *
 * Nothing is written to the question here. The upload can still fail after this
 * responds, so `image_path` is only set by the finalising POST once the object
 * has been confirmed present.
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();

        const { failure } = await requireAdmin(supabase);
        if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

        const unavailable = storageUnavailableReason();
        if (unavailable) return NextResponse.json({ error: unavailable }, { status: 503 });

        const body = await req.json().catch(() => ({}));
        const questionId = String(body?.questionId || '');
        const contentType = String(body?.contentType || '');
        const size = Number(body?.size) || 0;

        if (!questionId) {
            return NextResponse.json({ error: 'Which question?' }, { status: 400 });
        }

        if (size > MAX_FIGURE_BYTES) {
            return NextResponse.json(
                {
                    error: `That image is larger than ${Math.round(
                        MAX_FIGURE_BYTES / (1024 * 1024)
                    )} MB. Crop it to the diagram — the rest of the page is not wanted.`,
                },
                { status: 400 }
            );
        }

        const key = figureKeyForType(questionId, contentType);
        if (!key) {
            /*
             * One message for two failures, because the caller is our own
             * screen and the distinction only helps somebody probing the route.
             */
            return NextResponse.json(
                {
                    error: `A figure must be a ${Object.values(FIGURE_TYPES)
                        .join(', ')
                        .toUpperCase()} image attached to a real question.`,
                },
                { status: 400 }
            );
        }

        /*
         * The question has to exist before it gets a figure. Without this an
         * admin could park images under invented UUIDs and nothing would ever
         * clean them up — the delete path only ever runs from a question row.
         */
        const { data: question, error } = await supabase
            .from('questions')
            .select('id')
            .eq('id', questionId)
            .maybeSingle();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        if (!question) return NextResponse.json({ error: 'No such question.' }, { status: 404 });

        const ticket = await signedUploadTicket(key, contentType);
        return NextResponse.json(ticket);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not authorise the upload';
        console.error('POST /api/admin/questions/figure/sign:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
