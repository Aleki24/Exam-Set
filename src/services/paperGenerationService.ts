import { createClient } from '@/utils/supabase/client';
import {
    PaperTemplate,
    TemplateSectionConfig,
    DBQuestion,
    QuestionSectionType
} from '@/types';

// ============================================================================
// PAPER GENERATION SERVICE
// Generates exam papers from templates using question pool
// ============================================================================

/**
 * Fisher-Yates shuffle algorithm for random permutation
 * Ensures unbiased randomization of questions
 */
export function shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Result of paper generation
 */
export interface GeneratedPaper {
    template: PaperTemplate;
    sections: GeneratedSection[];
    totalMarks: number;
    totalQuestions: number;
    generatedAt: string;
    usedQuestionIds: string[];
}

export interface GeneratedSection {
    section_label: string;
    name: string;
    section_type: QuestionSectionType;
    instructions?: string;
    questions: DBQuestion[];
    section_marks: number;
}

/**
 * Options for paper generation
 */
export interface GenerationOptions {
    excludeQuestionIds?: string[];  // Questions to exclude (already used recently)
    preferUnused?: boolean;         // Prioritize questions with lower usage_count
    subjectId?: string;             // Override subject from template
    gradeId?: string;               // Override grade from template
}

/**
 * Fetches questions matching section criteria
 */
async function fetchQuestionsForSection(
    supabase: ReturnType<typeof createClient>,
    section: TemplateSectionConfig,
    subjectId: string | undefined,
    gradeId: string | undefined,
    excludeIds: string[]
): Promise<DBQuestion[]> {
    let query = supabase
        .from('questions')
        .select('*');

    // Apply filters
    if (subjectId) {
        query = query.eq('subject_id', subjectId);
    }
    if (gradeId) {
        query = query.eq('grade_id', gradeId);
    }

    // Section type filter (if stored in questions)
    if (section.section_type && section.section_type !== 'general') {
        query = query.eq('section_type', section.section_type);
    }

    // Topic filter - if section has specific topics
    if (section.topics && section.topics.length > 0) {
        // Get topic IDs for the given topic numbers
        const { data: topicData } = await supabase
            .from('subject_topics')
            .select('id')
            .eq('subject_id', subjectId)
            .in('topic_number', section.topics);

        if (topicData && topicData.length > 0) {
            const topicIds = topicData.map(t => t.id);
            query = query.in('topic_id', topicIds);
        }
    }

    // Exclude already used questions in this paper
    if (excludeIds.length > 0) {
        query = query.not('id', 'in', `(${excludeIds.join(',')})`);
    }

    // Order by usage count to prefer less-used questions
    query = query.order('usage_count', { ascending: true });

    // Get more questions than needed for better randomization
    const fetchLimit = Math.max(section.question_count * 3, 20);
    query = query.limit(fetchLimit);

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching questions for section:', error);
        return [];
    }

    return data || [];
}

/**
 * Main paper generation function
 */
export async function generatePaper(
    templateId: string,
    options: GenerationOptions = {}
): Promise<GeneratedPaper | null> {
    const supabase = createClient();

    // 1. Fetch the template
    const { data: templateData, error: templateError } = await supabase
        .from('paper_templates')
        .select('*')
        .eq('id', templateId)
        .single();

    if (templateError || !templateData) {
        console.error('Failed to fetch template:', templateError);
        return null;
    }

    const template: PaperTemplate = {
        ...templateData,
        sections: templateData.sections || []
    };

    // Use provided IDs or template defaults
    const subjectId = options.subjectId || template.subject_id;
    const gradeId = options.gradeId || template.grade_id;

    // Track all used question IDs to prevent duplicates
    const usedQuestionIds: string[] = [...(options.excludeQuestionIds || [])];
    const generatedSections: GeneratedSection[] = [];

    // 2. Generate each section
    let sections = template.sections;

    // Optionally shuffle section order
    if (template.shuffle_sections) {
        sections = shuffleArray(sections);
    }

    for (const sectionConfig of sections) {
        // Fetch matching questions
        const availableQuestions = await fetchQuestionsForSection(
            supabase,
            sectionConfig,
            subjectId,
            gradeId,
            usedQuestionIds
        );

        // Shuffle the available questions
        let shuffledQuestions = shuffleArray(availableQuestions);

        // Select required number of questions
        const selectedQuestions = shuffledQuestions.slice(0, sectionConfig.question_count);

        // If shuffle_within_sections is enabled, shuffle again for final order
        if (template.shuffle_within_sections) {
            shuffledQuestions = shuffleArray(selectedQuestions);
        }

        // Track used IDs
        selectedQuestions.forEach(q => usedQuestionIds.push(q.id));

        // Calculate section marks
        const sectionMarks = selectedQuestions.length * sectionConfig.marks_per_question;

        generatedSections.push({
            section_label: sectionConfig.section_label,
            name: sectionConfig.name,
            section_type: sectionConfig.section_type,
            instructions: sectionConfig.instructions,
            questions: selectedQuestions,
            section_marks: sectionMarks
        });
    }

    // 3. Calculate totals
    const totalMarks = generatedSections.reduce((sum, s) => sum + s.section_marks, 0);
    const totalQuestions = generatedSections.reduce((sum, s) => sum + s.questions.length, 0);

    return {
        template,
        sections: generatedSections,
        totalMarks,
        totalQuestions,
        generatedAt: new Date().toISOString(),
        usedQuestionIds: usedQuestionIds.filter(id => !options.excludeQuestionIds?.includes(id))
    };
}

/**
 * Generate paper from template with fallback for missing questions
 * Tries to fill sections even if not all criteria match perfectly
 */
export async function generatePaperWithFallback(
    templateId: string,
    options: GenerationOptions = {}
): Promise<GeneratedPaper | null> {
    // First try strict generation
    const paper = await generatePaper(templateId, options);

    if (!paper) return null;

    // Check if any sections are short on questions
    const missingQuestions: { sectionIndex: number; missing: number }[] = [];

    paper.sections.forEach((section, index) => {
        const expected = paper.template.sections[index]?.question_count || 0;
        if (section.questions.length < expected) {
            missingQuestions.push({
                sectionIndex: index,
                missing: expected - section.questions.length
            });
        }
    });

    if (missingQuestions.length > 0) {
        console.warn('Some sections have fewer questions than expected:', missingQuestions);
        // In a production system, you might want to:
        // 1. Try fetching with relaxed criteria
        // 2. Log this for the admin to add more questions
        // 3. Return a warning to the user
    }

    return paper;
}

/**
 * Get templates for a subject/grade combination
 */
export async function getTemplatesForSubject(
    subjectId?: string,
    gradeId?: string
): Promise<PaperTemplate[]> {
    const supabase = createClient();

    let query = supabase
        .from('paper_templates')
        .select(`
            *,
            subjects:subject_id (name),
            grades:grade_id (name)
        `)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

    if (subjectId) {
        query = query.eq('subject_id', subjectId);
    }
    if (gradeId) {
        query = query.eq('grade_id', gradeId);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching templates:', error);
        return [];
    }

    return (data || []).map((row: any) => ({
        ...row,
        sections: row.sections || [],
        subject_name: row.subjects?.name,
        grade_name: row.grades?.name
    }));
}

/**
 * Get topics for a subject
 */
export async function getTopicsForSubject(subjectId: string) {
    const supabase = createClient();

    const { data, error } = await supabase
        .from('subject_topics')
        .select('*')
        .eq('subject_id', subjectId)
        .order('topic_number', { ascending: true });

    if (error) {
        console.error('Error fetching topics:', error);
        return [];
    }

    return data || [];
}
