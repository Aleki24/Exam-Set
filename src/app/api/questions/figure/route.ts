import { NextRequest, NextResponse } from 'next/server';
import { signedDownloadUrl, storageUnavailableReason } from '@/utils/storage';
import { isFigureKey } from '@/lib/figures';

/**
 * GET /api/questions/figure?key=figures/… — serve a question's diagram.
 *
 * Figures are stored beside the papers, in whichever bucket `utils/storage.ts`
 * is pointed at. That bucket is private, because a paper's PDF is the paid
 * product and must never have a public link — but a diagram is not the product.
 * It is one drawing out of forty questions, useless on its own, and a paper is
 * unanswerable without it.
 *
 * So this route stands in for making the bucket public: it signs a read on the
 * caller's behalf and streams the bytes back. One place to change if the
 * backend changes, no public URL on a bucket that also holds paid PDFs, and
 * identical behaviour on R2 and Supabase.
 *
 * The `figures/` prefix is enforced rather than trusted. Without it this route
 * would sign a read of any key in the bucket, which is every paid PDF in the
 * catalogue — a paywall bypass wearing an image URL.
 */

/** A figure does not change once uploaded, so it can be cached hard. */
const CACHE = 'public, max-age=31536000, immutable';

export async function GET(req: NextRequest) {
    try {
        const unavailable = storageUnavailableReason();
        if (unavailable) return NextResponse.json({ error: unavailable }, { status: 503 });

        const key = new URL(req.url).searchParams.get('key') || '';

        /*
         * Two checks, and both matter. The prefix keeps this route away from
         * the paid PDFs; rejecting `..` keeps a crafted key from walking out of
         * the prefix on a backend that resolves relative paths.
         */
        if (!isFigureKey(key)) {
            return NextResponse.json({ error: 'Not a figure key.' }, { status: 400 });
        }

        const url = await signedDownloadUrl(key, 300);
        const upstream = await fetch(url);

        if (!upstream.ok || !upstream.body) {
            return NextResponse.json({ error: 'That figure is not there.' }, { status: 404 });
        }

        return new NextResponse(upstream.body, {
            headers: {
                'Content-Type': upstream.headers.get('content-type') || 'image/jpeg',
                'Cache-Control': CACHE,
            },
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not read that figure';
        console.error('GET /api/questions/figure:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
