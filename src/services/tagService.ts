import { createClient } from '@/utils/supabase/client';
import { QuestionTag, QuestionTagMapping, SyllabusPoint } from '@/types';

// ============================================================================
// QUESTION TAG SERVICE
// Manages custom tags and syllabus point mappings for questions
// ============================================================================

/**
 * Get all available tags for the current user
 */
export async function getTags(): Promise<QuestionTag[]> {
    const supabase = createClient();

    const { data, error } = await supabase
        .from('question_tags')
        .select('*')
        .order('name');

    if (error) {
        console.error('Error fetching tags:', error);
        return [];
    }

    return data || [];
}

/**
 * Create a new tag
 */
export async function createTag(
    name: string,
    color: string = '#6366f1',
    isGlobal: boolean = false
): Promise<QuestionTag | null> {
    const supabase = createClient();

    const { data, error } = await supabase
        .from('question_tags')
        .insert({ name, color, is_global: isGlobal })
        .select()
        .single();

    if (error) {
        console.error('Error creating tag:', error);
        return null;
    }

    return data;
}

/**
 * Delete a tag
 */
export async function deleteTag(tagId: string): Promise<boolean> {
    const supabase = createClient();

    const { error } = await supabase
        .from('question_tags')
        .delete()
        .eq('id', tagId);

    if (error) {
        console.error('Error deleting tag:', error);
        return false;
    }

    return true;
}

/**
 * Get tags for a specific question
 */
export async function getQuestionTags(questionId: string): Promise<QuestionTag[]> {
    const supabase = createClient();

    const { data, error } = await supabase
        .from('question_tag_mappings')
        .select(`
            tag_id,
            question_tags (*)
        `)
        .eq('question_id', questionId);

    if (error) {
        console.error('Error fetching question tags:', error);
        return [];
    }

    return (data || []).map((d: any) => d.question_tags).filter(Boolean);
}

/**
 * Add a tag to a question
 */
export async function addTagToQuestion(
    questionId: string,
    tagId: string
): Promise<boolean> {
    const supabase = createClient();

    const { error } = await supabase
        .from('question_tag_mappings')
        .insert({ question_id: questionId, tag_id: tagId });

    if (error) {
        // Ignore duplicate errors
        if (error.code === '23505') return true;
        console.error('Error adding tag to question:', error);
        return false;
    }

    return true;
}

/**
 * Remove a tag from a question
 */
export async function removeTagFromQuestion(
    questionId: string,
    tagId: string
): Promise<boolean> {
    const supabase = createClient();

    const { error } = await supabase
        .from('question_tag_mappings')
        .delete()
        .eq('question_id', questionId)
        .eq('tag_id', tagId);

    if (error) {
        console.error('Error removing tag from question:', error);
        return false;
    }

    return true;
}

// ============================================================================
// SYLLABUS POINT SERVICE
// ============================================================================

/**
 * Get syllabus points by subject
 */
export async function getSyllabusPoints(subjectId?: string): Promise<SyllabusPoint[]> {
    const supabase = createClient();

    let query = supabase
        .from('syllabus_points')
        .select('*')
        .order('code');

    if (subjectId) {
        query = query.eq('subject_id', subjectId);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching syllabus points:', error);
        return [];
    }

    return data || [];
}

/**
 * Create a new syllabus point
 */
export async function createSyllabusPoint(
    code: string,
    description: string,
    subjectId: string,
    curriculumId: string,
    gradeId?: string
): Promise<SyllabusPoint | null> {
    const supabase = createClient();

    const { data, error } = await supabase
        .from('syllabus_points')
        .insert({ code, description, subject_id: subjectId, curriculum_id: curriculumId, grade_id: gradeId })
        .select()
        .single();

    if (error) {
        console.error('Error creating syllabus point:', error);
        return null;
    }

    return data;
}

/**
 * Map a question to a syllabus point
 */
export async function mapQuestionToSyllabus(
    questionId: string,
    syllabusPointId: string
): Promise<boolean> {
    const supabase = createClient();

    const { error } = await supabase
        .from('question_syllabus_mappings')
        .insert({ question_id: questionId, syllabus_point_id: syllabusPointId });

    if (error) {
        if (error.code === '23505') return true;
        console.error('Error mapping question to syllabus:', error);
        return false;
    }

    return true;
}

/**
 * Remove a syllabus mapping from a question
 */
export async function unmapQuestionFromSyllabus(
    questionId: string,
    syllabusPointId: string
): Promise<boolean> {
    const supabase = createClient();

    const { error } = await supabase
        .from('question_syllabus_mappings')
        .delete()
        .eq('question_id', questionId)
        .eq('syllabus_point_id', syllabusPointId);

    if (error) {
        console.error('Error unmapping question from syllabus:', error);
        return false;
    }

    return true;
}

/**
 * Get syllabus points for a question
 */
export async function getQuestionSyllabusPoints(questionId: string): Promise<SyllabusPoint[]> {
    const supabase = createClient();

    const { data, error } = await supabase
        .from('question_syllabus_mappings')
        .select(`
            syllabus_point_id,
            syllabus_points (*)
        `)
        .eq('question_id', questionId);

    if (error) {
        console.error('Error fetching question syllabus points:', error);
        return [];
    }

    return (data || []).map((d: any) => d.syllabus_points).filter(Boolean);
}

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * Add a tag to multiple questions at once
 */
export async function bulkAddTag(questionIds: string[], tagId: string): Promise<number> {
    const supabase = createClient();

    const mappings = questionIds.map((qId) => ({
        question_id: qId,
        tag_id: tagId,
    }));

    const { data, error } = await supabase
        .from('question_tag_mappings')
        .upsert(mappings, { onConflict: 'question_id,tag_id' })
        .select();

    if (error) {
        console.error('Error bulk adding tags:', error);
        return 0;
    }

    return data?.length || 0;
}

/**
 * Remove a tag from multiple questions at once
 */
export async function bulkRemoveTag(questionIds: string[], tagId: string): Promise<number> {
    const supabase = createClient();

    const { data, error } = await supabase
        .from('question_tag_mappings')
        .delete()
        .in('question_id', questionIds)
        .eq('tag_id', tagId)
        .select();

    if (error) {
        console.error('Error bulk removing tags:', error);
        return 0;
    }

    return data?.length || 0;
}

/**
 * Delete multiple questions at once
 */
export async function bulkDeleteQuestions(questionIds: string[]): Promise<number> {
    const supabase = createClient();

    const { data, error } = await supabase
        .from('questions')
        .delete()
        .in('id', questionIds)
        .select();

    if (error) {
        console.error('Error bulk deleting questions:', error);
        return 0;
    }

    return data?.length || 0;
}
