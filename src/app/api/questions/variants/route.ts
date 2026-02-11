import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// POST /api/questions/variants - Generate variant questions
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const body = await request.json();
        const { question_id, variant_type } = body;

        if (!question_id) {
            return NextResponse.json({ error: 'question_id is required' }, { status: 400 });
        }

        // Fetch the original question
        const { data: original, error: fetchError } = await supabase
            .from('questions')
            .select('*')
            .eq('id', question_id)
            .single();

        if (fetchError || !original) {
            return NextResponse.json({ error: 'Question not found' }, { status: 404 });
        }

        const variants = generateVariants(original, variant_type || 'all');

        return NextResponse.json({ variants, original_id: question_id });
    } catch (error) {
        console.error('Error generating variants:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// Generate question variants based on type
function generateVariants(question: Record<string, unknown>, variantType: string) {
    const variants: Record<string, unknown>[] = [];

    const text = question.text as string;
    const type = question.type as string;
    const options = question.options as string[] | null;
    const marks = question.marks as number;
    const difficulty = question.difficulty as string;

    // Difficulty variants
    if (variantType === 'all' || variantType === 'difficulty') {
        const difficulties = ['Easy', 'Medium', 'Difficult'];
        const otherDifficulties = difficulties.filter((d) => d !== difficulty);

        for (const diff of otherDifficulties) {
            const marksAdjust = diff === 'Easy' ? Math.max(1, marks - 1) : diff === 'Difficult' ? marks + 1 : marks;
            variants.push({
                ...question,
                id: undefined,
                created_at: undefined,
                difficulty: diff,
                marks: marksAdjust,
                text: text,
                variant_type: 'difficulty',
                variant_label: `${diff} difficulty variant`,
            });
        }
    }

    // Type conversion variants
    if (variantType === 'all' || variantType === 'type') {
        if (type === 'Multiple Choice' && options) {
            // Convert MCQ to True/False
            variants.push({
                ...question,
                id: undefined,
                created_at: undefined,
                type: 'True/False',
                options: null,
                text: `True or False: ${stripHTML(text)}`,
                variant_type: 'type',
                variant_label: 'True/False conversion',
            });

            // Convert MCQ to Short Answer
            variants.push({
                ...question,
                id: undefined,
                created_at: undefined,
                type: 'Short Answer',
                options: null,
                text: text,
                variant_type: 'type',
                variant_label: 'Short Answer conversion',
            });
        }

        if (type === 'Short Answer') {
            // Convert Short Answer to Essay
            variants.push({
                ...question,
                id: undefined,
                created_at: undefined,
                type: 'Essay',
                marks: Math.max(marks, 5),
                text: `Explain in detail: ${stripHTML(text)}`,
                variant_type: 'type',
                variant_label: 'Essay expansion',
            });
        }

        if (type === 'True/False') {
            // Convert True/False to Explain
            variants.push({
                ...question,
                id: undefined,
                created_at: undefined,
                type: 'Short Answer',
                marks: marks + 2,
                text: `${stripHTML(text)} Explain your reasoning.`,
                variant_type: 'type',
                variant_label: 'Short Answer with reasoning',
            });
        }
    }

    // Bloom's level variants
    if (variantType === 'all' || variantType === 'blooms') {
        const currentBlooms = question.blooms_level as string;
        const bloomsProgression: Record<string, { level: string; prefix: string }> = {
            'Knowledge': { level: 'Understanding', prefix: 'Explain why' },
            'Understanding': { level: 'Application', prefix: 'Apply the concept of' },
            'Application': { level: 'Analysis', prefix: 'Analyze' },
            'Analysis': { level: 'Evaluation', prefix: 'Evaluate' },
            'Evaluation': { level: 'Creation', prefix: 'Design' },
        };

        if (currentBlooms && bloomsProgression[currentBlooms]) {
            const next = bloomsProgression[currentBlooms];
            variants.push({
                ...question,
                id: undefined,
                created_at: undefined,
                blooms_level: next.level,
                marks: marks + 1,
                text: `${next.prefix}: ${stripHTML(text)}`,
                variant_type: 'blooms',
                variant_label: `${next.level} level variant`,
            });
        }
    }

    // Shuffled options (for MCQ)
    if ((variantType === 'all' || variantType === 'shuffle') && options && options.length > 1) {
        const shuffled = [...options].sort(() => Math.random() - 0.5);
        variants.push({
            ...question,
            id: undefined,
            created_at: undefined,
            options: shuffled,
            variant_type: 'shuffle',
            variant_label: 'Shuffled options',
        });
    }

    return variants;
}

function stripHTML(html: string): string {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}
