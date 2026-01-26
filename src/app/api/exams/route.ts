import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { uploadFile, getFileUrl } from "@/utils/r2";

// GET /api/exams - Get list of exams with optional filters
export async function GET(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { searchParams } = new URL(req.url);

        // Extract filter parameters
        const curriculum_id = searchParams.get("curriculum_id");
        const grade_id = searchParams.get("grade_id");
        const subject_id = searchParams.get("subject_id");
        const term = searchParams.get("term");
        const search = searchParams.get("search");
        const limit = parseInt(searchParams.get("limit") || "20");
        const offset = parseInt(searchParams.get("offset") || "0");

        let query = supabase
            .from("exams")
            .select(`
                *,
                curriculums:curriculum_id(name),
                grades:grade_id(name),
                subjects:subject_id(name)
            `)
            .order("created_at", { ascending: false });

        // Apply filters
        if (curriculum_id) query = query.eq("curriculum_id", curriculum_id);
        if (grade_id) query = query.eq("grade_id", grade_id);
        if (subject_id) query = query.eq("subject_id", subject_id);
        if (term) query = query.eq("term", term);

        // Apply search using full-text or fallback to ILIKE
        if (search) {
            query = query.or(`title.ilike.%${search}%,subject.ilike.%${search}%,code.ilike.%${search}%`);
        }

        // Pagination
        query = query.range(offset, offset + limit - 1);

        const { data, error } = await query;

        if (error) {
            console.error("Error fetching exams:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Transform data for response
        const exams = (data || []).map(row => ({
            ...row,
            curriculum_name: row.curriculums?.name,
            grade_name: row.grades?.name,
            subject_name: row.subjects?.name,
            curriculums: undefined,
            grades: undefined,
            subjects: undefined,
        }));

        return NextResponse.json({ exams, count: exams.length });
    } catch (error: any) {
        console.error("GET /api/exams error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST /api/exams - Create a new exam with optional PDF upload
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const formData = await req.formData();

        // Extract exam data from form
        const examDataJson = formData.get("examData") as string;
        const pdfFile = formData.get("pdf") as File | null;

        if (!examDataJson) {
            return NextResponse.json({ error: "Missing exam data" }, { status: 400 });
        }

        const examData = JSON.parse(examDataJson);

        let pdfStorageKey: string | undefined;
        let pdfUrl: string | undefined;

        // Upload PDF to R2 if provided
        if (pdfFile) {
            try {
                const fileName = `exams/${Date.now()}-${examData.title?.replace(/\s+/g, '-') || 'exam'}.pdf`;
                const buffer = Buffer.from(await pdfFile.arrayBuffer());
                const uploadResult = await uploadFile(buffer, fileName, 'application/pdf');
                pdfStorageKey = uploadResult.key;
                pdfUrl = await getFileUrl(pdfStorageKey, 86400 * 7); // 7 days
            } catch (uploadError) {
                console.error("PDF upload error:", uploadError);
                // Continue without PDF
            }
        }

        // Insert exam into database
        const dbExam = {
            title: examData.title,
            subject: examData.subject,
            code: examData.code,
            curriculum_id: examData.curriculum_id,
            grade_id: examData.grade_id,
            subject_id: examData.subject_id,
            term: examData.term,
            total_marks: examData.total_marks || 0,
            time_limit: examData.time_limit,
            institution: examData.institution,
            exam_board: examData.exam_board,
            pdf_storage_key: pdfStorageKey,
            pdf_url: pdfUrl,
            question_ids: examData.question_ids || [],
            question_count: examData.question_ids?.length || 0,
            is_public: true,
        };

        const { data, error } = await supabase
            .from("exams")
            .insert(dbExam)
            .select()
            .single();

        if (error) {
            console.error("Error creating exam:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            exam: data,
            pdf_url: pdfUrl
        });
    } catch (error: any) {
        console.error("POST /api/exams error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
