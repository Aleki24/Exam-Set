import { createClient } from '@/utils/supabase/client';
import {
    StoredExam,
    ExamFilters,
    ExamTerm,
    Question
} from '@/types';
import { uploadFile, getFileUrl, deleteFile } from '@/utils/r2';

// ============================================================================
// EXAM CRUD OPERATIONS
// ============================================================================

/**
 * Map database row to StoredExam type
 */
function mapDBToExam(row: any): StoredExam {
    return {
        id: row.id,
        title: row.title,
        subject: row.subject,
        code: row.code,
        curriculum_id: row.curriculum_id,
        grade_id: row.grade_id,
        subject_id: row.subject_id,
        term: row.term,
        total_marks: row.total_marks,
        time_limit: row.time_limit,
        institution: row.institution,
        exam_board: row.exam_board,
        pdf_storage_key: row.pdf_storage_key,
        pdf_url: row.pdf_url,
        thumbnail_url: row.thumbnail_url,
        question_ids: row.question_ids || [],
        question_count: row.question_count || 0,
        is_public: row.is_public !== false,
        created_by: row.created_by,
        created_at: row.created_at,
        updated_at: row.updated_at,
        curriculum_name: row.curriculums?.name,
        grade_name: row.grades?.name,
        subject_name: row.subjects?.name,
    };
}

/**
 * Create an exam with PDF upload to R2
 */
export async function createExam(
    examData: {
        title: string;
        subject: string;
        code?: string;
        curriculum_id?: string;
        grade_id?: string;
        subject_id?: string;
        term?: ExamTerm;
        total_marks: number;
        time_limit?: string;
        institution?: string;
        exam_board?: string;
        question_ids: string[];
    },
    pdfBlob?: Blob
): Promise<StoredExam | null> {
    const supabase = createClient();

    let pdfStorageKey: string | undefined;
    let pdfUrl: string | undefined;

    // Upload PDF to R2 if provided
    if (pdfBlob) {
        try {
            const fileName = `exams/${Date.now()}-${examData.title.replace(/\s+/g, '-')}.pdf`;
            const buffer = Buffer.from(await pdfBlob.arrayBuffer());
            const uploadResult = await uploadFile(buffer, fileName, 'application/pdf');
            pdfStorageKey = uploadResult.key;
            pdfUrl = await getFileUrl(pdfStorageKey, 86400 * 7); // 7 days expiry
        } catch (error) {
            console.error('Error uploading PDF to R2:', error);
            // Continue without PDF - we can retry upload later
        }
    }

    const dbExam = {
        title: examData.title,
        subject: examData.subject,
        code: examData.code,
        curriculum_id: examData.curriculum_id,
        grade_id: examData.grade_id,
        subject_id: examData.subject_id,
        term: examData.term,
        total_marks: examData.total_marks,
        time_limit: examData.time_limit,
        institution: examData.institution,
        exam_board: examData.exam_board,
        pdf_storage_key: pdfStorageKey,
        pdf_url: pdfUrl,
        question_ids: examData.question_ids,
        question_count: examData.question_ids.length,
        is_public: true,
    };

    const { data, error } = await supabase
        .from('exams')
        .insert(dbExam)
        .select()
        .single();

    if (error) {
        console.error('Error creating exam:', error);
        return null;
    }

    return mapDBToExam(data);
}

/**
 * Get exams with filters
 */
export async function getExams(filters: ExamFilters = {}): Promise<StoredExam[]> {
    const supabase = createClient();

    let query = supabase
        .from('exams')
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

    // Pagination
    const limit = filters.limit || 20;
    const offset = filters.offset || 0;
    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching exams:', error);
        return [];
    }

    return (data || []).map(mapDBToExam);
}

/**
 * Search exams using full-text search
 */
export async function searchExams(searchQuery: string, filters: ExamFilters = {}): Promise<StoredExam[]> {
    const supabase = createClient();

    // If search query is empty, just return filtered exams
    if (!searchQuery.trim()) {
        return getExams(filters);
    }

    let query = supabase
        .from('exams')
        .select(`
            *,
            curriculums:curriculum_id(name),
            grades:grade_id(name),
            subjects:subject_id(name)
        `)
        .textSearch('search_keywords', searchQuery, {
            type: 'websearch',
            config: 'english'
        })
        .order('created_at', { ascending: false });

    // Apply additional filters
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

    const limit = filters.limit || 20;
    const offset = filters.offset || 0;
    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) {
        console.error('Error searching exams:', error);
        // Fallback to simple ILIKE search if full-text fails
        return searchExamsFallback(searchQuery, filters);
    }

    return (data || []).map(mapDBToExam);
}

/**
 * Fallback search using ILIKE (if full-text search fails)
 */
async function searchExamsFallback(searchQuery: string, filters: ExamFilters = {}): Promise<StoredExam[]> {
    const supabase = createClient();

    let query = supabase
        .from('exams')
        .select(`
            *,
            curriculums:curriculum_id(name),
            grades:grade_id(name),
            subjects:subject_id(name)
        `)
        .or(`title.ilike.%${searchQuery}%,subject.ilike.%${searchQuery}%,code.ilike.%${searchQuery}%`)
        .order('created_at', { ascending: false });

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

    const limit = filters.limit || 20;
    query = query.limit(limit);

    const { data, error } = await query;

    if (error) {
        console.error('Error in fallback search:', error);
        return [];
    }

    return (data || []).map(mapDBToExam);
}

/**
 * Get a single exam by ID
 */
export async function getExamById(id: string): Promise<StoredExam | null> {
    const supabase = createClient();

    const { data, error } = await supabase
        .from('exams')
        .select(`
            *,
            curriculums:curriculum_id(name),
            grades:grade_id(name),
            subjects:subject_id(name)
        `)
        .eq('id', id)
        .single();

    if (error) {
        console.error('Error fetching exam:', error);
        return null;
    }

    return mapDBToExam(data);
}

/**
 * Get fresh PDF URL for an exam (refresh signed URL)
 */
export async function getExamPdfUrl(examId: string): Promise<string | null> {
    const supabase = createClient();

    // First get the storage key
    const { data, error } = await supabase
        .from('exams')
        .select('pdf_storage_key')
        .eq('id', examId)
        .single();

    if (error || !data?.pdf_storage_key) {
        console.error('Error getting exam PDF key:', error);
        return null;
    }

    try {
        const url = await getFileUrl(data.pdf_storage_key, 3600); // 1 hour expiry

        // Update the stored URL
        await supabase
            .from('exams')
            .update({ pdf_url: url })
            .eq('id', examId);

        return url;
    } catch (error) {
        console.error('Error generating PDF URL:', error);
        return null;
    }
}

/**
 * Update exam metadata
 */
export async function updateExam(
    id: string,
    updates: Partial<{
        title: string;
        subject: string;
        code: string;
        total_marks: number;
        time_limit: string;
        is_public: boolean;
    }>
): Promise<StoredExam | null> {
    const supabase = createClient();

    const { data, error } = await supabase
        .from('exams')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating exam:', error);
        return null;
    }

    return mapDBToExam(data);
}

/**
 * Delete an exam and its PDF from R2
 */
export async function deleteExam(id: string): Promise<boolean> {
    const supabase = createClient();

    // First get the PDF storage key
    const { data: exam } = await supabase
        .from('exams')
        .select('pdf_storage_key')
        .eq('id', id)
        .single();

    // Delete from database
    const { error } = await supabase
        .from('exams')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting exam:', error);
        return false;
    }

    // Delete PDF from R2 if exists
    if (exam?.pdf_storage_key) {
        try {
            await deleteFile(exam.pdf_storage_key);
        } catch (error) {
            console.error('Error deleting PDF from R2:', error);
            // Don't fail the overall deletion
        }
    }

    return true;
}

/**
 * Get recent exams for dashboard
 */
export async function getRecentExams(limit = 10): Promise<StoredExam[]> {
    return getExams({ limit });
}

/**
 * Upload PDF for an existing exam (retry/update)
 */
export async function uploadExamPdf(examId: string, pdfBlob: Blob): Promise<string | null> {
    const supabase = createClient();

    // Get exam details for filename
    const { data: exam } = await supabase
        .from('exams')
        .select('title, pdf_storage_key')
        .eq('id', examId)
        .single();

    if (!exam) {
        console.error('Exam not found');
        return null;
    }

    try {
        // Delete old PDF if exists
        if (exam.pdf_storage_key) {
            try {
                await deleteFile(exam.pdf_storage_key);
            } catch (e) {
                // Ignore deletion error
            }
        }

        // Upload new PDF
        const fileName = `exams/${Date.now()}-${exam.title.replace(/\s+/g, '-')}.pdf`;
        const buffer = Buffer.from(await pdfBlob.arrayBuffer());
        const uploadResult = await uploadFile(buffer, fileName, 'application/pdf');
        const pdfUrl = await getFileUrl(uploadResult.key, 86400 * 7);

        // Update exam record
        await supabase
            .from('exams')
            .update({
                pdf_storage_key: uploadResult.key,
                pdf_url: pdfUrl
            })
            .eq('id', examId);

        return pdfUrl;
    } catch (error) {
        console.error('Error uploading exam PDF:', error);
        return null;
    }
}
