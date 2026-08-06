import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireAdmin } from '@/utils/auth/guards';
import { signedUploadTicket, storageUnavailableReason } from '@/utils/storage';

/**
 * 25 MB, because that is what the bucket itself enforces.
 *
 * Supabase Storage carries its own `file_size_limit` (25 MB on the `exam-papers`
 * bucket) and its own `allowed_mime_types` (PDF only). Letting this route
 * authorise more than the bucket accepts would just move the confusing failure
 * one layer down: the browser would upload happily for a minute and then be
 * refused by storage, with nothing in this app able to explain why. Raising the
 * ceiling means raising it in both places.
 *
 * It is still five times what a serverless request body allowed, which is the
 * point — a scanned past paper fits now.
 */
const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = new Set(['application/pdf']);

/**
 * POST /api/papers/upload/sign — permission to put a paper in the bucket.
 *
 * Step one of stocking the shop. The browser asks for somewhere to put the
 * file, uploads it there directly, then calls POST /api/papers/upload with the
 * keys it was given.
 *
 * Splitting it in two is what makes a real past paper uploadable at all. A
 * multipart POST to a route handler dies at Vercel's ~4.5 MB body limit, which
 * a twenty-page scan clears easily, and the failure arrives from the platform
 * with nothing to do with the app's own 25 MB rule. Nothing but JSON crosses
 * this route.
 *
 * The keys are minted here rather than accepted from the caller. A browser that
 * could name its own key could write over another seller's paper, or park a
 * file outside the prefix the finalising step trusts.
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();

        const { actor, failure } = await requireAdmin(supabase);
        if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

        const unavailable = storageUnavailableReason();
        if (unavailable) return NextResponse.json({ error: unavailable }, { status: 503 });

        const body = await req.json();
        const stem = slugify(String(body?.stem || '')) || 'paper';
        const wants: { kind: string; contentType: string; size: number }[] = Array.isArray(body?.files)
            ? body.files
            : [];

        if (wants.length === 0) {
            return NextResponse.json({ error: 'Nothing to upload' }, { status: 400 });
        }

        for (const file of wants) {
            if (!ALLOWED.has(file.contentType)) {
                return NextResponse.json({ error: 'Papers and marking schemes must be PDFs' }, { status: 400 });
            }
            if (Number(file.size) > MAX_BYTES) {
                return NextResponse.json(
                    { error: 'That file is larger than 100 MB — please compress it' },
                    { status: 400 }
                );
            }
        }

        // Namespaced by uploader and stamped with the time, so one seller can
        // never overwrite another's file by uploading a same-named paper.
        const base = `papers/${actor.id}/${Date.now()}-${stem}`;

        const tickets = await Promise.all(
            wants.map(async (file) => {
                const key = file.kind === 'scheme' ? `${base}-marking-scheme.pdf` : `${base}.pdf`;
                const ticket = await signedUploadTicket(key, file.contentType);
                return { kind: file.kind, ...ticket };
            })
        );

        return NextResponse.json({ tickets });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not authorise the upload';
        console.error('POST /api/papers/upload/sign error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

function slugify(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 120);
}
