import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// GET /api/questions/[id] - Get single question
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();

        const { data, error } = await supabase
            .from('questions')
            .select(`
                *,
                curriculums:curriculum_id(name),
                grades:grade_id(name),
                subjects:subject_id(name)
            `)
            .eq('id', id)
            .single();

        if (error) {
            console.error('Error fetching question:', error);
            return NextResponse.json({ error: error.message }, { status: 404 });
        }

        return NextResponse.json({
            ...data,
            curriculum_name: data.curriculums?.name,
            grade_name: data.grades?.name,
            subject_name: data.subjects?.name,
        });
    } catch (error: any) {
        console.error('Question GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PATCH /api/questions/[id] - Update question
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();
        const updates = await request.json();

        // Map frontend field names to database field names
        const dbUpdates: Record<string, any> = {};
        const fieldMap: Record<string, string> = {
            markingScheme: 'marking_scheme',
            bloomsLevel: 'blooms_level',
            imagePath: 'image_path',
            imageCaption: 'image_caption',
            hasLatex: 'has_latex',
            matchingPairs: 'matching_pairs',
            expectedLength: 'expected_length',
            isAiGenerated: 'is_ai_generated',
        };

        for (const [key, value] of Object.entries(updates)) {
            const dbKey = fieldMap[key] || key;
            dbUpdates[dbKey] = value;
        }

        const { data, error } = await supabase
            .from('questions')
            .update(dbUpdates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating question:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, question: data });
    } catch (error: any) {
        console.error('Question PATCH error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE /api/questions/[id] - Delete question
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();

        const { error } = await supabase
            .from('questions')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting question:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Question DELETE error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
