import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { signedDownloadUrl, storageUnavailableReason } from '@/utils/storage';
import { buildPreview, previewFormatFromKey } from '@/services/documentPreview';

/**
 * GET /api/papers/:id/preview — the opening pages, for people who have not paid.
 *
 * This is deliberately the one route in front of a paper that asks for no
 * entitlement and no session, because that is the whole point of it: a teacher
 * choosing between four Grade 9 Mathematics papers cannot open any of them, and
 * every site this shop competes with shows the first page. `/download` remains
 * the gate; this is the shop window.
 *
 * What keeps it a window rather than a hole is `preview_pages` on the row —
 * how much of this paper its seller decided to show. The number is read here
 * and handed to the reader as a hard limit, and the reader never parses beyond
 * it, so there is no full document in memory to leak by mistake.
 *
 * Unpublished papers are refused outright. A draft is not in the shop, so there
 * is nothing to advertise, and a preview would be a way to read a paper its
 * author has not finished deciding about.
 */

/** However generous a seller is, this is where a preview stops being one. */
const MAX_PREVIEW_PAGES = 5;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const supabase = await createClient();

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        const { data: paper, error } = await supabase
            .from('exams')
            .select('id, title, is_published, preview_pages, pdf_storage_key, pdf_url')
            .eq(isUuid ? 'id' : 'slug', id)
            .maybeSingle();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        if (!paper) return NextResponse.json({ error: 'Paper not found' }, { status: 404 });
        if (!paper.is_published) {
            return NextResponse.json({ error: 'This paper is not published' }, { status: 404 });
        }

        // A paper assembled in the setter has no file until somebody buys it and
        // `ensurePaperFile` renders one. Rendering it here would mean generating
        // a PDF on an anonymous page view, which is a free way to bill the site.
        if (!paper.pdf_storage_key) {
            return NextResponse.json(
                { pages: [], totalPages: null, unavailable: 'This paper has no file to preview yet.' },
                { headers: { 'Cache-Control': 'public, max-age=60' } }
            );
        }

        const unavailable = storageUnavailableReason();
        if (unavailable) return NextResponse.json({ error: unavailable }, { status: 503 });

        const allowed = Math.max(1, Math.min(Number(paper.preview_pages) || 1, MAX_PREVIEW_PAGES));

        const url = await signedDownloadUrl(paper.pdf_storage_key, 300);
        const res = await fetch(url);
        if (!res.ok) {
            return NextResponse.json({ error: 'Could not read the paper' }, { status: 502 });
        }
        const buffer = Buffer.from(await res.arrayBuffer());

        const preview = await buildPreview(buffer, previewFormatFromKey(paper.pdf_storage_key), allowed);

        /*
         * Cached at the edge, because the answer is the same for everyone and
         * it costs a storage read plus a parse to produce. Nothing personal is
         * in it — it is the same pages the shop shows a stranger — and a paper's
         * file does not change once it is listed.
         */
        return NextResponse.json(
            { ...preview, previewPages: allowed },
            { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800' } }
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not build a preview';
        console.error('GET /api/papers/[id]/preview error:', message);
        // A preview that fails is a missing preview, not a broken page. The
        // buy panel beside it still works.
        return NextResponse.json(
            { pages: [], totalPages: null, unavailable: 'The preview could not be built.' },
            { status: 200 }
        );
    }
}
