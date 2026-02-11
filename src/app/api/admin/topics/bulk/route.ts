import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const body = await request.json();

        // data should be { subject_id: string, topics: { name: string, description?: string, topic_number?: number }[] }
        const { subject_id, topics } = body;

        if (!subject_id || !topics || !Array.isArray(topics) || topics.length === 0) {
            return NextResponse.json(
                { error: 'subject_id and topics array are required' },
                { status: 400 }
            );
        }

        // 1. Get current max topic number for this subject to start numbering from
        // If some topics have numbers, we might need to handle conflicts, 
        // but for a simple "Append" bulk action, we can just find the max and increment.
        const { data: maxTopic } = await supabase
            .from('subject_topics')
            .select('topic_number')
            .eq('subject_id', subject_id)
            .order('topic_number', { ascending: false })
            .limit(1)
            .single();

        let currentMaxNumber = maxTopic?.topic_number || 0;

        // 2. Prepare data for insertion
        const topicsToInsert = topics.map((t: any, index: number) => {
             // If topic_number is provided in input, use it (user might have manually numbered them), 
             // otherwise increment.
            const topicNumber = t.topic_number || (currentMaxNumber + index + 1);
            
            // If user provided a number that is higher than our counter, update counter to avoid collision for subsequent ones?
            // Actually, let's just stick to the rule: if provided use it, if not, auto-increment from *current max of DB* + *index offset*.
            // But if the user provides numbers for *some* and not others, it gets messy. 
            // Simple logic: If topic_number is NOT provided, assign (currentMaxNumber + 1). 
            // WAIT - if we do that in a loop, currentMaxNumber needs to increment.
            
            if (!t.topic_number) {
                currentMaxNumber++;
            }
            
            return {
                subject_id,
                topic_number: t.topic_number || currentMaxNumber,
                name: t.name,
                description: t.description || null
            };
        });

        // 3. Insert
        const { data, error } = await supabase
            .from('subject_topics')
            .insert(topicsToInsert)
            .select();

        if (error) {
            console.error('Error creating bulk topics:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ 
            message: `Successfully added ${data.length} topics`,
            topics: data 
        }, { status: 201 });

    } catch (error) {
        console.error('Error in bulk topics POST:', error);
        return NextResponse.json({ error: 'Failed to create topics' }, { status: 500 });
    }
}
