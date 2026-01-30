import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Map section types to question types
const SECTION_TYPE_MAPPING: Record<string, string[]> = {
    multiple_choice: ['Multiple Choice'],
    true_false: ['True/False'],
    structured: ['Structured', 'Short Answer'],
    essay: ['Essay'],
    matching: ['Matching'],
    fill_blanks: ['Fill in the Blanks'],
    calculation: ['Numeric', 'Calculation'],
    diagram_labeling: ['Diagram Labeling'],
    comprehension: ['Comprehension'],
    practical: ['Practical'],
    general: [], // Any type allowed
};

interface SectionConfig {
    section_label: string;
    name: string;
    section_type: string;
    question_count: number;
    marks_per_question: number;
    topics?: string[];
    instructions?: string;
}

interface GeneratedSection {
    label: string;
    name: string;
    sectionType: string;
    questions: any[];
    requiredCount: number;
    actualCount: number;
    marksPerQuestion: number;
    totalMarks: number;
    instructions?: string;
}

// POST: Generate a paper from a template
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const body = await request.json();

        const { templateId, options = {} } = body;

        if (!templateId) {
            return NextResponse.json({ error: 'templateId is required' }, { status: 400 });
        }

        // Fetch the template
        const { data: template, error: templateError } = await supabase
            .from('paper_templates')
            .select(`
                *,
                subjects:subject_id (name),
                grades:grade_id (name)
            `)
            .eq('id', templateId)
            .single();

        if (templateError || !template) {
            return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }

        const sections: SectionConfig[] = template.sections || [];
        const generatedSections: GeneratedSection[] = [];
        const warnings: string[] = [];
        const usedQuestionIds = new Set<string>();

        // Process each section
        for (const section of sections) {
            const questionTypes = SECTION_TYPE_MAPPING[section.section_type] || [];

            // Build query for questions
            let query = supabase
                .from('questions')
                .select('*')
                .eq('marks', section.marks_per_question); // Exact marks matching

            // Filter by subject if template has one
            if (template.subject_id) {
                query = query.eq('subject_id', template.subject_id);
            }

            // Filter by grade if template has one
            if (template.grade_id) {
                query = query.eq('grade_id', template.grade_id);
            }

            // Filter by question types if not 'general'
            if (questionTypes.length > 0) {
                query = query.in('type', questionTypes);
            }

            // Filter by topics if specified in section
            if (section.topics && section.topics.length > 0) {
                query = query.in('topic', section.topics);
            }

            // Filter by preferred topics from options
            if (options.preferTopics && options.preferTopics.length > 0) {
                query = query.in('topic', options.preferTopics);
            }

            const { data: questions, error: questionsError } = await query;

            if (questionsError) {
                console.error('Error fetching questions for section:', questionsError);
                warnings.push(`Error fetching questions for Section ${section.section_label}`);
                continue;
            }

            // Filter out already-used questions
            let availableQuestions = (questions || []).filter(q => !usedQuestionIds.has(q.id));

            // Shuffle if enabled
            if (template.shuffle_within_sections) {
                availableQuestions = shuffleArray(availableQuestions);
            }

            // Take only the required count
            const selectedQuestions = availableQuestions.slice(0, section.question_count);

            // Track used question IDs
            selectedQuestions.forEach(q => usedQuestionIds.add(q.id));

            // Check if we have enough questions
            if (selectedQuestions.length < section.question_count) {
                const typesLabel = questionTypes.length > 0 ? questionTypes.join('/') : 'any type';
                warnings.push(
                    `Section ${section.section_label} (${section.name || typesLabel}): ` +
                    `Only ${selectedQuestions.length} of ${section.question_count} required ` +
                    `${section.marks_per_question}-mark questions available`
                );
            }

            generatedSections.push({
                label: section.section_label,
                name: section.name || `Section ${section.section_label}`,
                sectionType: section.section_type,
                questions: selectedQuestions,
                requiredCount: section.question_count,
                actualCount: selectedQuestions.length,
                marksPerQuestion: section.marks_per_question,
                totalMarks: selectedQuestions.length * section.marks_per_question,
                instructions: section.instructions,
            });
        }

        // Calculate totals
        const totalMarksAchieved = generatedSections.reduce((sum, s) => sum + s.totalMarks, 0);
        const totalQuestionsAchieved = generatedSections.reduce((sum, s) => sum + s.actualCount, 0);
        const totalQuestionsRequired = sections.reduce((sum, s) => sum + s.question_count, 0);

        const isComplete = totalMarksAchieved === template.total_marks &&
            totalQuestionsAchieved === totalQuestionsRequired;

        return NextResponse.json({
            success: true,
            paper: {
                templateId: template.id,
                templateName: template.name,
                subjectName: template.subjects?.name,
                gradeName: template.grades?.name,
                timeLimit: template.time_limit,
                targetTotalMarks: template.total_marks,
                achievedTotalMarks: totalMarksAchieved,
                sections: generatedSections,
            },
            isComplete,
            warnings,
            summary: {
                totalQuestions: totalQuestionsAchieved,
                requiredQuestions: totalQuestionsRequired,
                totalMarks: totalMarksAchieved,
                requiredMarks: template.total_marks,
            }
        });

    } catch (error) {
        console.error('Error generating paper:', error);
        return NextResponse.json({ error: 'Failed to generate paper' }, { status: 500 });
    }
}

// Fisher-Yates shuffle
function shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}
