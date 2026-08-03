import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireAdmin } from '@/utils/auth/guards';
import { deletePaper } from '@/services/paperDeletion';
import { toListing } from '@/lib/paperMapper';

/**
 * GET /api/admin/papers — the whole catalog, drafts included.
 *
 * The public listing hides unpublished rows; this is the stock list an admin
 * works from.
 */
export async function GET(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { failure } = await requireAdmin(supabase);
        if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

        const { searchParams } = new URL(req.url);
        const search = searchParams.get('search') || '';
        const state = searchParams.get('state') || 'all'; // all | published | draft

        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        let query: any = supabase
            .from('exams')
            .select('*', { count: 'exact' })
            .eq('source', 'catalog')
            .order('created_at', { ascending: false })
            .limit(200);

        if (state === 'published') query = query.eq('is_published', true);
        if (state === 'draft') query = query.eq('is_published', false);
        if (search) {
            const safe = search.replace(/[,()]/g, ' ');
            query = query.or(`title.ilike.%${safe}%,subject.ilike.%${safe}%,institution.ilike.%${safe}%`);
        }

        const { data, error, count } = await query;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        return NextResponse.json({ papers: (data || []).map(toListing), total: count ?? 0 });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * DELETE /api/admin/papers?id=… — remove a paper from the catalog.
 *
 * The rules live in services/paperDeletion, shared with the author's own delete
 * at /api/papers/:id. This route used to carry its own copy, which had drifted
 * in two ways worth naming: it left the generated PDF and marking scheme behind
 * in storage with nothing pointing at them, and it did not notice that
 * `exam_sessions` cascades — so deleting a paper somebody had sat erased their
 * answers and marks without a word.
 */
export async function DELETE(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { actor, failure } = await requireAdmin(supabase);
        if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

        const id = new URL(req.url).searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

        const result = await deletePaper(supabase, id, { id: actor.id, isAdmin: true });
        if (!result.ok) {
            return NextResponse.json({ error: result.error }, { status: result.status });
        }

        return NextResponse.json({
            message: `“${result.title}” was deleted`,
            filesRemoved: result.filesRemoved,
            warning: result.storageWarning,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
