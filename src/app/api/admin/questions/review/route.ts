import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { adminClientMissingMessage, createAdminClient } from '@/utils/supabase/admin';
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

        /*
         * NARROWING THE QUEUE
         *
         * Status alone stopped being a filter once the queue passed a few dozen.
         * A reviewer is one person with one subject in their head: a maths
         * teacher clearing maths is fast and accurate, and the same person
         * bounced between Kiswahili poetry and circle theorems is neither. With
         * 382 questions and one dropdown, the only workable strategy was to
         * start at the top and keep going, which is why a queue like this
         * quietly stops being worked at all.
         *
         * `missing_scheme` is here for the specific backlog it names: 203
         * questions blocked on one field. Nothing could be selected on that
         * basis before, so the cheapest stock in the bank was also the hardest
         * to find.
         */
        const subjectId = params.get('subject') || '';
        const gradeId = params.get('grade') || '';
        const topic = (params.get('topic') || '').trim();
        const search = (params.get('q') || '').trim();
        const missingScheme = params.get('missing_scheme') === '1';

        // Admins read through their own session, not the service role: the policy
        // added in 041 already lets staff see every row, so borrowing a key that
        // bypasses row level security would buy nothing and lose the audit trail.
        let query = supabase
            .from('questions')
            .select(
                'id, text, marks, marking_scheme, topic, subtopic, type, difficulty, options, is_ai_generated, created_at, review_status, subject_id, grade_id, image_path, image_caption, image_required',
                { count: 'exact' }
            )
            .eq('review_status', status);

        if (subjectId) query = query.eq('subject_id', subjectId);
        if (gradeId) query = query.eq('grade_id', gradeId);
        if (topic) query = query.eq('topic', topic);
        // `is` rather than `eq`, and both cases: a scheme that was saved as an
        // empty string is just as unapprovable as one that was never written.
        if (missingScheme) query = query.or('marking_scheme.is.null,marking_scheme.eq.');
        if (search) {
            // Escaped so a comma or parenthesis in the search box cannot break
            // out of PostgREST's filter syntax and change the query.
            const safe = search.replace(/[,()\\]/g, ' ');
            query = query.or(`text.ilike.%${safe}%,topic.ilike.%${safe}%,subtopic.ilike.%${safe}%`);
        }

        const { data, error, count } = await query
            .order('created_at', { ascending: true })
            .range(offset, offset + PAGE - 1);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        const [{ data: subjects }, { data: grades }] = await Promise.all([
            supabase.from('subjects').select('id, name'),
            supabase.from('grades').select('id, name'),
        ]);

        const subjectName = new Map((subjects ?? []).map((s) => [s.id, s.name]));
        const gradeName = new Map((grades ?? []).map((g) => [g.id, g.name]));

        /*
         * The filter options are built from what is actually in this queue, not
         * from the whole catalogue. Offering all 60 subjects when 9 of them hold
         * every pending question makes the reviewer hunt for the ones that
         * matter, and a dropdown entry that returns nothing is a dead end the
         * screen invited them to walk into.
         *
         * Counted over the status only, so the numbers do not shift as the other
         * filters are applied — a facet that re-counts itself cannot be used to
         * navigate.
         */
        const { data: facetRows } = await supabase
            .from('questions')
            .select('subject_id, grade_id, topic, marking_scheme')
            .eq('review_status', status);

        const tallyBy = (key: 'subject_id' | 'grade_id' | 'topic') => {
            const counts = new Map<string, number>();
            for (const row of facetRows ?? []) {
                const value = row[key];
                if (!value) continue;
                counts.set(String(value), (counts.get(String(value)) ?? 0) + 1);
            }
            return counts;
        };

        const bySubject = tallyBy('subject_id');
        const byGrade = tallyBy('grade_id');
        const byTopic = tallyBy('topic');

        const missingSchemeCount = (facetRows ?? []).filter(
            (r) => !r.marking_scheme || !String(r.marking_scheme).trim()
        ).length;

        return NextResponse.json({
            questions: (data ?? []).map((q) => ({
                ...q,
                subject: subjectName.get(q.subject_id) ?? null,
                grade: gradeName.get(q.grade_id) ?? null,
            })),
            total: count ?? 0,
            hasMore: offset + (data?.length ?? 0) < (count ?? 0),
            facets: {
                subjects: [...bySubject.entries()]
                    .map(([id, n]) => ({ id, name: subjectName.get(id) ?? 'Unknown', count: n }))
                    .sort((a, b) => b.count - a.count),
                grades: [...byGrade.entries()]
                    .map(([id, n]) => ({ id, name: gradeName.get(id) ?? 'Unknown', count: n }))
                    .sort((a, b) => b.count - a.count),
                topics: [...byTopic.entries()]
                    .map(([name, n]) => ({ name, count: n }))
                    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
                missingScheme: missingSchemeCount,
                statusTotal: (facetRows ?? []).length,
            },
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
        if (!admin) return NextResponse.json({ error: adminClientMissingMessage() }, { status: 503 });

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
        if (!admin) return NextResponse.json({ error: adminClientMissingMessage() }, { status: 503 });

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
