import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireActor } from '@/utils/auth/guards';
import { deletePaper } from '@/services/paperDeletion';
import { toListing } from '@/lib/paperMapper';

/** GET /api/papers/:id — a single paper, by id or slug. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const supabase = await createClient();

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        const { data, error } = await supabase
            .from('exams')
            // The set is embedded rather than fetched separately so the detail
            // page can name the sitting in its first render, without a second
            // round trip that would land after the heading is already on screen.
            .select('*, exam_sets (id, name, slug)')
            .eq(isUuid ? 'id' : 'slug', id)
            .maybeSingle();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        if (!data) return NextResponse.json({ error: 'Paper not found' }, { status: 404 });

        const { data: auth } = await supabase.auth.getUser();
        let owned = false;
        if (auth?.user) {
            const { data: ent } = await supabase
                .from('entitlements')
                .select('id')
                .eq('user_id', auth.user.id)
                .eq('exam_id', data.id)
                .maybeSingle();
            owned = Boolean(ent) || data.created_by === auth.user.id;
        }

        // Free papers need no entitlement to read.
        if (data.price_cents === 0) owned = true;

        return NextResponse.json({ paper: { ...toListing(data), owned } });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/** PATCH /api/papers/:id — author-only edits (price, publish state, metadata). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const supabase = await createClient();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

        const body = await req.json();
        const allowed = [
            'title',
            'description',
            'price_cents',
            'is_published',
            'is_featured',
            'exam_type',
            'level_slug',
            'grade_label',
            'term_slug',
            'year',
            'paper_number',
            'time_limit',
            'institution',
            // Moving a paper between sittings, or out of one. Null is a valid
            // value here — ungrouping has to be as easy as grouping, or a paper
            // filed in the wrong set can never be got out again.
            'set_id',
            'marking_scheme_url',
            'has_marking_scheme',
            'preview_pages',
        ] as const;

        const patch: Record<string, unknown> = {};
        for (const key of allowed) {
            if (key in body) patch[key] = body[key];
        }
        if ('price_cents' in patch) {
            patch.price_cents = Math.max(0, Math.round(Number(patch.price_cents) || 0));
        }
        if (Object.keys(patch).length === 0) {
            return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
        }

        // RLS restricts updates to the author; the explicit filter makes the
        // intent obvious and returns a clean 404 rather than an empty success.
        const { data, error } = await supabase
            .from('exams')
            .update(patch)
            .eq('id', id)
            .eq('created_by', auth.user.id)
            .select()
            .maybeSingle();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        if (!data) return NextResponse.json({ error: 'Paper not found or not yours' }, { status: 404 });

        return NextResponse.json({ paper: toListing(data) });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * DELETE /api/papers/:id — remove a paper.
 *
 * The author's own door into deletion; the admin catalog has its own and both
 * go through the same rules in services/paperDeletion. Until this existed a
 * paper set in the setter and saved to a library could be created and edited
 * but never removed.
 *
 * The id must be a uuid here. GET accepts a slug because a slug is what a link
 * carries, but nothing should be deleted by a name that could be reassigned.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const supabase = await createClient();

        const { actor, failure } = await requireActor(supabase);
        if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        if (!isUuid) {
            return NextResponse.json({ error: 'Delete a paper by its id, not its slug' }, { status: 400 });
        }

        const result = await deletePaper(supabase, id, { id: actor.id, isAdmin: actor.isAdmin });
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
