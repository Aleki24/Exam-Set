import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// GET: Fetch paper templates
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { searchParams } = new URL(request.url);
        const subjectId = searchParams.get('subject_id');
        const gradeId = searchParams.get('grade_id');
        const id = searchParams.get('id');

        let query = supabase
            .from('paper_templates')
            .select(`
                *,
                subjects:subject_id (name),
                grades:grade_id (name)
            `)
            .order('created_at', { ascending: false });

        if (id) {
            query = query.eq('id', id);
        }
        if (subjectId) {
            query = query.eq('subject_id', subjectId);
        }
        if (gradeId) {
            query = query.eq('grade_id', gradeId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching templates:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Transform data
        const templates = (data || []).map((row: any) => ({
            id: row.id,
            name: row.name,
            description: row.description,
            subject_id: row.subject_id,
            grade_id: row.grade_id,
            total_marks: row.total_marks,
            time_limit: row.time_limit,
            sections: row.sections || [],
            shuffle_within_sections: row.shuffle_within_sections,
            shuffle_sections: row.shuffle_sections,
            is_default: row.is_default,
            created_by: row.created_by,
            created_at: row.created_at,
            updated_at: row.updated_at,
            subject_name: row.subjects?.name,
            grade_name: row.grades?.name
        }));

        // If fetching single template by id
        if (id) {
            return NextResponse.json({ template: templates[0] || null });
        }

        return NextResponse.json({ templates });
    } catch (error) {
        console.error('Error in templates GET:', error);
        return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
    }
}

// POST: Create a new paper template
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const body = await request.json();

        const {
            name,
            description,
            subject_id,
            grade_id,
            total_marks,
            time_limit,
            sections,
            shuffle_within_sections,
            shuffle_sections,
            is_default
        } = body;

        if (!name) {
            return NextResponse.json({ error: 'name is required' }, { status: 400 });
        }

        if (!sections || !Array.isArray(sections) || sections.length === 0) {
            return NextResponse.json({ error: 'sections array is required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('paper_templates')
            .insert({
                name,
                description: description || null,
                subject_id: subject_id || null,
                grade_id: grade_id || null,
                total_marks: total_marks || 40,
                time_limit: time_limit || '1 hour',
                sections,
                shuffle_within_sections: shuffle_within_sections ?? true,
                shuffle_sections: shuffle_sections ?? false,
                is_default: is_default ?? false
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating template:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ template: data }, { status: 201 });
    } catch (error) {
        console.error('Error in templates POST:', error);
        return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
    }
}

// PUT: Update a paper template
export async function PUT(request: NextRequest) {
    try {
        const supabase = await createClient();
        const body = await request.json();

        const { id, ...updates } = body;

        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 });
        }

        // Filter allowed fields
        const allowedFields = [
            'name', 'description', 'subject_id', 'grade_id',
            'total_marks', 'time_limit', 'sections',
            'shuffle_within_sections', 'shuffle_sections', 'is_default'
        ];

        const filteredUpdates: Record<string, any> = {};
        for (const key of allowedFields) {
            if (updates[key] !== undefined) {
                filteredUpdates[key] = updates[key];
            }
        }

        const { data, error } = await supabase
            .from('paper_templates')
            .update(filteredUpdates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating template:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ template: data });
    } catch (error) {
        console.error('Error in templates PUT:', error);
        return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
    }
}

// DELETE: Delete a paper template
export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 });
        }

        const { error } = await supabase
            .from('paper_templates')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting template:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error in templates DELETE:', error);
        return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
    }
}
