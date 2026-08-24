import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireAdmin } from '@/utils/auth/guards';
import { storageSelfTest } from '@/utils/storage';

/**
 * POST /api/admin/storage/test — does the bucket actually work?
 *
 * `/api/admin/diagnostics` can only report which backend the environment
 * selects. That is presence, not correctness: four R2_* variables that are all
 * set but name the wrong bucket, or carry a token without write permission,
 * look identical there to a working deployment. The first proof either way is
 * an admin losing a twenty-page scan to a 403.
 *
 * This does the whole round trip against the live bucket — write, read back,
 * sign, delete — and then asks the bucket whether a browser would be allowed to
 * upload to it, which on R2 is a separate policy that is empty by default and
 * fails invisibly on the client. A few bytes are written and removed again; no
 * paper is touched.
 *
 * A POST rather than a GET, like the M-Pesa test: it writes, and it is an action
 * a person takes rather than something a page load should trigger.
 */
export async function POST() {
    try {
        const supabase = await createClient();
        const { failure } = await requireAdmin(supabase, { fresh: true });
        if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

        const result = await storageSelfTest();
        return NextResponse.json(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not reach storage';
        return NextResponse.json({ ok: false, detail: message }, { status: 500 });
    }
}
