import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// GET /api/exams/search - Search exams with full-text search
export async function GET(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { searchParams } = new URL(req.url);

        const query = searchParams.get("q") || "";
        const curriculum_id = searchParams.get("curriculum_id");
        const grade_id = searchParams.get("grade_id");
        const subject_id = searchParams.get("subject_id");
        const term = searchParams.get("term");
        const limit = parseInt(searchParams.get("limit") || "20");

        if (!query.trim()) {
            // If no search query, return recent exams
            let recentQuery = supabase
                .from("exams")
                .select(`
                    *,
                    curriculums:curriculum_id(name),
                    grades:grade_id(name),
                    subjects:subject_id(name)
                `)
                .order("created_at", { ascending: false })
                .limit(limit);

            if (curriculum_id) recentQuery = recentQuery.eq("curriculum_id", curriculum_id);
            if (grade_id) recentQuery = recentQuery.eq("grade_id", grade_id);
            if (subject_id) recentQuery = recentQuery.eq("subject_id", subject_id);
            if (term) recentQuery = recentQuery.eq("term", term);

            const { data, error } = await recentQuery;

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            return NextResponse.json({
                exams: (data || []).map(formatExam),
                query: ""
            });
        }

        // Try full-text search first
        let searchQuery = supabase
            .from("exams")
            .select(`
                *,
                curriculums:curriculum_id(name),
                grades:grade_id(name),
                subjects:subject_id(name)
            `)
            .textSearch("search_keywords", query, {
                type: "websearch",
                config: "english"
            })
            .order("created_at", { ascending: false })
            .limit(limit);

        if (curriculum_id) searchQuery = searchQuery.eq("curriculum_id", curriculum_id);
        if (grade_id) searchQuery = searchQuery.eq("grade_id", grade_id);
        if (subject_id) searchQuery = searchQuery.eq("subject_id", subject_id);
        if (term) searchQuery = searchQuery.eq("term", term);

        let { data, error } = await searchQuery;

        // Fallback to ILIKE if full-text search returns no results or errors
        if (error || !data || data.length === 0) {
            let fallbackQuery = supabase
                .from("exams")
                .select(`
                    *,
                    curriculums:curriculum_id(name),
                    grades:grade_id(name),
                    subjects:subject_id(name)
                `)
                .or(`title.ilike.%${query}%,subject.ilike.%${query}%,code.ilike.%${query}%,institution.ilike.%${query}%`)
                .order("created_at", { ascending: false })
                .limit(limit);

            if (curriculum_id) fallbackQuery = fallbackQuery.eq("curriculum_id", curriculum_id);
            if (grade_id) fallbackQuery = fallbackQuery.eq("grade_id", grade_id);
            if (subject_id) fallbackQuery = fallbackQuery.eq("subject_id", subject_id);
            if (term) fallbackQuery = fallbackQuery.eq("term", term);

            const fallbackResult = await fallbackQuery;
            data = fallbackResult.data;
            error = fallbackResult.error;
        }

        if (error) {
            console.error("Search error:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            exams: (data || []).map(formatExam),
            query: query,
            count: data?.length || 0
        });
    } catch (error: any) {
        console.error("GET /api/exams/search error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

function formatExam(row: any) {
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
        is_public: row.is_public,
        created_at: row.created_at,
        updated_at: row.updated_at,
        curriculum_name: row.curriculums?.name,
        grade_name: row.grades?.name,
        subject_name: row.subjects?.name,
    };
}
