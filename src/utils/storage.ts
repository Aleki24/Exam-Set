/**
 * PAPER STORAGE — server only
 * ----------------------------------------------------------------------------
 * Paper and marking-scheme PDFs are private. Nothing is ever served from a
 * public URL: the download route checks entitlement and then mints a short-lived
 * signed link through here.
 *
 * Two backends, chosen automatically from the environment:
 *
 *   Cloudflare R2 — used when the four R2_* variables are set. Cheapest at scale
 *                   because egress is free.
 *   Supabase Storage — the fallback, and the default for a new deployment. It
 *                   needs no new vendor: the project already has Supabase, and
 *                   SUPABASE_SERVICE_ROLE_KEY is already required for the M-Pesa
 *                   callback, so one credential covers both.
 *
 * Callers do not care which is active. If neither is configured, every call
 * throws a message that says exactly what to set.
 */

import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createAdminClient } from '@/utils/supabase/admin';

export type StorageBackend = 'r2' | 'supabase' | 'none';

const SUPABASE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'exam-papers';

function r2Configured(): boolean {
    return Boolean(
        process.env.R2_ENDPOINT &&
            process.env.R2_ACCESS_KEY_ID &&
            process.env.R2_SECRET_ACCESS_KEY &&
            process.env.R2_BUCKET_NAME
    );
}

function supabaseConfigured(): boolean {
    return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Which backend will handle the next call. Surfaced in admin diagnostics. */
export function storageBackend(): StorageBackend {
    if (r2Configured()) return 'r2';
    if (supabaseConfigured()) return 'supabase';
    return 'none';
}

/** Human-readable reason storage is unavailable, or null when it is fine. */
export function storageUnavailableReason(): string | null {
    if (storageBackend() !== 'none') return null;
    return (
        'File storage is not configured. Set SUPABASE_SERVICE_ROLE_KEY to use Supabase Storage, ' +
        'or all four of R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME to use Cloudflare R2.'
    );
}

function requireStorage(): StorageBackend {
    const backend = storageBackend();
    if (backend === 'none') throw new Error(storageUnavailableReason()!);
    return backend;
}

// ============================================================================
// R2 / S3
// ============================================================================

let cachedR2: S3Client | null = null;

function r2(): S3Client {
    if (!cachedR2) {
        cachedR2 = new S3Client({
            region: 'auto',
            endpoint: process.env.R2_ENDPOINT!,
            credentials: {
                accessKeyId: process.env.R2_ACCESS_KEY_ID!,
                secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
            },
        });
    }
    return cachedR2;
}

// ============================================================================
// SUPABASE STORAGE
// ============================================================================

function supabaseStorage() {
    const admin = createAdminClient();
    if (!admin) {
        throw new Error(
            'Supabase Storage needs SUPABASE_SERVICE_ROLE_KEY. It is server-only — never expose it to the browser.'
        );
    }
    return admin.storage.from(SUPABASE_BUCKET);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/** Stores a file and returns the key to record against the paper. */
export async function putObject(key: string, body: Buffer, contentType: string): Promise<{ key: string }> {
    const backend = requireStorage();

    if (backend === 'r2') {
        await r2().send(
            new PutObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME!,
                Key: key,
                Body: body,
                ContentType: contentType,
            })
        );
        return { key };
    }

    const { error } = await supabaseStorage().upload(key, body, { contentType, upsert: true });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    return { key };
}

/**
 * Permission for the browser to put one object straight into the bucket.
 *
 * WHY UPLOADS DO NOT COME THROUGH THE SERVER ANY MORE
 *
 * `putObject` needs the whole file in memory in a serverless function, and
 * Vercel caps a route handler's request body at about 4.5 MB on every plan — so
 * a scanned past paper was rejected by the platform before this app saw it, with
 * an error that had nothing to do with the 25 MB limit the upload route
 * advertised. Handing the browser a signed URL takes the function out of the
 * path entirely: the bytes go from the seller's laptop to the bucket, and only
 * the key comes back here.
 *
 * The key is minted server-side and namespaced by uploader. The browser is
 * never allowed to choose where a file lands.
 */
export interface UploadTicket {
    /** Where the object will live. Recorded against the paper afterwards. */
    key: string;
    /** The URL to send the bytes to. */
    url: string;
    method: 'PUT';
    headers: Record<string, string>;
    backend: StorageBackend;
}

export async function signedUploadTicket(
    key: string,
    contentType: string,
    expiresIn = 900
): Promise<UploadTicket> {
    const backend = requireStorage();

    if (backend === 'r2') {
        const url = await getSignedUrl(
            r2(),
            new PutObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME!,
                Key: key,
                ContentType: contentType,
            }),
            { expiresIn }
        );
        // The signature covers Content-Type, so the browser has to send the same
        // one back or R2 rejects it.
        return { key, url, method: 'PUT', headers: { 'Content-Type': contentType }, backend };
    }

    const { data, error } = await supabaseStorage().createSignedUploadUrl(key);
    if (error || !data?.signedUrl) {
        throw new Error(`Could not authorise the upload: ${error?.message ?? 'unknown error'}`);
    }
    // Supabase puts the token in the URL, so a plain PUT of the file body is
    // all the browser needs.
    return {
        key,
        url: data.signedUrl,
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        backend,
    };
}

/**
 * What is actually in the bucket at `key`, or null when nothing is.
 *
 * The finalising request is just JSON, so on its own it is a claim that a file
 * was uploaded rather than proof. Without this a seller could skip the upload
 * — or have it fail silently — and still create a paper the shop would happily
 * sell and then fail to deliver.
 */
export async function objectInfo(key: string): Promise<{ size: number; contentType?: string } | null> {
    const backend = requireStorage();

    if (backend === 'r2') {
        try {
            const head = await r2().send(
                new HeadObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key })
            );
            return { size: Number(head.ContentLength) || 0, contentType: head.ContentType };
        } catch {
            return null;
        }
    }

    const slash = key.lastIndexOf('/');
    const folder = slash === -1 ? '' : key.slice(0, slash);
    const name = slash === -1 ? key : key.slice(slash + 1);

    const { data, error } = await supabaseStorage().list(folder, { search: name, limit: 100 });
    if (error) return null;

    const found = (data ?? []).find((entry) => entry.name === name);
    if (!found) return null;

    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const meta = (found as any).metadata ?? {};
    return { size: Number(meta.size) || 0, contentType: meta.mimetype };
}

/**
 * A time-limited link to a private object.
 *
 * `expiresIn` is seconds. Keep it short — long enough to start a download, short
 * enough that a leaked link is worthless.
 */
export async function signedDownloadUrl(key: string, expiresIn = 900): Promise<string> {
    const backend = requireStorage();

    if (backend === 'r2') {
        return getSignedUrl(
            r2(),
            new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key }),
            { expiresIn }
        );
    }

    const { data, error } = await supabaseStorage().createSignedUrl(key, expiresIn);
    if (error || !data?.signedUrl) {
        throw new Error(`Could not sign a download link: ${error?.message ?? 'unknown error'}`);
    }
    return data.signedUrl;
}

export async function deleteObject(key: string): Promise<void> {
    const backend = requireStorage();

    if (backend === 'r2') {
        await r2().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key }));
        return;
    }

    const { error } = await supabaseStorage().remove([key]);
    if (error) throw new Error(`Delete failed: ${error.message}`);
}
