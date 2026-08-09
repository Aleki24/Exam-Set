import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { presentedKey, resolveKey } from '@/lib/ingestKeys';

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
            admin.from('questions').select('subject_id, grade_id, review_status'),
        ]);

        const tally = new Map<string, { approved: number; pending: number }>();
        for (const row of counts ?? []) {
            const key = `${row.subject_id ?? 'none'}|${row.grade_id ?? 'none'}`;
            const cell = tally.get(key) ?? { approved: 0, pending: 0 };
            if (row.review_status === 'approved') cell.approved++;
            else if (row.review_status === 'pending') cell.pending++;
            tally.set(key, cell);
        }

        const subjectName = new Map((subjects ?? []).map((s) => [s.id, s.name]));
        const gradeName = new Map((grades ?? []).map((g) => [g.id, g.name]));

        const coverage = [...tally.entries()]
            .map(([key, cell]) => {
                const [subjectId, gradeId] = key.split('|');
                return {
                    subject: subjectName.get(subjectId) ?? null,
                    grade: gradeName.get(gradeId) ?? null,
                    approved: cell.approved,
                    pending: cell.pending,
                };
            })
            .sort((a, b) => b.approved - a.approved);

        return NextResponse.json({
            subjects: (subjects ?? []).map((s) => s.name),
            grades: (grades ?? []).map((g) => g.name),
            coverage,
            note:
                'Tag questions with these exact subject and grade names. `coverage` shows what is already held — ' +
                'write toward the combinations with the fewest approved questions.',
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        console.error('GET src/app/api/ingest/curriculum/route.ts:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
