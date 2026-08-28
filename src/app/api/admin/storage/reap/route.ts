import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { requireAdmin } from '@/utils/auth/guards';
import { deleteObject, listObjects, storageUnavailableReason } from '@/utils/storage';
import { REAPABLE_PREFIX, humanBytes, planReap } from '@/services/uploadReaper';

/**
 * POST /api/admin/storage/reap — clear up abandoned uploads.
 *
 * The upload flow puts the file in the bucket the moment it is picked, so that
 * the cover can be read and the form filled in. Anyone who closes the tab
 * before publishing leaves an object nothing points at, and nothing collected
 * those. See `services/uploadReaper` for the rules and why they are where they
 * are.
 *
 * Two modes, and the safe one is the default:
 *
 *   GET-shaped `{ dryRun: true }`  — report what would go. Always run first.
 *   `{ dryRun: false }`            — actually delete.
 *
 * The referenced-key set is read with the service role rather than the caller's
 * session. Row-level security scopes `exams` to what the caller may see, and a
 * reaper that can only see its own papers would conclude every other seller's
 * file is unreferenced and delete the lot. This is the one place where reading
 * less than everything is not a smaller mistake but a catastrophic one.
 */

/** A ceiling on one sweep, so a serverless deadline cannot cut a delete run in half. */
const MAX_OBJECTS = 2000;

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { failure } = await requireAdmin(supabase, { fresh: true });
        if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

        const unavailable = storageUnavailableReason();
        if (unavailable) return NextResponse.json({ error: unavailable }, { status: 503 });

        const body = await req.json().catch(() => ({}));
        // Deleting is opt-in. A caller that forgets the flag gets a report.
        const dryRun = body?.dryRun !== false;

        const admin = createAdminClient();
        if (!admin) {
            return NextResponse.json(
                {
                    error:
                        'Clearing up abandoned uploads needs SUPABASE_SERVICE_ROLE_KEY. Without it this can ' +
                        'only see papers your own account may read, and would treat every other seller’s file ' +
                        'as abandoned.',
                },
                { status: 503 }
            );
        }

        const { data: rows, error } = await admin
            .from('exams')
            .select('pdf_storage_key, marking_scheme_storage_key');

        if (error) {
            // Never sweep on a partial answer: an `exams` query that failed
            // looks exactly like a shop with no papers in it.
            console.error('reap could not read the paper keys:', error.message);
            return NextResponse.json(
                { error: 'Could not read the papers, so nothing was deleted.' },
                { status: 503 }
            );
        }

        const referenced = new Set<string>();
        for (const row of rows ?? []) {
            if (row.pdf_storage_key) referenced.add(row.pdf_storage_key);
            if (row.marking_scheme_storage_key) referenced.add(row.marking_scheme_storage_key);
        }

        const stored = await listObjects(REAPABLE_PREFIX, MAX_OBJECTS);
        const plan = planReap(stored, referenced);

        if (dryRun) {
            return NextResponse.json({
                dryRun: true,
                scanned: stored.length,
                truncated: stored.length >= MAX_OBJECTS,
                ...summary(plan),
            });
        }

        let deleted = 0;
        const failed: string[] = [];
        for (const candidate of plan.doomed) {
            try {
                await deleteObject(candidate.key);
                deleted++;
            } catch (err) {
                // One unreachable object is not a reason to abandon the sweep.
                failed.push(candidate.key);
                console.error('reap could not delete', candidate.key, err instanceof Error ? err.message : err);
            }
        }

        return NextResponse.json({
            dryRun: false,
            scanned: stored.length,
            truncated: stored.length >= MAX_OBJECTS,
            deleted,
            failed: failed.length,
            ...summary(plan),
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not clear up';
        console.error('POST /api/admin/storage/reap error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

function summary(plan: ReturnType<typeof planReap>) {
    return {
        abandoned: plan.doomed.length,
        reclaimable: humanBytes(plan.bytes),
        bytes: plan.bytes,
        kept: { referenced: plan.referenced, tooNew: plan.tooNew, foreign: plan.foreign },
        // The first few names, so an admin can sanity-check the list before
        // running it for real. Never the whole list: a bucket with a thousand
        // abandoned files should not produce a thousand-line response.
        examples: plan.doomed.slice(0, 10).map((c) => c.key),
    };
}
