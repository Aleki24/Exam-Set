import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { presentedKey, resolveKey } from '@/lib/ingestKeys';
import { summariseCoverage } from '@/lib/ingestCoverage';

/**
 * GET /api/ingest/curriculum — what to tag questions with, and where the gaps are.
 *
 * A model that guesses a subject name writes a question nobody can find: the
 * shop browses by learning area, so a question tagged "Maths" when the
 * catalogue says "Mathematics" is stock that exists and cannot be sold. So the
 * names are published rather than guessed at.
 *
 * The counts are here for a second reason. 201 of the first 253 questions were
 * one subject at one level, because nothing ever said what was already covered.
 * A model that can see the distribution writes toward the empty shelves
 * instead of the full one.
 */
export async function GET(req: NextRequest) {
    try {
        const admin = createAdminClient();
        if (!admin) {
            return NextResponse.json({ error: 'Ingest is not configured on this deployment.' }, { status: 503 });
        }

        const presented = presentedKey(req.headers);
        if (!presented) {
            return NextResponse.json(
                { error: 'Missing ingest key. Send it as `Authorization: Bearer <key>`.' },
                { status: 401 }
            );
        }
        if (!(await resolveKey(admin, presented))) {
            return NextResponse.json({ error: 'That ingest key is not valid or has been revoked.' }, { status: 401 });
        }

        const [{ data: subjects }, { data: grades }, { data: counts }] = await Promise.all([
            admin.from('subjects').select('id, name').order('name'),
            admin.from('grades').select('id, name').order('name'),
            admin.from('questions').select('subject_id, grade_id, review_status, topic'),
        ]);

        const subjectName = new Map((subjects ?? []).map((s) => [s.id, s.name]));
        const gradeName = new Map((grades ?? []).map((g) => [g.id, g.name]));

        // Kept out of the route so `verify:ingest` can cover the counting rules
        // without a database. See src/lib/ingestCoverage.ts for why `topic` is
        // the strand here and `strands`/`strand_id` are not.
        const { coverage, topicsInUse } = summariseCoverage(counts ?? [], subjectName, gradeName);

        return NextResponse.json({
            subjects: (subjects ?? []).map((s) => s.name),
            grades: (grades ?? []).map((g) => g.name),
            topics_in_use: topicsInUse,
            coverage,
            note:
                'Tag questions with these exact subject and grade names. `coverage` shows what is already held, ' +
                'thinnest topic first within each pairing — write toward those. For `topic`, reuse a spelling from ' +
                '`topics_in_use` whenever one fits: the shop filters on that string, so "Algebra" and "Algebraic ' +
                'Expressions" are two unrelated strands as far as every query is concerned. Only coin a new topic ' +
                'when the strand genuinely is not represented yet.',
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        console.error('GET src/app/api/ingest/curriculum/route.ts:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
