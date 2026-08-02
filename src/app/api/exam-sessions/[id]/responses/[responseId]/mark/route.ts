import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireUser } from '@/utils/auth/guards';
import { selfMark } from '@/services/sessionMarker';

/**
 * PATCH /api/exam-sessions/:id/responses/:responseId/mark
 *
 * A learner disagreeing with a mark and setting their own.
 *
 * Allowing this at all is a deliberate choice. Rubric-conditioned AI marking
 * agrees with human examiners most of the time, not all of it, and a mark
 * presented as final on work the learner knows it got wrong is how somebody
 * stops trusting the diagnostics altogether — at which point the weakest-topic
 * list, which is the entire product, becomes something they scroll past.
 *
 * The mark is recorded as `self` everywhere it appears, so nothing later
 * mistakes it for an examiner's view. There is nothing to game: the marks that
 * decide anything are KNEC's, and these were never those.
 *
 * Ownership is not re-checked here. Row level security on `exam_responses`
 * already restricts writes to responses belonging to the caller's own sessions,
 * and repeating the rule in this file would suggest the safety lives here.
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; responseId: string }> }
) {
    const { responseId } = await params;

    const supabase = await createClient();
    const { failure } = await requireUser(supabase);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 });
    }

    const marks = Number(body.marks_awarded);
    if (!Number.isFinite(marks)) {
        return NextResponse.json({ error: 'Give a mark' }, { status: 400 });
    }

    const result = await selfMark(supabase, responseId, marks);
    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
}
