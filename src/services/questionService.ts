import { createClient } from '@/utils/supabase/client';
import {
    Question,
    DBQuestion,
    QuestionFilters,
    ExamTerm,
    DBCurriculum,
    DBGrade,
    DBSubject
} from '@/types';

// ============================================================================
// LOOKUP DATA FUNCTIONS
// ============================================================================

/**
 * Fetch all curriculums
 */
export async function getCurriculums(): Promise<DBCurriculum[]> {
    const supabase = createClient();
    const { data, error } = await supabase
        .from('curriculums')
        .select('*')
        .order('name');

    if (error) {
        console.error('Error fetching curriculums:', error);
        return [];
    }
    return data || [];
}

/**
 * Fetch grades for a specific curriculum
 */
export async function getGrades(curriculumId?: string): Promise<DBGrade[]> {
    const supabase = createClient();
    let query = supabase
        .from('grades')
        .select('*')
        .order('level_order');

    if (curriculumId) {
        query = query.eq('curriculum_id', curriculumId);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching grades:', error);
        return [];
    }
    return data || [];
}

/**
 * Fetch all subjects
 */
export async function getSubjects(): Promise<DBSubject[]> {
    const supabase = createClient();
    const { data, error } = await supabase
        .from('subjects')
        .select('*')
        .order('name');

    if (error) {
        console.error('Error fetching subjects:', error);
        return [];
    }
    return data || [];
}

// ============================================================================
// QUESTION CRUD OPERATIONS
// ============================================================================

/**
 * Map a Question to database format
 */
function mapQuestionToDB(question: Question, filters?: {
    curriculum_id?: string;
    grade_id?: string;
    subject_id?: string;
    term?: ExamTerm;
}): Record<string, any> {
    return {
        text: question.text,
        marks: question.marks,
        difficulty: question.difficulty,
        topic: question.topic,
        subtopic: question.subtopic,
        type: question.type,
        options: question.options || [],
        matching_pairs: question.matchingPairs || [],
        unit: question.unit,
        expected_length: question.expectedLength,
        marking_scheme: question.markingScheme,
        blooms_level: question.bloomsLevel,
        answer_schema: question.answerSchema,
        image_path: question.imagePath,
        image_caption: question.imageCaption,
        has_latex: question.hasLatex,
        graph_svg: question.graphSvg,
        sub_parts: question.subParts || [],
        curriculum_id: filters?.curriculum_id,
        grade_id: filters?.grade_id,
        subject_id: filters?.subject_id,
        term: filters?.term,
    };
}

/**
 * Map database row to Question type
 */
function mapDBToQuestion(row: any): DBQuestion {
    return {
        id: row.id,
        text: row.text,
        marks: row.marks,
        difficulty: row.difficulty,
        topic: row.topic,
        subtopic: row.subtopic,
        subject: row.subject_name || row.subject,
        curriculum: row.curriculum_name || row.curriculum,
        term: row.term,
        grade: row.grade_name || row.grade,
        type: row.type,
        options: row.options || [],
        matchingPairs: row.matching_pairs || [],
        unit: row.unit,
        expectedLength: row.expected_length,
        markingScheme: row.marking_scheme,
        bloomsLevel: row.blooms_level,
        answerSchema: row.answer_schema,
        imagePath: row.image_path,
        imageCaption: row.image_caption,
        hasLatex: row.has_latex,
        graphSvg: row.graph_svg,
        curriculum_id: row.curriculum_id,
        grade_id: row.grade_id,
        subject_id: row.subject_id,
        is_ai_generated: row.is_ai_generated,
        ai_quality_score: row.ai_quality_score,
        usage_count: row.usage_count,
        created_at: row.created_at,
        updated_at: row.updated_at,
        subParts: row.sub_parts || [],
    };
}

/**
 * Create a single question in the database
 */
export async function createQuestion(
    question: Question,
    filters?: {
        curriculum_id?: string;
        grade_id?: string;
        subject_id?: string;
        term?: ExamTerm;
    },
    isAiGenerated = false
): Promise<DBQuestion | null> {
    const supabase = createClient();

    const dbQuestion = {
        ...mapQuestionToDB(question, filters),
        is_ai_generated: isAiGenerated,
    };

    const { data, error } = await supabase
        .from('questions')
        .insert(dbQuestion)
        .select()
        .single();

    if (error) {
        console.error('Error creating question:', error);
        return null;
    }

    return mapDBToQuestion(data);
}

/**
 * Bulk create questions in the database
 */
export async function bulkCreateQuestions(
    questions: Question[],
    filters?: {
        curriculum_id?: string;
        grade_id?: string;
        subject_id?: string;
        term?: ExamTerm;
    },
    isAiGenerated = true
): Promise<DBQuestion[]> {
    const supabase = createClient();

    const dbQuestions = questions.map(q => ({
        ...mapQuestionToDB(q, filters),
        is_ai_generated: isAiGenerated,
    }));

    const { data, error } = await supabase
        .from('questions')
        .insert(dbQuestions)
        .select();

    if (error) {
        console.error('Error bulk creating questions:', error);
        return [];
    }

    return (data || []).map(mapDBToQuestion);
}

/**
 * Fetch questions with filters
 */
export async function getQuestions(filters: QuestionFilters = {}): Promise<DBQuestion[]> {
    const supabase = createClient();

    let query = supabase
        .from('questions')
        .select(`
            *,
            curriculums:curriculum_id(name),
            grades:grade_id(name),
            subjects:subject_id(name)
        `)
        .order('created_at', { ascending: false });

    // Apply filters
    if (filters.curriculum_id) {
        query = query.eq('curriculum_id', filters.curriculum_id);
    }
    if (filters.grade_id) {
        query = query.eq('grade_id', filters.grade_id);
    }
    if (filters.subject_id) {
        query = query.eq('subject_id', filters.subject_id);
    }
    if (filters.term) {
        query = query.eq('term', filters.term);
    }
    if (filters.topic) {
        query = query.ilike('topic', `%${filters.topic}%`);
    }
    if (filters.difficulty) {
        query = query.eq('difficulty', filters.difficulty);
    }
    if (filters.type) {
        query = query.eq('type', filters.type);
    }
    if (filters.blooms_level) {
        query = query.eq('blooms_level', filters.blooms_level);
    }
    if (filters.search) {
        query = query.ilike('text', `%${filters.search}%`);
    }

    // Pagination
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching questions:', error);
        return [];
    }

    return (data || []).map(row => ({
        ...mapDBToQuestion(row),
        curriculum_name: row.curriculums?.name,
        grade_name: row.grades?.name,
        subject_name: row.subjects?.name,
    }));
}

/**
 * Get a single question by ID
 */
export async function getQuestionById(id: string): Promise<DBQuestion | null> {
    const supabase = createClient();

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
        return null;
    }

    return mapDBToQuestion(data);
}

/**
 * Update a question
 */
export async function updateQuestion(
    id: string,
    updates: Partial<Question>
): Promise<DBQuestion | null> {
    const supabase = createClient();

    const dbUpdates: Record<string, any> = {};

    if (updates.text !== undefined) dbUpdates.text = updates.text;
    if (updates.marks !== undefined) dbUpdates.marks = updates.marks;
    if (updates.difficulty !== undefined) dbUpdates.difficulty = updates.difficulty;
    if (updates.topic !== undefined) dbUpdates.topic = updates.topic;
    if (updates.subtopic !== undefined) dbUpdates.subtopic = updates.subtopic;
    if (updates.type !== undefined) dbUpdates.type = updates.type;
    if (updates.options !== undefined) dbUpdates.options = updates.options;
    if (updates.matchingPairs !== undefined) dbUpdates.matching_pairs = updates.matchingPairs;
    if (updates.markingScheme !== undefined) dbUpdates.marking_scheme = updates.markingScheme;
    if (updates.bloomsLevel !== undefined) dbUpdates.blooms_level = updates.bloomsLevel;

    const { data, error } = await supabase
        .from('questions')
        .update(dbUpdates)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating question:', error);
        return null;
    }

    return mapDBToQuestion(data);
}

/**
 * Delete a question
 */
export async function deleteQuestion(id: string): Promise<boolean> {
    const supabase = createClient();

    const { error } = await supabase
        .from('questions')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting question:', error);
        return false;
    }

    return true;
}

/**
 * Increment usage count for a question
 */
export async function incrementQuestionUsage(id: string): Promise<void> {
    const supabase = createClient();

    await supabase.rpc('increment_question_usage', { question_id: id });
}

/**
 * Check for existing similar questions (to avoid duplicates)
 */
export async function findSimilarQuestions(
    text: string,
    filters?: QuestionFilters
): Promise<DBQuestion[]> {
    const supabase = createClient();

    // Simple similarity check - find questions with similar text
    let query = supabase
        .from('questions')
        .select('*')
        .ilike('text', `%${text.substring(0, 50)}%`)
        .limit(5);

    if (filters?.curriculum_id) {
        query = query.eq('curriculum_id', filters.curriculum_id);
    }
    if (filters?.subject_id) {
        query = query.eq('subject_id', filters.subject_id);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error finding similar questions:', error);
        return [];
    }

    return (data || []).map(mapDBToQuestion);
}
