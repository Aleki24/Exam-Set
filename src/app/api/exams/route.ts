import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { requireUser } from '@/utils/auth/guards';
import { putObject } from '@/utils/storage';

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

        // Transform data for response.
        //
        // The storage columns are stripped on the way out. `select("*")` plus a
        // spread means every column added to `exams` ever after is published by
        // this endpoint by default, and the ones naming files are the ones that
        // must not be: `pdf_url` is a direct link, and the keys describe the
        // layout of a private bucket. Callers that need a file ask
        // /api/papers/[id]/download, which checks entitlement first.
        const exams = (data || []).map(row => {
            const {
                pdf_url: _pdfUrl,
                marking_scheme_url: _schemeUrl,
                pdf_storage_key: _pdfKey,
                marking_scheme_storage_key: _schemeKey,
                thumbnail_storage_key: _thumbKey,
                curriculums,
                grades,
                subjects,
                ...exam
            } = row;

            return {
                ...exam,
                curriculum_name: curriculums?.name,
                grade_name: grades?.name,
                subject_name: subjects?.name,
            };
        });

        return NextResponse.json({ exams, count: exams.length });
    } catch (error: any) {
        console.error("GET /api/exams error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST /api/exams - Create a new exam with optional PDF upload
export async function POST(req: NextRequest) {
    const supabase = await createClient();

    // Guarded: this route had no authentication at all.
    const { user, failure } = await requireUser(supabase);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    try {
        const formData = await req.formData();

        // Extract exam data from form
        const examDataJson = formData.get("examData") as string;
        const pdfFile = formData.get("pdf") as File | null;

        if (!examDataJson) {
            return NextResponse.json({ error: "Missing exam data" }, { status: 400 });
        }

        const examData = JSON.parse(examDataJson);

        let pdfStorageKey: string | undefined;

        /*
         * The file goes to storage; only its key is kept.
         *
         * This used to also mint a signed URL good for seven days and write it
         * into `pdf_url`. Two things were wrong with that. A signed URL is a
         * bearer token — whoever holds the string downloads the file, no account
         * and no purchase required — and `pdf_url` was handed to the browser by
         * every listing endpoint, so the paywall shipped with a working link to
         * the thing it was guarding. And it was durable: written to a row, it
         * outlived the request, the session, and any later decision to unpublish
         * or charge for the paper.
         *
         * Storing the key instead makes the link short-lived by construction.
         * /api/papers/[id]/download signs one on demand, after checking
         * entitlement, and it expires in fifteen minutes.
         */
        if (pdfFile) {
            try {
                const fileName = `exams/${Date.now()}-${examData.title?.replace(/\s+/g, '-') || 'exam'}.pdf`;
                const buffer = Buffer.from(await pdfFile.arrayBuffer());
                const uploadResult = await putObject(fileName, buffer, 'application/pdf');
                pdfStorageKey = uploadResult.key;
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
            question_ids: examData.question_ids || [],
            question_count: examData.question_ids?.length || 0,
            is_public: true,
            // Required, not optional. `exams_insert_own` only admits a row whose
            // `created_by` is the caller, so omitting it made every insert here
            // fail the row level security check — and a row nobody owns is one
            // the author cannot read back, cannot download and cannot delete,
            // with its uploaded PDF stranded in the bucket.
            created_by: user.id,
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

        // No `pdf_url` in the reply either. The author gets confirmation that the
        // file was stored; when they want it they ask for a download like anyone
        // else and get a link that expires. `stored` is there so a caller can
        // tell "no PDF was sent" from "the PDF failed to upload", which the old
        // shape could only express by the absence of a URL.
        const { pdf_storage_key, marking_scheme_storage_key, pdf_url, marking_scheme_url, ...exam } = data;

        return NextResponse.json({
            success: true,
            exam,
            pdf: { stored: Boolean(pdfStorageKey) },
        });
    } catch (error: any) {
        console.error("POST /api/exams error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
