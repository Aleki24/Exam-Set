import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// GET /api/questions - Fetch questions with filters
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { searchParams } = new URL(request.url);

        // Parse query params
        const curriculum_id = searchParams.get('curriculum_id');
        const grade_id = searchParams.get('grade_id');
        const subject_id = searchParams.get('subject_id');
        const topic = searchParams.get('topic');
        const subtopic = searchParams.get('subtopic');
        const term = searchParams.get('term');
        const difficulty = searchParams.get('difficulty');
        const type = searchParams.get('type');
        const search = searchParams.get('search');
        const limit = parseInt(searchParams.get('limit') || '50');
        const offset = parseInt(searchParams.get('offset') || '0');

        // Build query
        let query = supabase
            .from('questions')
            .select(`
                *,
                curriculums:curriculum_id(name),
                grades:grade_id(name),
                subjects:subject_id(name)
            `, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        // Apply filters
        if (curriculum_id) query = query.eq('curriculum_id', curriculum_id);
        if (grade_id) query = query.eq('grade_id', grade_id);
        if (subject_id) query = query.eq('subject_id', subject_id);
        if (topic) query = query.eq('topic', topic);
        if (subtopic) query = query.eq('subtopic', subtopic);
        if (term) query = query.eq('term', term);
        if (difficulty) query = query.eq('difficulty', difficulty);
        if (type) query = query.eq('type', type);
        if (search) query = query.ilike('text', `%${search}%`);

        const { data, error, count } = await query;

        if (error) {
            console.error('Error fetching questions:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Flatten joined data for easier frontend use
        const questions = (data || []).map((q: any) => ({
            ...q,
            curriculum_name: q.curriculums?.name,
            grade_name: q.grades?.name,
            subject_name: q.subjects?.name,
            answerLines: q.answer_lines,

            curriculums: undefined,
            grades: undefined,
            subjects: undefined,
        }));

        return NextResponse.json({ questions, count: count || 0 });
    } catch (error: any) {
        console.error('Questions GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST /api/questions - Create new question(s)
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const body = await request.json();

        // Support both single question and array of questions
        const questions = Array.isArray(body.questions) ? body.questions : [body];

        // Map to database format
        const dbQuestions = questions.map((q: any) => {
            const row: any = {
                text: q.text,
                marks: q.marks || 1,
                difficulty: q.difficulty || 'Medium',
                topic: q.topic || 'General',
                subtopic: q.subtopic || null,
                curriculum_id: q.curriculum_id === '' ? null : (q.curriculum_id || null),
                grade_id: q.grade_id === '' ? null : (q.grade_id || null),
                subject_id: q.subject_id === '' ? null : (q.subject_id || null),
                term: q.term || null,
                type: q.type || 'Structured',
                options: q.options || [],
                matching_pairs: q.matchingPairs || q.matching_pairs || [],
                unit: q.unit || null,
                expected_length: q.expectedLength || q.expected_length || null,
                marking_scheme: q.markingScheme || q.marking_scheme || null,
                blooms_level: q.bloomsLevel || q.blooms_level || 'Knowledge',
                image_path: q.imagePath || q.image_path || null,
                image_caption: q.imageCaption || q.image_caption || null,
                has_latex: q.hasLatex || q.has_latex || false,
                is_ai_generated: q.isAiGenerated || q.is_ai_generated || false,
                answer_lines: q.answerLines || q.answer_lines || null,
            };
            return row;
        });

        const { data, error } = await supabase
            .from('questions')
            .insert(dbQuestions)
            .select();

        if (error) {
            console.error('Error creating questions:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            questions: data,
            count: data?.length || 0
        });
    } catch (error: any) {
        console.error('Questions POST error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
