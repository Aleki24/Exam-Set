import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireUser } from '@/utils/auth/guards';

/**
 * PRACTISE A TOPIC
 *
 * POST /api/practice  { topic, subject?, size? }
 *
 * Builds a short set of questions on one strand and returns an exam id to sit.
 *
 * WHY THIS IS AN `exams` ROW AND NOT A NEW KIND OF THING
 *
 * A practice set is created as a private, free, unpublished exam owned by the
 * learner. That is not a shortcut — it is the same decision migration 023 made
 * for resources, and it means practice inherits the sitting page, the timer, the
 * marking loop, the topic diagnostics and the entitlement check without a second
 * copy of any of them. A parallel "practice" table would need its own version of
 * all five, and the copies would drift.
 *
 * WHY THIS EXISTS AT ALL
 *
 * The weakest-topic list on /progress was, until now, a diagnosis with no
 * treatment: it told a learner that Geometry was costing them marks and left
 * them to go and find some Geometry. Retrieval practice and spaced repetition
 * are the two highest-effect study techniques in the literature, and this route
 * is the product's only path to either — a question bank filtered by the topic
 * somebody just got wrong is precisely retrieval practice.
 */

/** Short enough to finish in one sitting. Long enough to be worth marking. */
const DEFAULT_SIZE = 8;
const MAX_SIZE = 20;

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

    const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
    if (!topic) return NextResponse.json({ error: 'Which topic?' }, { status: 400 });

    const size = Math.min(
        MAX_SIZE,
        Math.max(3, Number.isFinite(Number(body.size)) ? Number(body.size) : DEFAULT_SIZE)
    );

    /*
     * Only questions that can actually be marked.
     *
     * A practice set exists to produce a diagnosis, and a set built from
     * questions with no marking scheme produces an unmarked paper — which
     * teaches the learner nothing and, worse, looks like the marking is broken.
     * Better to return fewer questions, or to say plainly that there are none.
     */
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const { data: questions, error } = await (supabase as any)
        .from('questions')
        .select('id, marks, topic')
        .eq('topic', topic)
        .not('marking_scheme', 'is', null)
        .neq('marking_scheme', '')
        .limit(size * 3);

    if (error) {
        console.error('Practice: could not load questions:', error.message);
        return NextResponse.json({ error: 'Could not build a practice set' }, { status: 500 });
    }

    const pool = questions ?? [];
    if (pool.length === 0) {
        return NextResponse.json(
            {
                error: `There are no markable questions on ${topic} yet.`,
                empty: true,
            },
            { status: 404 }
        );
    }

    // Shuffled so sitting the same topic twice is not the same paper. Fisher-Yates
    // rather than a sort-by-random comparator, which is biased and, on some
    // engines, not even a valid comparator.
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const chosen = shuffled.slice(0, size);
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const totalMarks = chosen.reduce((sum: number, q: any) => sum + (Number(q.marks) || 0), 0);

    const { data: exam, error: insertError } = await supabase
        .from('exams')
        .insert({
            title: `${topic} — practice`,
            subject: typeof body.subject === 'string' && body.subject ? body.subject : topic,
            source: 'user_set',
            resource_kind: 'topical',
            exam_type: 'topical',
            // Private and free. Never listed, never sold, never in the shop:
            // `is_published` false keeps it out of every catalogue query, and
            // `created_by` is what row level security lets the owner read it by.
            is_published: false,
            is_public: false,
            price_cents: 0,
            /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
            question_ids: chosen.map((q: any) => q.id),
            question_count: chosen.length,
            total_marks: totalMarks,
            created_by: user.id,
        })
        .select('id, title, question_count, total_marks')
        .single();

    if (insertError) {
        console.error('Practice: could not create the set:', insertError.message);
        return NextResponse.json({ error: 'Could not build a practice set' }, { status: 500 });
    }

    return NextResponse.json({
        examId: exam.id,
        title: exam.title,
        questionCount: exam.question_count,
        totalMarks: exam.total_marks,
        // Said plainly when the bank could not fill the request, so the UI does
        // not have to imply a set is longer than it is.
        short: chosen.length < size,
    });
}
