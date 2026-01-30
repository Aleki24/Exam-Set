import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// ============================================================================
// PAPER GENERATION API
// Generates exam papers from templates
// ============================================================================

/**
 * Fisher-Yates shuffle algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// POST: Generate a paper from a template
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const body = await request.json();

        const {
            template_id,
            subject_id,    // Optional override
            grade_id,      // Optional override
            exclude_question_ids = []  // Questions to exclude
        } = body;

        if (!template_id) {
            return NextResponse.json(
                { error: 'template_id is required' },
                { status: 400 }
            );
        }

        // 1. Fetch the template
        const { data: template, error: templateError } = await supabase
            .from('paper_templates')
            .select('*')
            .eq('id', template_id)
            .single();

        if (templateError || !template) {
            return NextResponse.json(
                { error: 'Template not found' },
                { status: 404 }
            );
        }

        // Use provided IDs or template defaults
        const finalSubjectId = subject_id || template.subject_id;
        const finalGradeId = grade_id || template.grade_id;

        // Track used question IDs to prevent duplicates
        const usedQuestionIds: string[] = [...exclude_question_ids];
        const generatedSections = [];

        // 2. Get sections from template
        let sections = template.sections || [];

        // Optionally shuffle section order
        if (template.shuffle_sections) {
            sections = shuffleArray(sections);
        }

        // 3. Generate each section
        for (const sectionConfig of sections) {
            // Build query for questions matching section criteria
            let query = supabase
                .from('questions')
                .select(`
                    *,
                    subjects:subject_id (name),
                    grades:grade_id (name)
                `);

            // Apply filters
            if (finalSubjectId) {
                query = query.eq('subject_id', finalSubjectId);
            }
            if (finalGradeId) {
                query = query.eq('grade_id', finalGradeId);
            }

            // Section type filter
            if (sectionConfig.section_type && sectionConfig.section_type !== 'general') {
                query = query.eq('section_type', sectionConfig.section_type);
            }

            // Topic filter - if section has specific topics
            if (sectionConfig.topics && sectionConfig.topics.length > 0) {
                // Get topic IDs for the given topic numbers
                const { data: topicData } = await supabase
                    .from('subject_topics')
                    .select('id')
                    .eq('subject_id', finalSubjectId)
                    .in('topic_number', sectionConfig.topics);

                if (topicData && topicData.length > 0) {
                    const topicIds = topicData.map((t: any) => t.id);
                    query = query.in('topic_id', topicIds);
                }
            }

            // Order by usage count to prefer less-used questions
            query = query.order('usage_count', { ascending: true });

            // Get more questions than needed for better randomization
            const fetchLimit = Math.max(sectionConfig.question_count * 3, 20);
            query = query.limit(fetchLimit);

            const { data: availableQuestions, error: questionsError } = await query;

            if (questionsError) {
                console.error('Error fetching questions for section:', questionsError);
                continue;
            }

            // Filter out already used questions
            let filteredQuestions = (availableQuestions || []).filter(
                (q: any) => !usedQuestionIds.includes(q.id)
            );

            // Shuffle the available questions
            filteredQuestions = shuffleArray(filteredQuestions);

            // Select required number of questions
            const selectedQuestions = filteredQuestions.slice(0, sectionConfig.question_count);

            // Track used IDs
            selectedQuestions.forEach((q: any) => usedQuestionIds.push(q.id));

            // Calculate section marks
            const sectionMarks = selectedQuestions.length * sectionConfig.marks_per_question;

            // Transform questions
            const transformedQuestions = selectedQuestions.map((q: any) => ({
                id: q.id,
                text: q.text,
                marks: sectionConfig.marks_per_question, // Use template's marks
                difficulty: q.difficulty,
                topic: q.topic,
                subtopic: q.subtopic,
                type: q.type,
                options: q.options,
                matching_pairs: q.matching_pairs,
                marking_scheme: q.marking_scheme,
                image_path: q.image_path,
                image_caption: q.image_caption,
                subject_name: q.subjects?.name,
                grade_name: q.grades?.name
            }));

            generatedSections.push({
                section_label: sectionConfig.section_label,
                name: sectionConfig.name,
                section_type: sectionConfig.section_type,
                instructions: sectionConfig.instructions,
                questions: transformedQuestions,
                question_count: transformedQuestions.length,
                expected_count: sectionConfig.question_count,
                section_marks: sectionMarks,
                is_complete: transformedQuestions.length >= sectionConfig.question_count
            });
        }

        // 4. Calculate totals
        const totalMarks = generatedSections.reduce((sum: number, s: any) => sum + s.section_marks, 0);
        const totalQuestions = generatedSections.reduce((sum: number, s: any) => sum + s.questions.length, 0);
        const allComplete = generatedSections.every((s: any) => s.is_complete);

        // 5. Return generated paper
        return NextResponse.json({
            success: true,
            paper: {
                template_id: template.id,
                template_name: template.name,
                subject_id: finalSubjectId,
                grade_id: finalGradeId,
                time_limit: template.time_limit,
                sections: generatedSections,
                total_marks: totalMarks,
                expected_marks: template.total_marks,
                total_questions: totalQuestions,
                is_complete: allComplete,
                generated_at: new Date().toISOString(),
                used_question_ids: usedQuestionIds.filter(id => !exclude_question_ids.includes(id))
            },
            warnings: allComplete ? [] : ['Some sections have fewer questions than expected. Consider adding more questions to the bank.']
        });

    } catch (error) {
        console.error('Error generating paper:', error);
        return NextResponse.json(
            { error: 'Failed to generate paper' },
            { status: 500 }
        );
    }
}

// GET: Get available templates for a subject/grade
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { searchParams } = new URL(request.url);
        const subjectId = searchParams.get('subject_id');
        const gradeId = searchParams.get('grade_id');

        let query = supabase
            .from('paper_templates')
            .select(`
                *,
                subjects:subject_id (name),
                grades:grade_id (name)
            `)
            .order('is_default', { ascending: false })
            .order('name', { ascending: true });

        if (subjectId) {
            query = query.eq('subject_id', subjectId);
        }
        if (gradeId) {
            query = query.eq('grade_id', gradeId);
        }

        const { data, error } = await query;

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const templates = (data || []).map((row: any) => ({
            id: row.id,
            name: row.name,
            description: row.description,
            total_marks: row.total_marks,
            time_limit: row.time_limit,
            section_count: row.sections?.length || 0,
            is_default: row.is_default,
            subject_name: row.subjects?.name,
            grade_name: row.grades?.name
        }));

        return NextResponse.json({ templates });
    } catch (error) {
        console.error('Error fetching templates:', error);
        return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
    }
}
