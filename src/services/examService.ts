import { createClient } from '@/utils/supabase/client';
import {
    StoredExam,
    ExamFilters,
    ExamTerm,
    Question
} from '@/types';

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
 * Create an exam. Files are uploaded separately, server-side.
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
        // Catalog taxonomy — see src/lib/catalog.ts
        exam_type?: string;
        level_slug?: string;
        grade_label?: string;
        term_slug?: string;
        year?: number;
    }
): Promise<StoredExam | null> {
    const supabase = createClient();

    // Row level security ties every paper to its author, so the session user has
    // to be stamped on the row or the insert is rejected.
    const { data: { user } } = await supabase.auth.getUser();

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
        question_ids: examData.question_ids,
        question_count: examData.question_ids.length,
        // A paper saved from the setter is private to its author until they
        // choose to publish it to the shop.
        source: 'user_set',
        is_public: false,
        created_by: user?.id,
        exam_type: examData.exam_type,
        level_slug: examData.level_slug,
        grade_label: examData.grade_label,
        term_slug: examData.term_slug,
        year: examData.year,
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
 * Get a fresh signed download URL for an exam
 */
export async function getExamPdfUrl(examId: string): Promise<string | null> {
    // The download route is the only thing allowed to sign a link: it checks the
    // caller owns the paper (or that it is free) first, then mints a short-lived
    // URL from whichever storage backend is configured.
    try {
        const res = await fetch(`/api/papers/${examId}/download`);
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            console.error('Could not get a download link:', body.error ?? res.status);
            return null;
        }
        const { url } = await res.json();
        return url ?? null;
    } catch (error) {
        console.error('Error requesting download link:', error);
        return null;
    }
}

/**
 * DELETING AND UPDATING A PAPER LIVE ON THE SERVER
 * ----------------------------------------------------------------------------
 * `updateExam` and `deleteExam` used to sit here, called from nowhere, doing
 * their work straight from the browser against the `exams` table.
 *
 * `deleteExam` in particular was a loaded gun left on the table. It issued a
 * bare delete, which meant it knew nothing about the two things that must stop
 * one: a paper that has been sold, and a paper somebody has sat — and
 * `exam_sessions` cascades, so the second would have taken a learner\'s answers
 * and marks with it silently. It also left the generated PDF and marking scheme
 * orphaned in storage, which it could not help: removing those needs
 * credentials only the server has.
 *
 * The rules now live in one place, `services/paperDeletion`, behind
 * `DELETE /api/papers/:id` (author or admin) and `DELETE /api/admin/papers`
 * (the catalog). Editing goes through `PATCH /api/papers/:id`, which restricts
 * itself to a known list of columns rather than forwarding whatever it is
 * handed. Nothing in the browser should be reaching for this table directly.
 */

/**
 * Get recent exams for dashboard
 */
export async function getRecentExams(limit = 10): Promise<StoredExam[]> {
    return getExams({ limit });
}
