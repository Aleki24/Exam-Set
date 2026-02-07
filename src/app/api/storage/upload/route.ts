import { NextRequest, NextResponse } from "next/server";
import { uploadFile, getFileUrl } from "@/utils/r2";

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const fileName = `${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
        const contentType = file.type;

        const result = await uploadFile(buffer, fileName, contentType);
        const url = await getFileUrl(result.key, 31536000); // 1 year expiry

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
