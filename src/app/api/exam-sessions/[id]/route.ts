import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

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
            // Calculate score from responses
            const { data: responses } = await supabase
                .from('exam_responses')
                .select('marks_awarded, marks_possible')
                .eq('session_id', sessionId);

            let totalScore = 0;
            let maxScore = 0;

            if (responses) {
                responses.forEach((r) => {
                    totalScore += r.marks_awarded || 0;
                    maxScore += r.marks_possible || 0;
                });
            }

            const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

            const { data: updated, error } = await supabase
                .from('exam_sessions')
                .update({
                    status: action === 'timeout' ? 'timed_out' : 'submitted',
                    submitted_at: new Date().toISOString(),
                    score: totalScore,
                    max_score: maxScore || session.max_score,
                    percentage,
                })
                .eq('id', sessionId)
                .select()
                .single();

            if (error) {
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
