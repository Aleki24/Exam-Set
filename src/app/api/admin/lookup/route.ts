import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// GET /api/admin/lookup - Fetch lookup data for dropdowns
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type');
        const curriculumId = searchParams.get('curriculum_id');

        switch (type) {
            case 'curriculums': {
                const { data, error } = await supabase
                    .from('curriculums')
                    .select('id, name')
                    .order('name');

                if (error) {
                    console.error('Error fetching curriculums:', error);
                    return NextResponse.json({ error: error.message }, { status: 500 });
                }

                return NextResponse.json({ curriculums: data || [] });
            }

            case 'grades': {
                let query = supabase
                    .from('grades')
                    .select('id, curriculum_id, name, level_order')
                    .order('level_order');

                if (curriculumId) {
                    query = query.eq('curriculum_id', curriculumId);
                }

                const { data, error } = await query;

                if (error) {
                    console.error('Error fetching grades:', error);
                    return NextResponse.json({ error: error.message }, { status: 500 });
                }

                return NextResponse.json({ grades: data || [] });
            }

            case 'subjects': {
                const gradeId = searchParams.get('grade_id');

                let data: any[] | null;
                let error: any;

                if (gradeId) {
                    const res = await supabase
                        .from('subjects')
                        .select('id, name, code, grade_subjects!inner(grade_id)')
                        .eq('grade_subjects.grade_id', gradeId)
                        .order('name');
                    data = res.data;
                    error = res.error;
                } else {
                    const res = await supabase
                        .from('subjects')
                        .select('id, name, code')
                        .order('name');
                    data = res.data;
                    error = res.error;
                }

                if (error) {
                    console.error('Error fetching subjects:', error);
                    return NextResponse.json({ error: error.message }, { status: 500 });
                }

                // Remove the extra grade_subjects property if present to clean up response
                const subjects = data?.map((s: any) => ({
                    id: s.id,
                    name: s.name,
                    code: s.code
                })) || [];

                return NextResponse.json({ subjects });
            }

            default:
                return NextResponse.json(
                    { error: 'Invalid type. Use: curriculums, grades, or subjects' },
                    { status: 400 }
                );
        }
    } catch (error: any) {
        console.error('Lookup GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
