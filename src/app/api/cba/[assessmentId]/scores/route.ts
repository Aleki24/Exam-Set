import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireUser } from '@/utils/auth/guards';
import { isPerformanceLevel } from '@/lib/cbaRubric';

/**
 * SCORES
 *
 * GET /api/cba/:assessmentId/scores   what the server holds
 * PUT /api/cba/:assessmentId/scores   push a batch captured on a phone
 *
 * PUT is the sync endpoint, and it is written to be safe to call twice with the
 * same body. A device coming back from a dead connection may well retry, and a
 * teacher must never end up with two conflicting levels for one cell — so this
 * upserts on (assessment, learner, outcome), the unique constraint migration 032
 * put there for exactly this.
 *
 * Ownership is row level security's job: `cba_scores_own` reaches through to the
 * assessment's creator. A batch aimed at somebody else's assessment writes
 * nothing, and there is no version of this route that could be rewritten into
 * letting it.
 */

const MAX_BATCH = 500;

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ assessmentId: string }> }
) {
    const { assessmentId } = await params;

    const supabase = await createClient();
    const { failure } = await requireUser(supabase);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    const { data, error } = await supabase
        .from('cba_scores')
        .select('learner_id, outcome_id, level, note')
        .eq('assessment_id', assessmentId);

    if (error) {
        console.error('GET scores failed:', error.message);
        return NextResponse.json({ error: 'Could not load scores' }, { status: 500 });
    }

    // Shaped as the sheet the UI works in: learner -> outcome -> level.
    const sheet: Record<string, Record<string, string>> = {};
    for (const row of data ?? []) {
        sheet[row.learner_id] = { ...(sheet[row.learner_id] ?? {}), [row.outcome_id]: row.level };
    }

    return NextResponse.json({ sheet });
}

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ assessmentId: string }> }
) {
    const { assessmentId } = await params;

    const supabase = await createClient();
    const { failure } = await requireUser(supabase);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 });
    }

    const incoming = Array.isArray(body.scores) ? body.scores : [];
    if (incoming.length === 0) {
        return NextResponse.json({ error: 'Nothing to save' }, { status: 400 });
    }
    if (incoming.length > MAX_BATCH) {
        return NextResponse.json(
            { error: `Too many at once — send ${MAX_BATCH} or fewer.` },
            { status: 413 }
        );
    }

    const rows: {
        assessment_id: string;
        learner_id: string;
        outcome_id: string;
        level: string;
        scored_at: string;
    }[] = [];

    const now = new Date().toISOString();

    for (const raw of incoming) {
        const entry = raw as Record<string, unknown>;
        const learnerId = typeof entry.learner_id === 'string' ? entry.learner_id : '';
        const outcomeId = typeof entry.outcome_id === 'string' ? entry.outcome_id.slice(0, 64) : '';
        const level = entry.level;

        // A malformed entry is dropped rather than failing the batch. A teacher
        // syncing a morning's work should not lose all of it because one cell
        // arrived wrong, and the queue on the device keeps whatever the server
        // does not confirm.
        if (!learnerId || !outcomeId || !isPerformanceLevel(level)) continue;

        rows.push({
            assessment_id: assessmentId,
            learner_id: learnerId,
            outcome_id: outcomeId,
            level,
            scored_at: now,
        });
    }

    if (rows.length === 0) {
        return NextResponse.json({ error: 'No usable scores in that batch' }, { status: 400 });
    }

    const { error } = await supabase
        .from('cba_scores')
        .upsert(rows, { onConflict: 'assessment_id,learner_id,outcome_id' });

    if (error) {
        console.error('PUT scores failed:', error.message);
        return NextResponse.json({ error: 'Could not save the scores' }, { status: 500 });
    }

    return NextResponse.json({
        saved: rows.length,
        // Named so the client can tell a partial accept from a full one without
        // comparing lengths itself.
        skipped: incoming.length - rows.length,
    });
}
