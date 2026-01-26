import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const r2Client = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME!;

export async function uploadFile(file: Buffer | Uint8Array, fileName: string, contentType: string) {
    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: fileName,
        Body: file,
        ContentType: contentType,
    });

    try {
        await r2Client.send(command);
        return { key: fileName, success: true };
    } catch (error) {
        console.error("R2 Upload Error:", error);
        throw error;
    }
}

export async function getFileUrl(key: string, expiresIn = 3600) {
    const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
    });

    try {
        const url = await getSignedUrl(r2Client, command, { expiresIn });
        return url;
    } catch (error) {
        console.error("R2 Get Signed URL Error:", error);
        throw error;
    }
}

export async function deleteFile(key: string) {
    const command = new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
    });

    try {
        await r2Client.send(command);
        return { success: true };
    } catch (error) {
        console.error("R2 Delete Error:", error);
        throw error;
    }
}

export default r2Client;
