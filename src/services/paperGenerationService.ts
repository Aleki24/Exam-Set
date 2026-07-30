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

    // Exclude already used questions in this paper. UUIDs are quoted because an
    // unquoted PostgREST `in` list breaks on any value it cannot parse cleanly.
    if (excludeIds.length > 0) {
        const quoted = excludeIds.map(id => `"${id}"`).join(',');
        query = query.not('id', 'in', `(${quoted})`);
    }

    // Order by usage count to prefer less-used questions
    query = query.order('usage_count', { ascending: true });

    // Pull a generous pool so randomisation has room to work. Sections asking
    // for many questions previously hit the old flat ceiling and came back
    // short, which is what made large papers impossible to generate.
    const fetchLimit = Math.max(section.question_count * 5, 100);
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

        // Draw from a shuffled pool, skipping anything already placed in an
        // earlier section of this same paper.
        const pool = shuffleArray(availableQuestions).filter(q => !usedQuestionIds.includes(q.id));

        let selectedQuestions = pool.slice(0, sectionConfig.question_count);

        // Order within the section. Without this reassignment the shuffle was
        // computed and thrown away, so `shuffle_within_sections` did nothing.
        if (template.shuffle_within_sections) {
            selectedQuestions = shuffleArray(selectedQuestions);
        }

        // Track used IDs
        selectedQuestions.forEach(q => usedQuestionIds.push(q.id));

        // Section marks come from the questions actually drawn. Multiplying the
        // requested count by marks_per_question overstated the total whenever a
        // section came back short or held questions of differing weight.
        const sectionMarks = selectedQuestions.reduce((sum, q) => {
            const subPartMarks = (q.subParts || []).reduce((s, p) => s + (Number(p.marks) || 0), 0);
            return sum + (subPartMarks > 0 ? subPartMarks : Number(q.marks) || sectionConfig.marks_per_question);
        }, 0);

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

    if (missingQuestions.length === 0) return paper;

    // Second pass: refill the short sections with the section-type and topic
    // constraints dropped, keeping only subject/grade. A paper that is a few
    // questions light is more useful than one that silently comes back short.
    const supabase = createClient();
    const alreadyUsed = new Set(paper.sections.flatMap(s => s.questions.map(q => q.id)));

    for (const { sectionIndex, missing } of missingQuestions) {
        const section = paper.sections[sectionIndex];
        const config = paper.template.sections[sectionIndex];

        let query = supabase.from('questions').select('*').order('usage_count', { ascending: true });

        const subjectId = options.subjectId || paper.template.subject_id;
        const gradeId = options.gradeId || paper.template.grade_id;
        if (subjectId) query = query.eq('subject_id', subjectId);
        if (gradeId) query = query.eq('grade_id', gradeId);

        const { data } = await query.limit(missing * 5 + 50);
        const replacements = shuffleArray(data || [])
            .filter(q => !alreadyUsed.has(q.id))
            .slice(0, missing);

        if (replacements.length === 0) continue;

        replacements.forEach(q => alreadyUsed.add(q.id));
        section.questions = section.questions.concat(replacements);
        section.section_marks += replacements.reduce(
            (sum, q) => sum + (Number(q.marks) || config.marks_per_question),
            0
        );
        paper.usedQuestionIds.push(...replacements.map(q => q.id));
    }

    // Recompute the paper totals after refilling.
    paper.totalMarks = paper.sections.reduce((sum, s) => sum + s.section_marks, 0);
    paper.totalQuestions = paper.sections.reduce((sum, s) => sum + s.questions.length, 0);

    const stillShort = paper.sections.filter(
        (s, i) => s.questions.length < (paper.template.sections[i]?.question_count || 0)
    );
    if (stillShort.length > 0) {
        console.warn(
            'Question bank is too small to fill every section:',
            stillShort.map(s => `${s.section_label} (${s.questions.length} questions)`)
        );
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
