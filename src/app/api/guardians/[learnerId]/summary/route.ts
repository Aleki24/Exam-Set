import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireUser } from '@/utils/auth/guards';

/**
 * GET /api/guardians/:learnerId/summary
 *
 * One learner's headline numbers, for a guardian they have accepted.
 *
 * The permission check is not here. It is inside `guardian_learner_summary`,
 * which refuses unless an accepted link exists and returns aggregates only —
 * so this route cannot be made to leak by being rewritten carelessly, and a
 * second caller written later inherits the same rule for free.
 */
export async function GET(
    _req: Request,
    { params }: { params: Promise<{ learnerId: string }> }
) {
    const { learnerId } = await params;

    const supabase = await createClient();
    const { failure } = await requireUser(supabase);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    const [summary, subjects] = await Promise.all([
        supabase.rpc('guardian_learner_summary', { p_learner: learnerId }),
        supabase.rpc('guardian_learner_subjects', { p_learner: learnerId }),
    ]);

    if (summary.error) {
        // 42501 is the function refusing: no accepted link. That is an ordinary
        // outcome — a cancelled or declined request — not a server fault.
        if (summary.error.code === '42501') {
            return NextResponse.json(
                { error: 'You do not have permission to see this learner’s progress.' },
                { status: 403 }
            );
        }
        console.error('guardian_learner_summary failed:', summary.error.message);
        return NextResponse.json({ error: 'Could not load their progress' }, { status: 500 });
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const row: any = Array.isArray(summary.data) ? summary.data[0] : summary.data;

    return NextResponse.json({
        summary: {
            papersAttempted: Number(row?.papers_attempted ?? 0),
            papersCompleted: Number(row?.papers_completed ?? 0),
            averagePercentage: row?.average_percentage != null ? Number(row.average_percentage) : null,
            bestPercentage: row?.best_percentage != null ? Number(row.best_percentage) : null,
            lastCompletedAt: row?.last_completed_at ?? null,
        },
        subjects: (subjects.data ?? []).map((s: any) => ({
            subject: s.subject,
            papersCompleted: Number(s.papers_completed ?? 0),
            averagePercentage: s.average_percentage != null ? Number(s.average_percentage) : null,
        })),
    });
}
