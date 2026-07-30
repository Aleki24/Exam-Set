import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { signedDownloadUrl, storageUnavailableReason } from '@/utils/storage';

/**
 * GET /api/papers/:id/download?asset=paper|scheme
 *
 * The single gate in front of paid content. A signed URL is only ever minted
 * when the caller is entitled: they bought it, they wrote it, or it is free.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const asset = new URL(req.url).searchParams.get('asset') === 'scheme' ? 'scheme' : 'paper';
        const supabase = await createClient();

        const { data: paper, error } = await supabase
            .from('exams')
            .select(
                'id, title, price_cents, created_by, is_published, source, pdf_storage_key, pdf_url, marking_scheme_storage_key, marking_scheme_url, has_marking_scheme'
            )
            .eq('id', id)
            .maybeSingle();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        if (!paper) return NextResponse.json({ error: 'Paper not found' }, { status: 404 });

        const { data: auth } = await supabase.auth.getUser();
        const userId = auth?.user?.id;

        const isFree = paper.price_cents === 0;
        const isAuthor = Boolean(userId) && paper.created_by === userId;

        let entitled = isFree || isAuthor;
        if (!entitled && userId) {
            const { data: ent } = await supabase
                .from('entitlements')
                .select('id')
                .eq('user_id', userId)
                .eq('exam_id', id)
                .maybeSingle();
            entitled = Boolean(ent);
        }

        if (!entitled) {
            return NextResponse.json(
                { error: 'This paper has not been purchased', requiresPurchase: true },
                { status: 402 }
            );
        }

        // Free papers still need a signed-in user so downloads can be counted
        // against an account rather than an anonymous flood.
        if (!userId) {
            return NextResponse.json({ error: 'Sign in to download', requiresAuth: true }, { status: 401 });
        }

        const storageKey = asset === 'scheme' ? paper.marking_scheme_storage_key : paper.pdf_storage_key;
        const directUrl = asset === 'scheme' ? paper.marking_scheme_url : paper.pdf_url;

        if (asset === 'scheme' && !paper.has_marking_scheme) {
            return NextResponse.json({ error: 'No marking scheme for this paper' }, { status: 404 });
        }

        let url: string | null = null;
        if (storageKey) {
            const unavailable = storageUnavailableReason();
            if (unavailable) {
                console.error('download blocked:', unavailable);
                return NextResponse.json(
                    { error: 'Downloads are not available yet — file storage is not configured.' },
                    { status: 503 }
                );
            }
            // 15 minutes is long enough to start a download, short enough that a
            // leaked link is worthless.
            url = await signedDownloadUrl(storageKey, 900);
        } else if (directUrl) {
            url = directUrl;
        }

        if (!url) {
            return NextResponse.json({ error: 'This paper has no file attached yet' }, { status: 404 });
        }

        // Fire-and-forget counter; a failed increment must not block a download.
        const { error: countError } = await supabase.rpc('increment_paper_download', { p_exam_id: id });
        if (countError) console.warn('download counter failed:', countError.message);

        return NextResponse.json({ url, asset, title: paper.title });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        console.error('download route error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
