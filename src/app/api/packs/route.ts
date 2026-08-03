import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { requireUser } from '@/utils/auth/guards';
import { signedDownloadUrl, storageUnavailableReason } from '@/utils/storage';
import { ensurePaperFile, paperFilename } from '@/services/paperFiles';

/**
 * DOWNLOAD PACK — a term's worth of material in one action.
 *
 * POST /api/packs  { exam_ids: [...], asset?: 'paper' | 'scheme' | 'both' }
 *
 * WHY A LIST OF LINKS AND NOT A ZIP
 *
 * A zip was the obvious shape and it is the wrong one here. Building it means
 * pulling every PDF into memory in a serverless function — twelve 20 MB papers
 * is 240 MB before compression, which is over the limit on most plans and
 * unpredictable on all of them. And on the connection this product is actually
 * used over, a single 200 MB download that fails at 90% has to start again from
 * nothing.
 *
 * Independent signed URLs cost the server almost nothing, resume individually,
 * and let the client space them out. On a Nairobi 4G connection that is the
 * difference between a pack that arrives and a pack that is retried all
 * evening. The client can still present it as one action — see /teach.
 *
 * ENTITLEMENT IS CHECKED PER RESOURCE, NOT PER REQUEST
 *
 * Every id goes through the same `can_download_paper` gate the single-file
 * route uses. A pack is a convenience wrapped around that check, never a way
 * around it: asking for forty ids returns links only for the ones the caller
 * may actually have, and says plainly which were refused.
 */

const MAX_ITEMS = 40;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PackItem {
    examId: string;
    title: string;
    asset: 'paper' | 'scheme';
    filename: string;
    url: string;
}

interface PackRefusal {
    examId: string;
    title?: string;
    reason: string;
}

export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const { user, failure } = await requireUser(supabase);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 });
    }

    const ids = Array.isArray(body.exam_ids)
        ? [...new Set(body.exam_ids.filter((v): v is string => typeof v === 'string' && UUID.test(v)))].slice(
              0,
              MAX_ITEMS
          )
        : [];

    if (ids.length === 0) {
        return NextResponse.json({ error: 'Choose at least one resource' }, { status: 400 });
    }

    const want = body.asset === 'scheme' ? 'scheme' : body.asset === 'both' ? 'both' : 'paper';

    const unavailable = storageUnavailableReason();
    if (unavailable) {
        console.error('Pack blocked:', unavailable);
        return NextResponse.json({ error: 'Downloads are not available yet.' }, { status: 503 });
    }

    /*
     * Typed loosely on purpose. The generated Supabase types cannot narrow a
     * select list assembled as a string, so without this the rows come back as
     * an error union and every field access fails to compile. The shape is
     * guarded by the checks below rather than by the type.
     */
    const { data: papers, error } = await (supabase as any)
        .from('exams')
        .select(
            'id, title, subject, grade_label, exam_type, term_slug, year, time_limit, institution, ' +
                'total_marks, question_ids, price_cents, created_by, is_published, source, ' +
                'pdf_storage_key, pdf_url, marking_scheme_storage_key, marking_scheme_url, has_marking_scheme'
        )
        .in('id', ids);

    if (error) {
        console.error('POST /api/packs failed:', error.message);
        return NextResponse.json({ error: 'Could not build the pack' }, { status: 500 });
    }

    const admin = createAdminClient();
    const items: PackItem[] = [];
    const refused: PackRefusal[] = [];

    for (const id of ids) {
        const paper = (papers ?? []).find((p: any) => p.id === id);
        if (!paper) {
            refused.push({ examId: id, reason: 'No longer available' });
            continue;
        }

        // The same gate as the single-file route, asked once per resource.
        // Never fail open: a gate that cannot be evaluated is a closed gate.
        let entitled = paper.price_cents === 0 || paper.created_by === user.id;
        if (!entitled) {
            const { data: allowed, error: gateError } = await supabase.rpc('can_download_paper', {
                p_exam_id: id,
                p_user_id: user.id,
            });
            if (gateError) {
                console.error('can_download_paper failed in pack:', gateError.message);
                refused.push({ examId: id, title: paper.title, reason: 'Could not verify access' });
                continue;
            }
            entitled = Boolean(allowed);
        }

        if (!entitled) {
            refused.push({ examId: id, title: paper.title, reason: 'Not purchased' });
            continue;
        }

        const assets: ('paper' | 'scheme')[] =
            want === 'both' ? ['paper', 'scheme'] : [want as 'paper' | 'scheme'];

        for (const asset of assets) {
            if (asset === 'scheme' && !paper.has_marking_scheme) continue;

            const file = await ensurePaperFile(admin ?? supabase, paper, asset);
            if (file.error || (!file.storageKey && !file.directUrl)) {
                refused.push({
                    examId: id,
                    title: paper.title,
                    reason: file.error ?? 'No file attached',
                });
                continue;
            }

            // Longer than the fifteen minutes a single download gets: a pack of
            // twelve on a slow connection is genuinely still downloading after
            // fifteen, and a link that dies mid-pack is the failure this whole
            // shape exists to avoid. Still short enough that a leaked link is
            // worth little.
            const url = file.storageKey
                ? await signedDownloadUrl(file.storageKey, 3600)
                : (file.directUrl as string);

            items.push({
                examId: id,
                title: paper.title,
                asset,
                filename: paperFilename(paper, asset),
                url,
            });
        }

        void supabase.rpc('increment_paper_download', { p_exam_id: id }).then(
            () => undefined,
            () => undefined
        );
    }

    return NextResponse.json({
        items,
        refused,
        // Said explicitly so the client never has to infer a partial result from
        // two array lengths.
        complete: refused.length === 0,
        expiresInSeconds: 3600,
    });
}
