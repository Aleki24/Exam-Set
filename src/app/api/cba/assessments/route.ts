import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireUser } from '@/utils/auth/guards';

/**
 * ASSESSMENTS
 *
 * GET  /api/cba/assessments?class=…   what has been set for a class
 * POST /api/cba/assessments           set one up
 *
 * Row level security restricts every row to the teacher who created it, so
 * nothing here filters by owner.
 */

const MAX_OUTCOMES = 30;

export async function GET(req: NextRequest) {
    const supabase = await createClient();
    const { failure } = await requireUser(supabase);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    const classId = new URL(req.url).searchParams.get('class');

    let query = supabase
        .from('cba_assessments')
        .select('id, class_id, title, outcomes, due_on, submitted_at, created_at')
        .order('created_at', { ascending: false });

    if (classId) query = query.eq('class_id', classId);

    const { data, error } = await query;

    if (error) {
        console.error('GET /api/cba/assessments failed:', error.message);
        return NextResponse.json({ error: 'Could not load assessments' }, { status: 500 });
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    return NextResponse.json({
        assessments: (data ?? []).map((a: any) => ({
            id: a.id,
            classId: a.class_id,
            title: a.title,
            outcomes: Array.isArray(a.outcomes) ? a.outcomes : [],
            dueOn: a.due_on,
            submittedAt: a.submitted_at,
        })),
    });
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

    const classId = typeof body.class_id === 'string' ? body.class_id : '';
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 160) : '';

    if (!classId) return NextResponse.json({ error: 'Which class?' }, { status: 400 });
    if (!title) return NextResponse.json({ error: 'Name the assessment' }, { status: 400 });

    /*
     * Outcomes come in as one per line, the same way the register does.
     *
     * Each gets a short stable id, because the id is the key every score is
     * filed under — including scores already sitting on a phone. Deriving it
     * from the title would mean a teacher fixing a typo in an outcome silently
     * orphaning every score against it.
     */
    const rawOutcomes = typeof body.outcomes === 'string' ? body.outcomes.split('\n') : [];
    const outcomes = rawOutcomes
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, MAX_OUTCOMES)
        .map((line, index) => ({
            id: `o${index + 1}`,
            title: line.slice(0, 200),
        }));

    if (outcomes.length === 0) {
        return NextResponse.json(
            { error: 'Add at least one thing to assess, one per line' },
            { status: 400 }
        );
    }

    const dueOn =
        typeof body.due_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.due_on)
            ? body.due_on
            : null;

    const { data, error } = await supabase
        .from('cba_assessments')
        .insert({
            class_id: classId,
            created_by: user.id,
            title,
            outcomes,
            due_on: dueOn,
        })
        .select('id, class_id, title, outcomes, due_on')
        .single();

    if (error) {
        // A class id belonging to somebody else fails the RLS check rather than
        // being found and refused, which is the correct shape: it is
        // indistinguishable from a class that does not exist.
        console.error('POST /api/cba/assessments failed:', error.message);
        return NextResponse.json({ error: 'Could not create the assessment' }, { status: 500 });
    }

    return NextResponse.json({ assessment: data }, { status: 201 });
}

/**
 * PATCH /api/cba/assessments — correct an assessment, or mark it submitted.
 *
 * `submitted_at` had no writer at all until now: the column existed, the API
 * returned it and the UI read it, but nothing ever set it, so an assessment
 * could never be finished. It is also the flag that decides whether this and
 * its class may be deleted, so a guard that nothing could ever trip was not
 * much of a guard.
 *
 * Editing the outcomes is deliberately narrow. Every score is filed under an
 * outcome id, so the ids are preserved by position and only the wording
 * changes — a teacher fixing a typo must not silently orphan a term of
 * scoring. Adding outcomes is allowed; removing one that has been scored is
 * not.
 */
export async function PATCH(req: NextRequest) {
    const supabase = await createClient();
    const { failure } = await requireUser(supabase);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 });
    }

    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) return NextResponse.json({ error: 'Which assessment?' }, { status: 400 });

    const { data: existing } = await supabase
        .from('cba_assessments')
        .select('id, outcomes, submitted_at')
        .eq('id', id)
        .maybeSingle();

    if (!existing) return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });

    const patch: Record<string, unknown> = {};

    if (typeof body.title === 'string') {
        const title = body.title.trim().slice(0, 160);
        if (!title) return NextResponse.json({ error: 'Name the assessment' }, { status: 400 });
        patch.title = title;
    }

    if ('due_on' in body) {
        patch.due_on =
            typeof body.due_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.due_on)
                ? body.due_on
                : null;
    }

    if ('submitted' in body) {
        patch.submitted_at = body.submitted ? new Date().toISOString() : null;
    }

    if (typeof body.outcomes === 'string') {
        const current = Array.isArray(existing.outcomes) ? existing.outcomes : [];
        const lines = body.outcomes
            .split('\n')
            .map((line: string) => line.trim())
            .filter(Boolean)
            .slice(0, MAX_OUTCOMES);

        if (lines.length === 0) {
            return NextResponse.json(
                { error: 'Add at least one thing to assess, one per line' },
                { status: 400 }
            );
        }

        // Ids are held by position so existing scores keep pointing at the
        // outcome they were given for.
        const next = lines.map((line: string, index: number) => ({
            id: current[index]?.id ?? `o${index + 1}`,
            title: line.slice(0, 200),
        }));

        const dropped = current
            .slice(next.length)
            .map((o: { id: string }) => o.id)
            .filter(Boolean);

        if (dropped.length > 0) {
            const { data: scored } = await supabase
                .from('cba_scores')
                .select('id')
                .eq('assessment_id', id)
                .in('outcome_id', dropped)
                .limit(1);

            if (scored && scored.length > 0) {
                return NextResponse.json(
                    {
                        error: `You have already scored learners against ${
                            dropped.length === 1 ? 'the outcome' : 'outcomes'
                        } you are removing. Rewording is fine; removing a scored outcome would delete those marks.`,
                    },
                    { status: 409 }
                );
            }
        }

        patch.outcomes = next;
    }

    if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });
    }

    const { data, error } = await supabase
        .from('cba_assessments')
        .update(patch)
        .eq('id', id)
        .select('id, class_id, title, outcomes, due_on, submitted_at')
        .maybeSingle();

    if (error) {
        console.error('PATCH /api/cba/assessments failed:', error.message);
        return NextResponse.json({ error: 'Could not update the assessment' }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });

    return NextResponse.json({ assessment: data });
}

/**
 * DELETE /api/cba/assessments?id=… — remove an assessment and its scores.
 *
 * `cba_scores` cascades, so this takes the scoring with it. That is the point
 * of the operation and it is all the same teacher's work — but a submitted
 * assessment is not, because the evidence behind a submitted score has to be
 * retained. Unsubmit it first if it really is going.
 */
export async function DELETE(req: NextRequest) {
    const supabase = await createClient();
    const { failure } = await requireUser(supabase);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Which assessment?' }, { status: 400 });

    const { data: assessment } = await supabase
        .from('cba_assessments')
        .select('id, title, submitted_at')
        .eq('id', id)
        .maybeSingle();

    if (!assessment) return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });

    if (assessment.submitted_at) {
        return NextResponse.json(
            {
                error: 'This assessment has been submitted, and the evidence behind a submitted score has to be kept. Mark it unsubmitted first if it really is going.',
            },
            { status: 409 }
        );
    }

    const { count } = await supabase
        .from('cba_scores')
        .select('id', { count: 'exact', head: true })
        .eq('assessment_id', id);

    const { error } = await supabase.from('cba_assessments').delete().eq('id', id);
    if (error) {
        console.error('DELETE /api/cba/assessments failed:', error.message);
        return NextResponse.json({ error: 'Could not delete the assessment' }, { status: 500 });
    }

    return NextResponse.json({
        message: `“${assessment.title}” was deleted`,
        removed: { scores: count ?? 0 },
    });
}
