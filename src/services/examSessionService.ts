import { createClient } from '@/utils/supabase/client';
import {
    ExamSession,
    ExamResponse,
    ExamSessionStatus,
    ExamTerm,
    QuestionResponse,
    StudentStats,
    ExamHistoryItem,
    StoredExam
} from '@/types';

// ============================================================================
// EXAM SESSION SERVICE
// Manages virtual exam-taking sessions and student responses
// ============================================================================

// Map database row to ExamSession type
function mapDBToSession(row: Record<string, unknown>): ExamSession {
    return {
        id: row.id as string,
        exam_id: row.exam_id as string,
        user_id: row.user_id as string,
        started_at: row.started_at as string,
        submitted_at: row.submitted_at as string | undefined,
        time_remaining: row.time_remaining as number | undefined,
        time_limit_seconds: row.time_limit_seconds as number | undefined,
        status: row.status as ExamSessionStatus,
        score: row.score as number | undefined,
        max_score: row.max_score as number | undefined,
        percentage: row.percentage as number | undefined,
        ip_address: row.ip_address as string | undefined,
        user_agent: row.user_agent as string | undefined,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
        // Joined data
        exam_title: (row.exams as Record<string, unknown>)?.title as string | undefined,
        exam_subject: (row.exams as Record<string, unknown>)?.subject as string | undefined,
        question_count: (row.exams as Record<string, unknown>)?.question_count as number | undefined,
    };
}

// Map database row to ExamResponse type
function mapDBToResponse(row: Record<string, unknown>): ExamResponse {
    return {
        id: row.id as string,
        session_id: row.session_id as string,
        question_id: row.question_id as string,
        response: row.response as QuestionResponse,
        is_correct: row.is_correct as boolean | undefined,
        marks_awarded: row.marks_awarded as number,
        marks_possible: row.marks_possible as number,
        time_spent_seconds: row.time_spent_seconds as number,
        first_answered_at: row.first_answered_at as string | undefined,
        last_updated_at: row.last_updated_at as string,
        is_flagged: row.is_flagged as boolean,
        created_at: row.created_at as string,
    };
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Start a new exam session for a user
 */
export async function startExamSession(
    examId: string,
    timeLimitSeconds?: number
): Promise<ExamSession | null> {
    const supabase = createClient();

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        console.error('User not authenticated');
        return null;
    }

    // Check for existing in-progress session
    const { data: existingSession } = await supabase
        .from('exam_sessions')
        .select('*')
        .eq('exam_id', examId)
        .eq('user_id', user.id)
        .eq('status', 'in_progress')
        .single();

    if (existingSession) {
        // Return existing session
        return mapDBToSession(existingSession);
    }

    // Get exam details for max_score
    const { data: exam } = await supabase
        .from('exams')
        .select('total_marks, time_limit')
        .eq('id', examId)
        .single();

    // Parse time limit from exam if not provided
    let timeLimit = timeLimitSeconds;
    if (!timeLimit && exam?.time_limit) {
        // Parse "2 Hours" or "90 Minutes" format
        const match = exam.time_limit.match(/(\d+)\s*(hours?|minutes?)/i);
        if (match) {
            const value = parseInt(match[1]);
            const unit = match[2].toLowerCase();
            timeLimit = unit.startsWith('hour') ? value * 3600 : value * 60;
        }
    }

    // Create new session
    const { data, error } = await supabase
        .from('exam_sessions')
        .insert({
            exam_id: examId,
            user_id: user.id,
            time_limit_seconds: timeLimit,
            time_remaining: timeLimit,
            max_score: exam?.total_marks || 0,
            status: 'in_progress',
            user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        })
        .select()
        .single();

    if (error) {
        console.error('Error starting exam session:', error);
        return null;
    }

    return mapDBToSession(data);
}

/**
 * Get an existing exam session by ID
 */
export async function getExamSession(sessionId: string): Promise<ExamSession | null> {
    const supabase = createClient();

    const { data, error } = await supabase
        .from('exam_sessions')
        .select(`
            *,
            exams (
                title,
                subject,
                question_count
            )
        `)
        .eq('id', sessionId)
        .single();

    if (error || !data) {
        console.error('Error fetching exam session:', error);
        return null;
    }

    return mapDBToSession(data);
}

/**
 * Update session time remaining (for auto-save)
 */
export async function updateSessionTime(
    sessionId: string,
    timeRemaining: number
): Promise<boolean> {
    const supabase = createClient();

    const { error } = await supabase
        .from('exam_sessions')
        .update({ time_remaining: timeRemaining })
        .eq('id', sessionId);

    if (error) {
        console.error('Error updating session time:', error);
        return false;
    }

    return true;
}

/**
 * Submit the exam session
 */
export async function submitExamSession(
    sessionId: string
): Promise<ExamSession | null> {
    const supabase = createClient();

    // Calculate score from responses
    const { data: responses } = await supabase
        .from('exam_responses')
        .select('marks_awarded, marks_possible')
        .eq('session_id', sessionId);

    let totalScore = 0;
    let maxScore = 0;

    if (responses) {
        responses.forEach((r: { marks_awarded: number; marks_possible: number }) => {
            totalScore += r.marks_awarded || 0;
            maxScore += r.marks_possible || 0;
        });
    }

    const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

    // Update session
    const { data, error } = await supabase
        .from('exam_sessions')
        .update({
            status: 'submitted',
            submitted_at: new Date().toISOString(),
            score: totalScore,
            max_score: maxScore,
            percentage: percentage,
        })
        .eq('id', sessionId)
        .select()
        .single();

    if (error) {
        console.error('Error submitting exam session:', error);
        return null;
    }

    return mapDBToSession(data);
}

/**
 * Mark session as timed out
 */
export async function timeoutExamSession(sessionId: string): Promise<boolean> {
    const supabase = createClient();

    // Submit with current score
    const session = await submitExamSession(sessionId);
    if (!session) return false;

    // Update status to timed_out
    const { error } = await supabase
        .from('exam_sessions')
        .update({ status: 'timed_out' })
        .eq('id', sessionId);

    return !error;
}

// ============================================================================
// RESPONSE MANAGEMENT
// ============================================================================

/**
 * Save or update a response for a question
 */
export async function saveResponse(
    sessionId: string,
    questionId: string,
    response: QuestionResponse,
    marksPossible: number,
    timeSpent: number
): Promise<ExamResponse | null> {
    const supabase = createClient();

    // Check if response already exists
    const { data: existing } = await supabase
        .from('exam_responses')
        .select('id, time_spent_seconds')
        .eq('session_id', sessionId)
        .eq('question_id', questionId)
        .single();

    const now = new Date().toISOString();

    if (existing) {
        // Update existing response
        const { data, error } = await supabase
            .from('exam_responses')
            .update({
                response,
                time_spent_seconds: (existing.time_spent_seconds || 0) + timeSpent,
                last_updated_at: now,
            })
            .eq('id', existing.id)
            .select()
            .single();

        if (error) {
            console.error('Error updating response:', error);
            return null;
        }

        return mapDBToResponse(data);
    } else {
        // Create new response
        const { data, error } = await supabase
            .from('exam_responses')
            .insert({
                session_id: sessionId,
                question_id: questionId,
                response,
                marks_possible: marksPossible,
                time_spent_seconds: timeSpent,
                first_answered_at: now,
                last_updated_at: now,
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating response:', error);
            return null;
        }

        return mapDBToResponse(data);
    }
}

/**
 * Toggle flag on a question
 */
export async function toggleQuestionFlag(
    sessionId: string,
    questionId: string
): Promise<boolean> {
    const supabase = createClient();

    // Get current flag status
    const { data: existing } = await supabase
        .from('exam_responses')
        .select('id, is_flagged')
        .eq('session_id', sessionId)
        .eq('question_id', questionId)
        .single();

    if (existing) {
        const { error } = await supabase
            .from('exam_responses')
            .update({ is_flagged: !existing.is_flagged })
            .eq('id', existing.id);

        return !error;
    } else {
        // Create response just for the flag
        const { error } = await supabase
            .from('exam_responses')
            .insert({
                session_id: sessionId,
                question_id: questionId,
                response: {},
                marks_possible: 0,
                is_flagged: true,
            });

        return !error;
    }
}

/**
 * Get all responses for a session
 */
export async function getSessionResponses(sessionId: string): Promise<ExamResponse[]> {
    const supabase = createClient();

    const { data, error } = await supabase
        .from('exam_responses')
        .select('*')
        .eq('session_id', sessionId);

    if (error || !data) {
        console.error('Error fetching responses:', error);
        return [];
    }

    return data.map(mapDBToResponse);
}

// ============================================================================
// STUDENT DASHBOARD FUNCTIONS
// ============================================================================

/**
 * Get student's exam history
 */
export async function getExamHistory(limit = 20): Promise<ExamHistoryItem[]> {
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    console.log('Fetching exam history for user:', user.id);
    const { data, error } = await supabase
        .from('exam_sessions')
        .select(`
            id,
            exam_id,
            score,
            max_score,
            percentage,
            submitted_at,
            started_at,
            exams (
                title,
                subject,
                question_count
            )
        `)
        .eq('user_id', user.id)
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: false })
        .limit(limit);

    if (error || !data) {
        console.error('FULL ERROR DEBUG:', {
            error,
            data,
            errorMessage: error?.message,
            errorCode: error?.code,
            isErrorNull: error === null,
            isDataNull: data === null
        });
        return [];
    }

    return data.map((row: Record<string, unknown>): ExamHistoryItem => {
        const exam = row.exams as Record<string, unknown>;
        const startedAt = new Date(row.started_at as string);
        const submittedAt = new Date(row.submitted_at as string);
        const timeTaken = Math.round((submittedAt.getTime() - startedAt.getTime()) / 1000);

        return {
            session_id: row.id as string,
            exam_id: row.exam_id as string,
            exam_title: exam?.title as string || 'Unknown Exam',
            subject: exam?.subject as string || 'Unknown',
            score: row.score as number || 0,
            max_score: row.max_score as number || 0,
            percentage: row.percentage as number || 0,
            time_taken: timeTaken,
            submitted_at: row.submitted_at as string,
            question_count: exam?.question_count as number || 0,
        };
    });
}

/**
 * Get student's overall stats
 */
export async function getStudentStats(): Promise<StudentStats> {
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return {
            total_exams_taken: 0,
            average_score: 0,
            total_time_spent: 0,
            exams_this_week: 0,
        };
    }

    // Get all submitted sessions
    const { data: sessions } = await supabase
        .from('exam_sessions')
        .select(`
            score,
            max_score,
            started_at,
            submitted_at,
            exams (subject)
        `)
        .eq('user_id', user.id)
        .eq('status', 'submitted');

    if (!sessions || sessions.length === 0) {
        return {
            total_exams_taken: 0,
            average_score: 0,
            total_time_spent: 0,
            exams_this_week: 0,
        };
    }

    // Calculate stats
    let totalScore = 0;
    let totalPossible = 0;
    let totalTime = 0;
    let examsThisWeek = 0;
    const subjectScores: Record<string, { total: number; count: number }> = {};

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    sessions.forEach((s: Record<string, unknown>) => {
        const score = s.score as number || 0;
        const maxScore = s.max_score as number || 0;
        const startedAt = new Date(s.started_at as string);
        const submittedAt = new Date(s.submitted_at as string);
        const exam = s.exams as Record<string, unknown>;
        const subject = exam?.subject as string || 'Unknown';

        totalScore += score;
        totalPossible += maxScore;
        totalTime += (submittedAt.getTime() - startedAt.getTime()) / 1000;

        if (submittedAt > oneWeekAgo) {
            examsThisWeek++;
        }

        // Track by subject
        if (!subjectScores[subject]) {
            subjectScores[subject] = { total: 0, count: 0 };
        }
        if (maxScore > 0) {
            subjectScores[subject].total += (score / maxScore) * 100;
            subjectScores[subject].count++;
        }
    });

    // Find best and worst subjects
    let bestSubject: string | undefined;
    let worstSubject: string | undefined;
    let bestAvg = -1;
    let worstAvg = 101;

    Object.entries(subjectScores).forEach(([subject, data]) => {
        if (data.count > 0) {
            const avg = data.total / data.count;
            if (avg > bestAvg) {
                bestAvg = avg;
                bestSubject = subject;
            }
            if (avg < worstAvg) {
                worstAvg = avg;
                worstSubject = subject;
            }
        }
    });

    return {
        total_exams_taken: sessions.length,
        average_score: totalPossible > 0 ? (totalScore / totalPossible) * 100 : 0,
        total_time_spent: Math.round(totalTime),
        exams_this_week: examsThisWeek,
        best_subject: bestSubject,
        worst_subject: worstSubject,
    };
}

/**
 * Get available exams for a student
 */
export async function getAvailableExams(): Promise<StoredExam[]> {
    const supabase = createClient();

    const { data, error } = await supabase
        .from('exams')
        .select(`
            *,
            curriculums (name),
            grades (name),
            subjects (name)
        `)
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(50);

    if (error || !data) {
        console.error('Error fetching available exams:', error);
        return [];
    }

    return data.map((row: Record<string, unknown>) => ({
        id: row.id as string,
        title: row.title as string,
        subject: row.subject as string,
        code: row.code as string | undefined,
        curriculum_id: row.curriculum_id as string | undefined,
        grade_id: row.grade_id as string | undefined,
        subject_id: row.subject_id as string | undefined,
        term: row.term as ExamTerm | undefined,
        total_marks: row.total_marks as number,
        time_limit: row.time_limit as string | undefined,
        institution: row.institution as string | undefined,
        exam_board: row.exam_board as string | undefined,
        pdf_storage_key: row.pdf_storage_key as string | undefined,
        pdf_url: row.pdf_url as string | undefined,
        thumbnail_url: row.thumbnail_url as string | undefined,
        question_ids: row.question_ids as string[],
        question_count: row.question_count as number,
        is_public: row.is_public as boolean,
        created_by: row.created_by as string | undefined,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
        curriculum_name: (row.curriculums as Record<string, unknown>)?.name as string | undefined,
        grade_name: (row.grades as Record<string, unknown>)?.name as string | undefined,
        subject_name: (row.subjects as Record<string, unknown>)?.name as string | undefined,
    }));
}
