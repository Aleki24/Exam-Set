import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// POST /api/exam-sessions - Start a new exam session
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();

        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { exam_id, time_limit_seconds } = body;

        if (!exam_id) {
            return NextResponse.json({ error: 'exam_id is required' }, { status: 400 });
        }

        // Check for existing in-progress session
        const { data: existingSession } = await supabase
            .from('exam_sessions')
            .select('*')
            .eq('exam_id', exam_id)
            .eq('user_id', user.id)
            .eq('status', 'in_progress')
            .single();

        if (existingSession) {
            return NextResponse.json(existingSession);
        }

        // Get exam details
        const { data: exam } = await supabase
            .from('exams')
            .select('total_marks, time_limit, question_ids')
            .eq('id', exam_id)
            .single();

        if (!exam) {
            return NextResponse.json({ error: 'Exam not found' }, { status: 404 });
        }

        // Parse time limit
        let timeLimit = time_limit_seconds;
        if (!timeLimit && exam.time_limit) {
            const match = exam.time_limit.match(/(\d+)\s*(hours?|minutes?)/i);
            if (match) {
                const value = parseInt(match[1]);
                const unit = match[2].toLowerCase();
                timeLimit = unit.startsWith('hour') ? value * 3600 : value * 60;
            }
        }

        // Create session
        const { data: session, error } = await supabase
            .from('exam_sessions')
            .insert({
                exam_id,
                user_id: user.id,
                time_limit_seconds: timeLimit,
                time_remaining: timeLimit,
                max_score: exam.total_marks || 0,
                status: 'in_progress',
                user_agent: request.headers.get('user-agent') || undefined,
                ip_address: request.headers.get('x-forwarded-for') ||
                    request.headers.get('x-real-ip') || undefined,
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating session:', error);
            return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
        }

        return NextResponse.json(session);
    } catch (error) {
        console.error('Error in POST /api/exam-sessions:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// GET /api/exam-sessions - Get user's exam sessions
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');
        const limit = parseInt(searchParams.get('limit') || '20');

        let query = supabase
            .from('exam_sessions')
            .select(`
                *,
                exams (
                    title,
                    subject,
                    question_count
                )
            `)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (status) {
            query = query.eq('status', status);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching sessions:', error);
            return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error in GET /api/exam-sessions:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
