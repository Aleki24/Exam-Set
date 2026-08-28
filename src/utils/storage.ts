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
    ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createAdminClient } from '@/utils/supabase/admin';

export type StorageBackend = 'r2' | 'supabase' | 'none';

const SUPABASE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'exam-papers';

const R2_VARS = ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'] as const;

/** Which of the four are missing. Empty means R2 is fully configured. */
export function r2Missing(): string[] {
    return R2_VARS.filter((name) => !process.env[name]);
}

function r2Configured(): boolean {
    return r2Missing().length === 0;
}

/**
 * Some of R2 set, but not all of it.
 *
 * Nobody configures three of four on purpose, so this is a typo or a deleted
 * variable — and the consequence is the worst kind of quiet. `storageBackend`
 * would fall through to Supabase Storage without complaining: new uploads land
 * in one place, everything already in R2 stays in the other, and downloads
 * start returning 404 for half the catalogue with nothing to explain it.
 *
 * Surfaced so the admin diagnostics can say which variable went missing,
 * instead of reporting "Supabase Storage" as though that were a choice
 * somebody made.
 */
export function r2PartiallyConfigured(): boolean {
    const missing = r2Missing();
    return missing.length > 0 && missing.length < R2_VARS.length;
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

/** One object in the bucket, as much of it as both backends agree on. */
export interface StoredObject {
    key: string;
    size: number;
    /** When the bucket says it was written. Null when it will not say. */
    uploadedAt: Date | null;
}

/**
 * Everything under a prefix.
 *
 * Only the reaper needs this, and it needs it for one reason: an upload that
 * was abandoned leaves an object nothing points at. The paper flow uploads the
 * file the moment it is picked — which is what makes the form fill itself in —
 * so closing the tab before publishing is now an ordinary thing to do, and
 * every one of those leaves a paid-for object in the bucket forever.
 *
 * The two backends page differently and neither returns the whole bucket at
 * once, so this walks until it is done or until `limit` objects have been seen.
 * A ceiling rather than an unbounded walk: this runs in a serverless function
 * with a deadline, and a partial sweep that finishes is worth more than a
 * complete one that is killed halfway.
 */
export async function listObjects(prefix: string, limit = 1000): Promise<StoredObject[]> {
    const backend = requireStorage();
    const out: StoredObject[] = [];

    if (backend === 'r2') {
        let token: string | undefined;
        do {
            const page = await r2().send(
                new ListObjectsV2Command({
                    Bucket: process.env.R2_BUCKET_NAME!,
                    Prefix: prefix,
                    ContinuationToken: token,
                    MaxKeys: Math.min(1000, limit - out.length),
                })
            );
            for (const item of page.Contents ?? []) {
                if (!item.Key) continue;
                out.push({
                    key: item.Key,
                    size: Number(item.Size) || 0,
                    uploadedAt: item.LastModified ? new Date(item.LastModified) : null,
                });
            }
            token = page.IsTruncated ? page.NextContinuationToken : undefined;
        } while (token && out.length < limit);

        return out;
    }

    /*
     * Supabase Storage lists one folder at a time and reports sub-folders as
     * entries with no metadata, so reaching `papers/<uid>/<file>` means walking
     * down. Depth is bounded because the prefixes this app writes are: uploads
     * live at `papers/<uid>/`, figures and generated files elsewhere.
     */
    const walk = async (folder: string, depth: number): Promise<void> => {
        if (out.length >= limit || depth > 3) return;

        for (let offset = 0; out.length < limit; offset += 100) {
            const { data, error } = await supabaseStorage().list(folder, { limit: 100, offset });
            if (error) throw new Error(`Could not list ${folder}: ${error.message}`);
            const entries = data ?? [];
            if (entries.length === 0) return;

            for (const entry of entries) {
                if (out.length >= limit) return;
                const key = folder ? `${folder}/${entry.name}` : entry.name;

                /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                const meta = (entry as any).metadata;
                // A folder comes back with no metadata and no id. A zero-byte
                // file has metadata saying so, which is how the two are told
                // apart — and a zero-byte file is exactly what a failed upload
                // leaves, so it must not be mistaken for a folder and skipped.
                if (!meta) {
                    await walk(key, depth + 1);
                    continue;
                }

                out.push({
                    key,
                    size: Number(meta.size) || 0,
                    uploadedAt: entry.created_at ? new Date(entry.created_at) : null,
                });
            }

            if (entries.length < 100) return;
        }
    };

    // `list('papers/')` and `list('papers')` are the same folder to Supabase;
    // the trailing slash would otherwise become a doubled one in every key.
    await walk(prefix.replace(/\/+$/, ''), 0);
    return out;
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

// ============================================================================
// SELF TEST
// ============================================================================

/**
 * THE CORS TRAP, AND WHY THIS EXISTS
 *
 * Uploads go browser → bucket now, as a cross-origin `fetch` PUT carrying a
 * `Content-Type: application/pdf` header. That is not a simple request, so the
 * browser sends an OPTIONS preflight first and refuses to send the file unless
 * the bucket answers it.
 *
 * Supabase Storage answers it out of the box. **An R2 bucket does not** — CORS
 * on a new bucket is empty, and Cloudflare's own documentation is explicit that
 * browser uploads through a presigned URL fail without a policy "even though the
 * presigned URL itself is valid". So the four R2_* variables can all be correct,
 * every server-side call can succeed, and admin uploads still break — with a
 * browser-side error the server never sees and this app cannot report.
 *
 * Downloads are unaffected: the library hands the signed URL to `window.open`,
 * a top-level navigation, which CORS does not govern. Uploads are the whole
 * exposure.
 */
export interface CorsVerdict {
    ok: boolean;
    detail: string;
    fix: string | null;
}

/** The policy a bucket needs, ready to paste. Shown whenever the check fails. */
export function corsPolicyFor(origin: string): string {
    return JSON.stringify(
        [
            {
                AllowedOrigins: [origin],
                AllowedMethods: ['PUT'],
                AllowedHeaders: ['Content-Type'],
                ExposeHeaders: ['ETag'],
                MaxAgeSeconds: 3600,
            },
        ],
        null,
        2
    );
}

/**
 * What a preflight response means.
 *
 * Pure, and separate from the request that produces it, so `verify:storage` can
 * cover every verdict without a bucket or a network.
 */
export function readCorsPreflight(
    origin: string,
    response: {
        status: number;
        allowOrigin: string | null;
        allowMethods: string | null;
        allowHeaders: string | null;
    }
): CorsVerdict {
    const fix =
        `Add this to the bucket's CORS policy (Cloudflare dashboard → R2 → your bucket → Settings → CORS Policy):\n` +
        corsPolicyFor(origin);

    if (!response.allowOrigin) {
        return {
            ok: false,
            detail:
                `The bucket refused a preflight from ${origin} (HTTP ${response.status}, no ` +
                `Access-Control-Allow-Origin). Browser uploads will fail even though the server-side ` +
                `round trip passed.`,
            fix,
        };
    }

    if (response.allowOrigin !== '*' && response.allowOrigin !== origin) {
        return {
            ok: false,
            detail: `The bucket allows ${response.allowOrigin}, but this deployment uploads from ${origin}.`,
            fix,
        };
    }

    // R2 echoes these on a preflight. Absent means there is nothing to
    // contradict the allowed origin, so it is not treated as a failure.
    const methods = response.allowMethods?.toUpperCase();
    if (methods && !methods.split(',').some((m) => m.trim() === 'PUT')) {
        return {
            ok: false,
            detail: `${origin} is allowed, but not for PUT (the policy permits ${response.allowMethods}).`,
            fix,
        };
    }

    const headers = response.allowHeaders?.toLowerCase();
    if (headers && headers !== '*' && !headers.split(',').some((h) => h.trim() === 'content-type')) {
        return {
            ok: false,
            detail:
                `PUT from ${origin} is allowed, but the Content-Type header is not — and the presigned ` +
                `URL signs that header, so the browser has to send it.`,
            fix,
        };
    }

    return { ok: true, detail: `Browser uploads from ${origin} are allowed.`, fix: null };
}

/** Asks the bucket the same question the browser asks before it sends a file. */
async function checkCors(origin: string): Promise<CorsVerdict> {
    const endpoint = process.env.R2_ENDPOINT!.replace(/\/+$/, '');
    const url = `${endpoint}/${process.env.R2_BUCKET_NAME!}/cors-preflight-probe`;

    const res = await fetch(url, {
        method: 'OPTIONS',
        headers: {
            Origin: origin,
            'Access-Control-Request-Method': 'PUT',
            'Access-Control-Request-Headers': 'content-type',
        },
    });

    return readCorsPreflight(origin, {
        status: res.status,
        allowOrigin: res.headers.get('access-control-allow-origin'),
        allowMethods: res.headers.get('access-control-allow-methods'),
        allowHeaders: res.headers.get('access-control-allow-headers'),
    });
}

export interface StorageSelfTest {
    ok: boolean;
    backend: StorageBackend;
    detail: string;
    fix: string | null;
    /** Only meaningful on R2; null when there was nothing to ask. */
    cors: CorsVerdict | null;
}

/**
 * Does storage actually work, right now, with these credentials?
 *
 * The same shape of proof the M-Pesa test gives: the environment can only say a
 * variable is present, not that it is correct. This writes a few bytes, reads
 * them back, signs a link for them and deletes them — the exact four operations
 * selling a paper depends on — and then asks the bucket whether it would accept
 * an upload from a browser.
 *
 * The probe lands under `diagnostics/`, outside the `papers/` prefix the
 * finalising step trusts, and is deleted in a `finally` so a failure halfway
 * through does not leave litter in a bucket somebody pays for.
 */
export async function storageSelfTest(): Promise<StorageSelfTest> {
    const backend = storageBackend();

    if (backend === 'none') {
        return { ok: false, backend, detail: storageUnavailableReason()!, fix: null, cors: null };
    }

    const where = backend === 'r2' ? `Cloudflare R2 (${process.env.R2_BUCKET_NAME})` : 'Supabase Storage';
    const key = `diagnostics/storage-probe-${Date.now()}.pdf`;
    // A real, if empty, PDF: the Supabase bucket restricts uploads to
    // application/pdf, so a text probe would be refused by the bucket rather
    // than by anything this test is trying to measure.
    const probe = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
    let wrote = false;

    try {
        await putObject(key, probe, 'application/pdf');
        wrote = true;

        const info = await objectInfo(key);
        if (!info) {
            return {
                ok: false,
                backend,
                detail: `${where} accepted the upload but the object was not there afterwards.`,
                fix: 'Check that the credentials point at the bucket you think they do.',
                cors: null,
            };
        }

        const url = await signedDownloadUrl(key, 60);
        if (!url.startsWith('http')) {
            return {
                ok: false,
                backend,
                detail: `${where} stored the file but could not sign a download link for it.`,
                fix: null,
                cors: null,
            };
        }

        const cors = backend === 'r2' ? await corsVerdict() : null;

        return {
            ok: cors ? cors.ok : true,
            backend,
            detail: `${where}: wrote ${info.size} bytes, read them back, signed a link and cleaned up.`,
            fix: null,
            cors,
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return {
            ok: false,
            backend,
            detail: `${where} rejected the round trip: ${message}`,
            fix:
                backend === 'r2'
                    ? 'Check R2_ENDPOINT is https://<account-id>.r2.cloudflarestorage.com, that R2_BUCKET_NAME exists, and that the API token has Object Read & Write on it.'
                    : 'Check SUPABASE_SERVICE_ROLE_KEY, and that migration 014 created the exam-papers bucket.',
            cors: null,
        };
    } finally {
        if (wrote) {
            // Never let cleanup failure mask the result the admin asked for.
            await deleteObject(key).catch(() => undefined);
        }
    }
}

/** The CORS check, or an explanation of why it could not be run. */
async function corsVerdict(): Promise<CorsVerdict> {
    const base = process.env.NEXT_PUBLIC_BASE_URL;
    if (!base) {
        return {
            ok: true,
            detail: 'Browser uploads were not checked: NEXT_PUBLIC_BASE_URL is not set, so there is no origin to ask about.',
            fix: 'Set NEXT_PUBLIC_BASE_URL to the site’s public URL and run this again.',
        };
    }

    try {
        return await checkCors(new URL(base).origin);
    } catch (err) {
        return {
            ok: false,
            detail: `Could not reach the bucket to check CORS: ${err instanceof Error ? err.message : 'unknown error'}`,
            fix: null,
        };
    }
}
