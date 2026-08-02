import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { markSession } from '@/services/sessionMarker';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET /api/exam-sessions/[id] - Get a specific session
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: sessionId } = await params;
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data, error } = await supabase
            .from('exam_sessions')
            .select(`
                *,
                exams (
                    id,
                    title,
                    subject,
                    question_count,
                    question_ids,
                    total_marks,
                    time_limit
                )
            `)
            .eq('id', sessionId)
            .eq('user_id', user.id)
            .single();

        if (error || !data) {
            console.error('Error fetching session:', {
                sessionId,
                userId: user.id,
                error,
                data
            });
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        // Also fetch the questions for this exam
        const questionIds = data.exams?.question_ids || [];
        let questions = [];

        if (questionIds.length > 0) {
            const { data: questionData } = await supabase
                .from('questions')
                .select('*')
                .in('id', questionIds);

            questions = questionData || [];
        }

        // Fetch existing responses
        const { data: responses } = await supabase
            .from('exam_responses')
            .select('*')
            .eq('session_id', sessionId);

        return NextResponse.json({
            session: data,
            questions,
            responses: responses || [],
        });
    } catch (error) {
        console.error('Error in GET /api/exam-sessions/[id]:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// PATCH /api/exam-sessions/[id] - Update session (submit, update time, etc.)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: sessionId } = await params;
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { action, time_remaining } = body;

        // Verify ownership
        const { data: session } = await supabase
            .from('exam_sessions')
            .select('*')
            .eq('id', sessionId)
            .eq('user_id', user.id)
            .single();

        if (!session) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        if (action === 'submit' || action === 'timeout') {
            /*
             * Submitting is where the paper gets marked.
             *
             * This block used to sum `marks_awarded` from every response — a
             * column nothing in the product had ever written — so every score,
             * percentage, subject average and topic diagnostic came out zero.
             * The arithmetic was right; there was simply nothing to add up.
             *
             * Marking happens here rather than per answer because marking during
             * a sitting would leak the scheme, and here rather than on the client
             * because a mark a browser sent is a claim, not a mark.
             */
            const outcome = await markSession(supabase, sessionId);

            const { data: updated, error } = await supabase
                .from('exam_sessions')
                .update({
                    status: action === 'timeout' ? 'timed_out' : 'submitted',
                    submitted_at: new Date().toISOString(),
                    score: outcome.score,
                    // Out of what was actually marked. A paper with one
                    // unmarkable question is scored out of the rest, never out
                    // of the whole paper — that would charge the learner for a
                    // marking scheme we are missing.
                    max_score: outcome.maxScore,
                    percentage: outcome.percentage ?? 0,
                    marked_count: outcome.markedCount,
                    unmarked_count: outcome.unmarkedCount,
                })
                .eq('id', sessionId)
                .select()
                .single();

            if (error) {
                console.error('Failed to submit session:', error.message);
                return NextResponse.json({ error: 'Failed to submit session' }, { status: 500 });
            }

            return NextResponse.json(updated);
        } else if (time_remaining !== undefined) {
            // Just update time remaining
            const { data: updated, error } = await supabase
                .from('exam_sessions')
                .update({ time_remaining })
                .eq('id', sessionId)
                .select()
                .single();

            if (error) {
                return NextResponse.json({ error: 'Failed to update time' }, { status: 500 });
            }

            return NextResponse.json(updated);
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        console.error('Error in PATCH /api/exam-sessions/[id]:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
