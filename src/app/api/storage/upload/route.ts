import { createClient } from '@/utils/supabase/server';
import { requireUser } from '@/utils/auth/guards';
import { NextRequest, NextResponse } from "next/server";
import { putObject, signedDownloadUrl } from '@/utils/storage';

/**
 * POST /api/storage/upload
 *
 * Previously unauthenticated: it accepted any file of any size from anyone,
 * wrote it into the private bucket with the service role, and handed back a
 * signed URL valid for a year. That is free file hosting on the project's own
 * storage, reachable by anyone who found the path.
 */
export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const { actor, failure } = await requireUser(supabase);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        }

        // Without these, the route was free unmetered file hosting on the
        // project's own storage for anyone who found the URL.
        const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'];
        const MAX_BYTES = 20 * 1024 * 1024;

        if (!ALLOWED.includes(file.type)) {
            return NextResponse.json(
                { error: `That file type is not accepted. Upload a PDF or an image.` },
                { status: 415 }
            );
        }
        if (file.size > MAX_BYTES) {
            return NextResponse.json(
                { error: 'That file is larger than the 20 MB limit.' },
                { status: 413 }
            );
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        // Namespaced by uploader so one account cannot overwrite another's file
        // by choosing the same name, and stripped of path characters so it
        // cannot escape its prefix.
        const safeName = file.name.replace(/[^\w.-]/g, '-').slice(-80);
        const fileName = `uploads/${actor.id}/${Date.now()}-${safeName}`;
        const contentType = file.type;

        const result = await putObject(fileName, buffer, contentType);
        // An hour, not a year. A long-lived signed URL is a permanent public
        // link to a private bucket the moment it is shared or logged.
        const url = await signedDownloadUrl(result.key, 3600);

        return NextResponse.json({
            success: true,
            key: result.key,
            url: url,
            message: "File uploaded successfully"
        });
    } catch (error: any) {
        console.error("Upload API Error:", error);
        return NextResponse.json({ error: error.message || "Failed to upload file" }, { status: 500 });
    }
}
