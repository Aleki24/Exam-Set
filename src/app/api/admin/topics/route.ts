import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// GET: Fetch topics for a subject
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { searchParams } = new URL(request.url);
        const subjectId = searchParams.get('subject_id');

        let query = supabase
            .from('subject_topics')
            .select(`
                *,
                subjects:subject_id (name)
            `)
            .order('topic_number', { ascending: true });

        if (subjectId) {
            query = query.eq('subject_id', subjectId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching topics:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Transform to include subject_name
        const topics = (data || []).map((row: any) => ({
            id: row.id,
            subject_id: row.subject_id,
            topic_number: row.topic_number,
            name: row.name,
            description: row.description,
            created_at: row.created_at,
            subject_name: row.subjects?.name
        }));

        return NextResponse.json({ topics });
    } catch (error) {
        console.error('Error in topics GET:', error);
        return NextResponse.json({ error: 'Failed to fetch topics' }, { status: 500 });
    }
}

// POST: Create a new topic
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const body = await request.json();

        const { subject_id, topic_number, name, description } = body;

        if (!subject_id || !name) {
            return NextResponse.json(
                { error: 'subject_id and name are required' },
                { status: 400 }
            );
        }

        // Auto-generate topic_number if not provided
        let finalTopicNumber = topic_number;
        if (!finalTopicNumber) {
            const { data: maxTopic } = await supabase
                .from('subject_topics')
                .select('topic_number')
                .eq('subject_id', subject_id)
                .order('topic_number', { ascending: false })
                .limit(1)
                .single();

            finalTopicNumber = (maxTopic?.topic_number || 0) + 1;
        }

        const { data, error } = await supabase
            .from('subject_topics')
            .insert({
                subject_id,
                topic_number: finalTopicNumber,
                name,
                description: description || null
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating topic:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ topic: data }, { status: 201 });
    } catch (error) {
        console.error('Error in topics POST:', error);
        return NextResponse.json({ error: 'Failed to create topic' }, { status: 500 });
    }
}

// PUT: Update a topic
export async function PUT(request: NextRequest) {
    try {
        const supabase = await createClient();
        const body = await request.json();

        const { id, name, description, topic_number } = body;

        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 });
        }

        const updates: Record<string, any> = {};
        if (name !== undefined) updates.name = name;
        if (description !== undefined) updates.description = description;
        if (topic_number !== undefined) updates.topic_number = topic_number;

        const { data, error } = await supabase
            .from('subject_topics')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating topic:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ topic: data });
    } catch (error) {
        console.error('Error in topics PUT:', error);
        return NextResponse.json({ error: 'Failed to update topic' }, { status: 500 });
    }
}

// DELETE: Delete a topic
export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 });
        }

        const { error } = await supabase
            .from('subject_topics')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting topic:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error in topics DELETE:', error);
        return NextResponse.json({ error: 'Failed to delete topic' }, { status: 500 });
    }
}
