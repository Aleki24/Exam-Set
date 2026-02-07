import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// POST /api/admin/fix-questions - Fix questions with null curriculum_id
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();

        // First, find the CBC curriculum ID
        const { data: cbcCurriculum, error: currError } = await supabase
            .from('curriculums')
            .select('id')
            .eq('name', 'CBC')
            .single();

        if (currError || !cbcCurriculum) {
            // If no CBC, try to get any curriculum
            const { data: anyCurr } = await supabase
                .from('curriculums')
                .select('id')
                .limit(1)
                .single();

            if (!anyCurr) {
                return NextResponse.json({ error: 'No curriculum found' }, { status: 404 });
            }

            // Use the first available curriculum
            const curriculumId = anyCurr.id;

            // Update all questions with null curriculum_id
            const { data, error, count } = await supabase
                .from('questions')
                .update({ curriculum_id: curriculumId })
                .is('curriculum_id', null)
                .select('id');

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            return NextResponse.json({
                success: true,
                message: `Updated ${data?.length || 0} questions to use curriculum`,
                updatedCount: data?.length || 0
            });
        }

        // Update all questions with null curriculum_id to CBC
        const { data, error } = await supabase
            .from('questions')
            .update({ curriculum_id: cbcCurriculum.id })
            .is('curriculum_id', null)
            .select('id');

        if (error) {
            console.error('Error updating questions:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: `Updated ${data?.length || 0} questions to CBC curriculum`,
            updatedCount: data?.length || 0,
            curriculumId: cbcCurriculum.id
        });

    } catch (error: any) {
        console.error('Fix questions error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
