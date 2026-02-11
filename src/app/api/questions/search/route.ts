import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// GET /api/questions/search - Full-text search for questions
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { searchParams } = new URL(request.url);

        const query = searchParams.get('q') || '';
        const curriculum_id = searchParams.get('curriculum_id');
        const grade_id = searchParams.get('grade_id');
        const subject_id = searchParams.get('subject_id');
        const topic = searchParams.get('topic');
        const difficulty = searchParams.get('difficulty');
        const type = searchParams.get('type');
        const blooms_level = searchParams.get('blooms_level');
        const limit = parseInt(searchParams.get('limit') || '50');
        const offset = parseInt(searchParams.get('offset') || '0');

        // Build query
        let dbQuery = supabase
            .from('questions')
            .select(`
                *,
                curriculums (name),
                grades (name),
                subjects (name)
            `, { count: 'exact' });

        // Apply text search if query provided
        if (query.trim()) {
            // Use PostgreSQL full-text search with to_tsvector
            dbQuery = dbQuery.or(`text.ilike.%${query}%,topic.ilike.%${query}%,subtopic.ilike.%${query}%`);
        }

        // Apply filters
        if (curriculum_id) {
            dbQuery = dbQuery.eq('curriculum_id', curriculum_id);
        }
        if (grade_id) {
            dbQuery = dbQuery.eq('grade_id', grade_id);
        }
        if (subject_id) {
            dbQuery = dbQuery.eq('subject_id', subject_id);
        }
        if (topic) {
            dbQuery = dbQuery.ilike('topic', `%${topic}%`);
        }
        if (difficulty) {
            dbQuery = dbQuery.eq('difficulty', difficulty);
        }
        if (type) {
            dbQuery = dbQuery.eq('type', type);
        }
        if (blooms_level) {
            dbQuery = dbQuery.eq('blooms_level', blooms_level);
        }

        // Apply pagination and ordering
        dbQuery = dbQuery
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        const { data, error, count } = await dbQuery;

        if (error) {
            console.error('Search error:', error);
            return NextResponse.json({ error: 'Search failed' }, { status: 500 });
        }

        // Map results
        const questions = data?.map((row) => ({
            id: row.id,
            text: row.text,
            marks: row.marks,
            difficulty: row.difficulty,
            topic: row.topic,
            subtopic: row.subtopic,
            type: row.type,
            options: row.options,
            blooms_level: row.blooms_level,
            curriculum_id: row.curriculum_id,
            grade_id: row.grade_id,
            subject_id: row.subject_id,
            marking_scheme: row.marking_scheme,
            image_path: row.image_path,
            created_at: row.created_at,
            // Joined names
            curriculum_name: row.curriculums?.name,
            grade_name: row.grades?.name,
            subject_name: row.subjects?.name,
        })) || [];

        return NextResponse.json({
            questions,
            total: count || 0,
            limit,
            offset,
            hasMore: offset + questions.length < (count || 0),
        });
    } catch (error) {
        console.error('Error in GET /api/questions/search:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
