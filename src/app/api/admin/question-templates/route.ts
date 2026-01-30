import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// GET: Fetch question templates
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { searchParams } = new URL(request.url);
        const subjectId = searchParams.get('subject_id');
        const gradeId = searchParams.get('grade_id');
        const type = searchParams.get('type');

        let query = supabase
            .from('question_templates')
            .select(`
                *,
                subjects:subject_id (name),
                grades:grade_id (name)
            `)
            .order('is_system', { ascending: false })
            .order('usage_count', { ascending: false });

        // Filter by subject if provided (include null for generic templates)
        if (subjectId) {
            query = query.or(`subject_id.eq.${subjectId},subject_id.is.null`);
        }

        // Filter by grade if provided (include null for generic templates)
        if (gradeId) {
            query = query.or(`grade_id.eq.${gradeId},grade_id.is.null`);
        }

        // Filter by type if provided
        if (type) {
            query = query.eq('type', type);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching question templates:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Transform data
        const templates = (data || []).map((row: any) => ({
            id: row.id,
            name: row.name,
            description: row.description,
            type: row.type,
            marks: row.marks,
            difficulty: row.difficulty,
            blooms_level: row.blooms_level,
            subject_id: row.subject_id,
            grade_id: row.grade_id,
            topic: row.topic,
            default_options_count: row.default_options_count,
            expected_length: row.expected_length,
            is_system: row.is_system,
            usage_count: row.usage_count,
            subject_name: row.subjects?.name,
            grade_name: row.grades?.name,
        }));

        return NextResponse.json({ templates });
    } catch (error) {
        console.error('Error in question templates GET:', error);
        return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
    }
}

// POST: Create a new question template
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const body = await request.json();

        const templateData = {
            name: body.name,
            description: body.description || null,
            type: body.type || 'Structured',
            marks: body.marks || 1,
            difficulty: body.difficulty || 'Medium',
            blooms_level: body.blooms_level || 'Knowledge',
            subject_id: body.subject_id || null,
            grade_id: body.grade_id || null,
            topic: body.topic || null,
            default_options_count: body.default_options_count || 4,
            expected_length: body.expected_length || null,
            is_system: false,
        };

        if (!templateData.name) {
            return NextResponse.json({ error: 'name is required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('question_templates')
            .insert(templateData)
            .select()
            .single();

        if (error) {
            console.error('Error creating question template:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ template: data, success: true }, { status: 201 });
    } catch (error) {
        console.error('Error in question templates POST:', error);
        return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
    }
}

// PATCH: Update template usage count or other fields
export async function PATCH(request: NextRequest) {
    try {
        const supabase = await createClient();
        const body = await request.json();
        const { id, increment_usage, ...updates } = body;

        if (!id) {
            return NextResponse.json({ error: 'Template ID required' }, { status: 400 });
        }

        if (increment_usage) {
            // Increment usage count
            const { data: current } = await supabase
                .from('question_templates')
                .select('usage_count')
                .eq('id', id)
                .single();

            const newCount = (current?.usage_count || 0) + 1;

            await supabase
                .from('question_templates')
                .update({ usage_count: newCount, updated_at: new Date().toISOString() })
                .eq('id', id);

            return NextResponse.json({ success: true, usage_count: newCount });
        }

        // Regular update
        const allowedFields = ['name', 'description', 'type', 'marks', 'difficulty', 'blooms_level', 'topic'];
        const filteredUpdates: Record<string, any> = { updated_at: new Date().toISOString() };

        for (const key of allowedFields) {
            if (updates[key] !== undefined) {
                filteredUpdates[key] = updates[key];
            }
        }

        const { data, error } = await supabase
            .from('question_templates')
            .update(filteredUpdates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ template: data, success: true });
    } catch (error) {
        console.error('Error in question templates PATCH:', error);
        return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
    }
}

// DELETE: Delete a question template
export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Template ID required' }, { status: 400 });
        }

        // Don't allow deleting system templates
        const { data: template } = await supabase
            .from('question_templates')
            .select('is_system')
            .eq('id', id)
            .single();

        if (template?.is_system) {
            return NextResponse.json({ error: 'Cannot delete system templates' }, { status: 403 });
        }

        const { error } = await supabase
            .from('question_templates')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting question template:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error in question templates DELETE:', error);
        return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
    }
}
