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
                const level = searchParams.get('level');

                let query = supabase
                    .from('grades')
                    .select('id, curriculum_id, name, level, band, level_order')
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
                const level = searchParams.get('level');

                let data: any[] | null;
                let error: any;

                if (gradeId) {
                    // Filter by specific grade
                    const res = await supabase
                        .from('subjects')
                        .select('id, name, grade_subjects!inner(grade_id)')
                        .eq('grade_subjects.grade_id', gradeId)
                        .order('name');
                    data = res.data;
                    error = res.error;
                } else if (level) {
                    // Filter by level (primary, junior, senior) - get subjects through grades
                    const gradesRes = await supabase
                        .from('grades')
                        .select('id')
                        .eq('level', level);

                    if (gradesRes.error) {
                        return NextResponse.json({ error: gradesRes.error.message }, { status: 500 });
                    }

                    const gradeIds = gradesRes.data?.map(g => g.id) || [];

                    if (gradeIds.length > 0) {
                        const res = await supabase
                            .from('subjects')
                            .select('id, name, grade_subjects!inner(grade_id)')
                            .in('grade_subjects.grade_id', gradeIds)
                            .order('name');
                        data = res.data;
                        error = res.error;
                    } else {
                        data = [];
                        error = null;
                    }
                } else {
                    // Get all subjects
                    const res = await supabase
                        .from('subjects')
                        .select('id, name')
                        .order('name');
                    data = res.data;
                    error = res.error;
                }

                if (error) {
                    console.error('Error fetching subjects:', error);
                    return NextResponse.json({ error: error.message }, { status: 500 });
                }

                // Remove duplicates and extra properties
                const uniqueSubjects = new Map();
                data?.forEach((s: any) => {
                    if (!uniqueSubjects.has(s.id)) {
                        uniqueSubjects.set(s.id, { id: s.id, name: s.name });
                    }
                });
                const subjects = Array.from(uniqueSubjects.values());

                return NextResponse.json({ subjects });
            }

            case 'topics': {
                const subjectId = searchParams.get('subject_id');
                const gradeId = searchParams.get('grade_id');

                let query = supabase
                    .from('subject_topics')
                    .select('id, subject_id, topic_number, name, description, grade_id, sort_order')
                    .order('sort_order')
                    .order('topic_number');

                if (subjectId) {
                    query = query.eq('subject_id', subjectId);
                }

                // Filter by grade_id if provided (include null for topics that apply to all grades)
                if (gradeId) {
                    query = query.or(`grade_id.eq.${gradeId},grade_id.is.null`);
                }

                const { data, error } = await query;

                if (error) {
                    console.error('Error fetching topics:', error);
                    return NextResponse.json({ error: error.message }, { status: 500 });
                }

                return NextResponse.json({ topics: data || [] });
            }

            case 'section_types': {
                // Return available section types for question categorization
                const sectionTypes = [
                    { value: 'map_analysis', label: 'Map Analysis' },
                    { value: 'spatial_awareness', label: 'Spatial Awareness' },
                    { value: 'visual_identification', label: 'Visual Identification' },
                    { value: 'conceptual_knowledge', label: 'Conceptual Knowledge' },
                    { value: 'skills_drawing', label: 'Skills & Drawing' },
                    { value: 'true_false', label: 'True/False' },
                    { value: 'matching', label: 'Matching' },
                    { value: 'multiple_choice', label: 'Multiple Choice' },
                    { value: 'fill_blanks', label: 'Fill in the Blanks' },
                    { value: 'structured', label: 'Structured' },
                    { value: 'essay', label: 'Essay' },
                    { value: 'practical', label: 'Practical' },
                    { value: 'calculation', label: 'Calculation' },
                    { value: 'word_puzzle', label: 'Word Puzzle' },
                    { value: 'diagram_labeling', label: 'Diagram Labeling' },
                    { value: 'comprehension', label: 'Comprehension' },
                    { value: 'general', label: 'General' }
                ];

                return NextResponse.json({ section_types: sectionTypes });
            }

            default:
                return NextResponse.json(
                    { error: 'Invalid type. Use: curriculums, grades, subjects, topics, or section_types' },
                    { status: 400 }
                );
        }
    } catch (error: any) {
        console.error('Lookup GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
