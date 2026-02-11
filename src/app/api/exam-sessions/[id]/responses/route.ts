import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// POST /api/exam-sessions/[id]/responses - Save a response
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: sessionId } = await params;
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Verify session ownership
        const { data: session } = await supabase
            .from('exam_sessions')
            .select('id, status')
            .eq('id', sessionId)
            .eq('user_id', user.id)
            .single();

        if (!session) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        if (session.status !== 'in_progress') {
            return NextResponse.json({ error: 'Session is not in progress' }, { status: 400 });
        }

        const body = await request.json();
        const { question_id, response, marks_possible, time_spent, is_flagged } = body;

        if (!question_id) {
            return NextResponse.json({ error: 'question_id is required' }, { status: 400 });
        }

        // Check for existing response
        const { data: existing } = await supabase
            .from('exam_responses')
            .select('id, time_spent_seconds')
            .eq('session_id', sessionId)
            .eq('question_id', question_id)
            .single();

        const now = new Date().toISOString();

        if (existing) {
            // Update existing response
            const updateData: Record<string, unknown> = {
                last_updated_at: now,
            };

            if (response !== undefined) {
                updateData.response = response;
            }
            if (time_spent !== undefined) {
                updateData.time_spent_seconds = (existing.time_spent_seconds || 0) + time_spent;
            }
            if (is_flagged !== undefined) {
                updateData.is_flagged = is_flagged;
            }

            const { data: updated, error } = await supabase
                .from('exam_responses')
                .update(updateData)
                .eq('id', existing.id)
                .select()
                .single();

            if (error) {
                console.error('Error updating response:', error);
                return NextResponse.json({ error: 'Failed to update response' }, { status: 500 });
            }

            return NextResponse.json(updated);
        } else {
            // Create new response
            const { data: created, error } = await supabase
                .from('exam_responses')
                .insert({
                    session_id: sessionId,
                    question_id,
                    response: response || {},
                    marks_possible: marks_possible || 0,
                    time_spent_seconds: time_spent || 0,
                    is_flagged: is_flagged || false,
                    first_answered_at: now,
                    last_updated_at: now,
                })
                .select()
                .single();

            if (error) {
                console.error('Error creating response:', error);
                return NextResponse.json({ error: 'Failed to create response' }, { status: 500 });
            }

            return NextResponse.json(created);
        }
    } catch (error) {
        console.error('Error in POST /api/exam-sessions/[id]/responses:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// GET /api/exam-sessions/[id]/responses - Get all responses for a session
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: sessionId } = await params;
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Verify session ownership
        const { data: session } = await supabase
            .from('exam_sessions')
            .select('id')
            .eq('id', sessionId)
            .eq('user_id', user.id)
            .single();

        if (!session) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        const { data, error } = await supabase
            .from('exam_responses')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });

        if (error) {
            return NextResponse.json({ error: 'Failed to fetch responses' }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error in GET /api/exam-sessions/[id]/responses:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
