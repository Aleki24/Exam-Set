import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createClient } from '@/utils/supabase/server';
import { requireUser } from '@/utils/auth/guards';

/**
 * CLASS SHARE LINKS
 *
 * GET    /api/shares   the teacher's own links
 * POST   /api/shares   make one
 * DELETE /api/shares?id=…  end one
 *
 * A share link shows a class a list. It does not hand them paid downloads —
 * `/api/papers/[id]/download` still asks `can_download_paper` for whoever is
 * actually asking, so a link forwarded through WhatsApp cannot become a free
 * catalogue for the county.
 */

/** Days a link stays live unless the teacher says otherwise. */
const DEFAULT_DAYS = 30;
const MAX_DAYS = 180;
const MAX_ITEMS = 50;

export async function GET() {
    const supabase = await createClient();
    const { failure } = await requireUser(supabase);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    // No `.eq('created_by', …)`: `class_shares_select_own` already restricts
    // this to the caller's rows, and filtering here as well would imply the
    // safety lives in this file.
    const { data, error } = await supabase
        .from('class_shares')
        .select('id, token, title, note, exam_ids, expires_at, revoked_at, view_count, open_count, due_on, created_at')
        .order('created_at', { ascending: false })
        .limit(100);

    if (error) {
        console.error('GET /api/shares failed:', error.message);
        return NextResponse.json({ error: 'Could not load your links' }, { status: 500 });
    }

    return NextResponse.json({ shares: (data ?? []).map(shape) });
}

export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const { user, failure } = await requireUser(supabase);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 });
    }

    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 160) : '';
    if (!title) return NextResponse.json({ error: 'Give the list a name' }, { status: 400 });

    const examIds = Array.isArray(body.exam_ids)
        ? body.exam_ids.filter((v): v is string => typeof v === 'string' && UUID.test(v)).slice(0, MAX_ITEMS)
        : [];

    if (examIds.length === 0) {
        return NextResponse.json({ error: 'Add at least one resource' }, { status: 400 });
    }

    const days = Math.min(
        MAX_DAYS,
        Math.max(1, Number.isFinite(Number(body.days)) ? Number(body.days) : DEFAULT_DAYS)
    );

    /*
     * A due date turns a reading list into an assignment, and is optional —
     * plenty of shares are just "here is the material".
     *
     * The link is extended to outlive the deadline where necessary. A class
     * arriving at a dead link the day before work is due is the one failure this
     * feature must not have, and silently accepting a due date the link cannot
     * reach would be exactly that. A CHECK constraint refuses the pairing too,
     * so the rule holds even if this route is rewritten.
     */
    const dueOn = typeof body.due_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.due_on)
        ? body.due_on
        : null;

    let expiryMs = Date.now() + days * 86_400_000;
    if (dueOn) {
        // A week past the deadline, so late work still opens.
        const dueMs = new Date(`${dueOn}T23:59:59Z`).getTime() + 7 * 86_400_000;
        if (Number.isFinite(dueMs)) expiryMs = Math.max(expiryMs, dueMs);
    }
    const expiresAt = new Date(expiryMs).toISOString();

    /*
     * 32 bytes from the OS random source, base64url. Not `Math.random`, not a
     * timestamp, not a uuid derived from anything about the teacher: this
     * string is the entire access control on the page it opens, so it has to be
     * unguessable in the sense that matters cryptographically rather than the
     * sense that feels random.
     */
    const token = randomBytes(32).toString('base64url');

    const { data, error } = await supabase
        .from('class_shares')
        .insert({
            token,
            created_by: user.id,
            title,
            note: typeof body.note === 'string' ? body.note.slice(0, 2000) : null,
            exam_ids: examIds,
            expires_at: expiresAt,
            due_on: dueOn,
        })
        .select('id, token, title, note, exam_ids, expires_at, revoked_at, view_count, open_count, due_on, created_at')
        .single();

    if (error) {
        console.error('POST /api/shares failed:', error.message);
        return NextResponse.json({ error: 'Could not create the link' }, { status: 500 });
    }

    return NextResponse.json({ share: shape(data) }, { status: 201 });
}

/**
 * Ends a link.
 *
 * Revoked rather than deleted, so a teacher who wonders "did I share that?"
 * still has an answer. RLS restricts the update to their own rows, so an id
 * belonging to somebody else simply matches nothing.
 */
export async function DELETE(req: NextRequest) {
    const supabase = await createClient();
    const { failure } = await requireUser(supabase);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    const id = new URL(req.url).searchParams.get('id');
    if (!id || !UUID.test(id)) {
        return NextResponse.json({ error: 'Which link?' }, { status: 400 });
    }

    const { data, error } = await supabase
        .from('class_shares')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', id)
        .select('id')
        .maybeSingle();

    if (error) {
        console.error('DELETE /api/shares failed:', error.message);
        return NextResponse.json({ error: 'Could not end the link' }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'No such link' }, { status: 404 });

    return NextResponse.json({ ok: true });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* eslint-disable @typescript-eslint/no-explicit-any */
function shape(row: any) {
    const expired = new Date(row.expires_at).getTime() < Date.now();
    return {
        id: row.id,
        token: row.token,
        title: row.title,
        note: row.note ?? null,
        examIds: row.exam_ids ?? [],
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at ?? null,
        viewCount: row.view_count ?? 0,
        openCount: row.open_count ?? 0,
        dueOn: row.due_on ?? null,
        /** An assignment is a share with a deadline; without one it is a list. */
        isAssignment: Boolean(row.due_on),
        createdAt: row.created_at,
        /** One field the UI can trust instead of recomputing two rules. */
        active: !row.revoked_at && !expired,
    };
}
