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
    const { actor, failure } = await requireUser(supabase);
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
            created_by: actor.id,
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
