import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { requireAdmin } from '@/utils/auth/guards';

/**
 * The review queue — what a person decides before a machine's work is sold.
 *
 * Approving is the only thing standing between generated content and a teacher
 * who paid for it, so the screen this feeds is built to be read rather than
 * clicked through: the whole question, its marking scheme, and its marks, in
 * one place. A queue that is faster to approve than to read is not a review.
 */

const PAGE = 25;

export async function GET(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { failure } = await requireAdmin(supabase);
        if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

        const params = new URL(req.url).searchParams;
        const status = params.get('status') || 'pending';
        const offset = Math.max(0, Number(params.get('offset')) || 0);

        // Admins read through their own session, not the service role: the policy
        // added in 041 already lets staff see every row, so borrowing a key that
        // bypasses row level security would buy nothing and lose the audit trail.
        const { data, error, count } = await supabase
            .from('questions')
            .select(
                'id, text, marks, marking_scheme, topic, subtopic, type, difficulty, options, is_ai_generated, created_at, review_status, subject_id, grade_id',
                { count: 'exact' }
            )
            .eq('review_status', status)
            .order('created_at', { ascending: true })
            .range(offset, offset + PAGE - 1);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        const [{ data: subjects }, { data: grades }] = await Promise.all([
            supabase.from('subjects').select('id, name'),
            supabase.from('grades').select('id, name'),
        ]);

        const subjectName = new Map((subjects ?? []).map((s) => [s.id, s.name]));
        const gradeName = new Map((grades ?? []).map((g) => [g.id, g.name]));

        return NextResponse.json({
            questions: (data ?? []).map((q) => ({
                ...q,
                subject: subjectName.get(q.subject_id) ?? null,
                grade: gradeName.get(q.grade_id) ?? null,
            })),
            total: count ?? 0,
            hasMore: offset + (data?.length ?? 0) < (count ?? 0),
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        console.error('GET src/app/api/admin/questions/review/route.ts:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * POST — approve or reject, one or many.
 *
 * Bulk is offered because the queue arrives in batches from one generation run
 * and a reviewer who has read ten similar questions should not click ten times.
 * It is deliberately not the default, and the screen makes you select rows
 * before it appears.
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { actor, failure } = await requireAdmin(supabase);
        if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

        const admin = createAdminClient();
        if (!admin) return NextResponse.json({ error: 'Server is not configured for this.' }, { status: 503 });

        const body = await req.json().catch(() => ({}));
        const ids: string[] = Array.isArray(body?.ids) ? body.ids.map(String) : [];
        const decision = String(body?.decision || '');

        if (ids.length === 0) return NextResponse.json({ error: 'Nothing selected.' }, { status: 400 });
        if (!['approved', 'rejected', 'pending'].includes(decision)) {
            return NextResponse.json({ error: 'decision must be approved, rejected or pending.' }, { status: 400 });
        }

        /*
         * Approving a question with no marking scheme would put the exact document
         * this queue exists to prevent back into the shop — one that prints "No
         * marking scheme recorded for this question" onto something somebody paid
         * for. Refused here rather than trusted to the screen, because the screen
         * is not the only thing that can call this.
         */
        if (decision === 'approved') {
            const { data: offenders } = await admin
                .from('questions')
                .select('id')
                .in('id', ids)
                .or('marking_scheme.is.null,marking_scheme.eq.');

            if (offenders && offenders.length > 0) {
                return NextResponse.json(
                    {
                        error:
                            `${offenders.length} of those have no marking scheme. ` +
                            'Add one before approving — a question with no answer cannot be sold.',
                        blocked: offenders.map((o) => o.id),
                    },
                    { status: 422 }
                );
            }
        }

        const { error } = await admin
            .from('questions')
            .update({
                review_status: decision,
                reviewed_by: actor.id,
                reviewed_at: new Date().toISOString(),
            })
            .in('id', ids);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true, updated: ids.length, decision });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        console.error('POST src/app/api/admin/questions/review/route.ts:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/** PATCH — fix a question in place, so a near miss is corrected rather than binned. */
export async function PATCH(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { failure } = await requireAdmin(supabase);
        if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

        const admin = createAdminClient();
        if (!admin) return NextResponse.json({ error: 'Server is not configured for this.' }, { status: 503 });

        const body = await req.json().catch(() => ({}));
        const id = String(body?.id || '');
        if (!id) return NextResponse.json({ error: 'Which question?' }, { status: 400 });

        const patch: Record<string, unknown> = {};
        if (typeof body.text === 'string') patch.text = body.text.trim();
        if (typeof body.marking_scheme === 'string') patch.marking_scheme = body.marking_scheme.trim();
        if (Number.isFinite(Number(body.marks))) patch.marks = Math.round(Number(body.marks));
        if (typeof body.topic === 'string') patch.topic = body.topic.trim();

        if (Object.keys(patch).length === 0) {
            return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
        }

        const { error } = await admin.from('questions').update(patch).eq('id', id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        console.error('PATCH src/app/api/admin/questions/review/route.ts:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
