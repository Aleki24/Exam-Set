import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { signedDownloadUrl, storageUnavailableReason } from '@/utils/storage';
import { createAdminClient } from '@/utils/supabase/admin';
import { ensurePaperFile, paperFilename } from '@/services/paperFiles';

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
                'id, title, subject, grade_label, exam_type, term_slug, year, time_limit, institution, total_marks, question_ids, price_cents, created_by, is_published, source, pdf_storage_key, pdf_url, marking_scheme_storage_key, marking_scheme_url, has_marking_scheme'
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
            // One question, answered in the database: bought it, wrote it, it is
            // free, or a live subscription covers it. Asking SQL rather than
            // assembling the answer here means the paywall cannot drift apart
            // between this route and any other that releases a file.
            const { data: allowed, error: gateError } = await supabase.rpc('can_download_paper', {
                p_exam_id: id,
                p_user_id: userId,
            });

            if (gateError) {
                // Never fail open. A gate that cannot be evaluated is a closed gate.
                console.error('can_download_paper failed:', gateError.message);
                return NextResponse.json({ error: 'Could not verify access. Please try again.' }, { status: 503 });
            }
            entitled = Boolean(allowed);
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

        if (asset === 'scheme' && !paper.has_marking_scheme) {
            return NextResponse.json({ error: 'No marking scheme for this paper' }, { status: 404 });
        }

        // A paper built in the setter is a list of questions, not a file, so it
        // gets rendered on first request and stored. Needs the service role: the
        // buyer is not the author, and recording the generated key is a
        // privileged write.
        const admin = createAdminClient();
        const file = await ensurePaperFile(admin ?? supabase, paper, asset);

        if (file.error) {
            return NextResponse.json({ error: file.error }, { status: 404 });
        }

        // Fire-and-forget counter; a failed increment must not block a download.
        const { error: countError } = await supabase.rpc('increment_paper_download', { p_exam_id: id });
        if (countError) console.warn('download counter failed:', countError.message);

        // Storage is not configured, so the freshly rendered bytes are streamed
        // instead. Slower and uncached, but somebody who paid still gets their
        // paper.
        if (file.buffer) {
            return new NextResponse(new Uint8Array(file.buffer), {
                headers: {
                    'Content-Type': 'application/pdf',
                    'Content-Disposition': `attachment; filename="${paperFilename(paper, asset)}"`,
                    'Cache-Control': 'private, no-store',
                },
            });
        }

        let url: string | null = file.directUrl ?? null;
        if (file.storageKey) {
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
            url = await signedDownloadUrl(file.storageKey, 900);
        }

        if (!url) {
            return NextResponse.json({ error: 'This paper has no file attached yet' }, { status: 404 });
        }

        return NextResponse.json({ url, asset, title: paper.title });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        console.error('download route error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
