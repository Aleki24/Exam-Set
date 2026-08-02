import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireUser } from '@/utils/auth/guards';

/**
 * GUARDIAN LINKS
 *
 * GET   /api/guardians   both directions: who I follow, who follows me
 * POST  /api/guardians   invite a learner by exact email
 * PATCH /api/guardians   accept (learner only) or revoke (either side)
 *
 * The rules are enforced in the database, not here — migration 027 has a
 * trigger that refuses a guardian accepting on a learner's behalf, and the
 * summary functions check for an accepted link before returning a single
 * number. This route is the polite front of that, and would be safe to
 * reimplement badly, which is the property worth having.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET() {
    const supabase = await createClient();
    const { actor, failure } = await requireUser(supabase);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    // RLS returns both directions in one query — the policy admits a row when
    // the caller is either side of it.
    const { data, error } = await supabase
        .from('guardian_links')
        .select('id, guardian_id, learner_id, status, invited_at, accepted_at, revoked_at, revoked_by')
        .order('invited_at', { ascending: false });

    if (error) {
        console.error('GET /api/guardians failed:', error.message);
        return NextResponse.json({ error: 'Could not load your links' }, { status: 500 });
    }

    const rows = data ?? [];

    // Emails are attached separately and only for the people already on a link.
    // Joining `profiles` in the query above would return whatever the profiles
    // policy allows rather than only these two people.
    const others = [
        ...new Set(rows.map((r) => (r.guardian_id === actor.id ? r.learner_id : r.guardian_id))),
    ];

    const emails = new Map<string, string>();
    if (others.length > 0) {
        const { data: people } = await supabase
            .from('profiles')
            .select('id, email, full_name')
            .in('id', others);
        for (const p of people ?? []) emails.set(p.id, p.full_name || p.email || 'Someone');
    }

    return NextResponse.json({
        /** Learners this account is following, or has asked to follow. */
        following: rows
            .filter((r) => r.guardian_id === actor.id)
            .map((r) => shape(r, emails.get(r.learner_id))),
        /** Guardians who have asked to follow this account. */
        followers: rows
            .filter((r) => r.learner_id === actor.id)
            .map((r) => shape(r, emails.get(r.guardian_id))),
    });
}

export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const { actor, failure } = await requireUser(supabase);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 });
    }

    const email = typeof body.email === 'string' ? body.email.trim() : '';
    if (!email || !email.includes('@')) {
        return NextResponse.json({ error: 'Enter their email address' }, { status: 400 });
    }

    // Exact match only, through a function that returns an id and nothing else.
    // A partial search would make this an endpoint for discovering who has an
    // account here.
    const { data: found, error: lookupError } = await supabase.rpc('find_learner_by_email', {
        p_email: email,
    });

    if (lookupError) {
        console.error('find_learner_by_email failed:', lookupError.message);
        return NextResponse.json({ error: 'Could not send the request' }, { status: 500 });
    }

    const learnerId = Array.isArray(found) ? found[0]?.id : (found as { id?: string })?.id;
    if (!learnerId) {
        // Deliberately the same message whether or not an account exists.
        // "No account with that email" tells a stranger which addresses are
        // registered here, one guess at a time.
        return NextResponse.json(
            { error: 'If that account exists, a request has been sent. Ask them to check their account page.' },
            { status: 404 }
        );
    }

    const { error } = await supabase
        .from('guardian_links')
        .upsert(
            { guardian_id: actor.id, learner_id: learnerId, status: 'pending', invited_at: new Date().toISOString() },
            { onConflict: 'guardian_id,learner_id' }
        );

    if (error) {
        console.error('POST /api/guardians failed:', error.message);
        return NextResponse.json({ error: 'Could not send the request' }, { status: 500 });
    }

    return NextResponse.json({
        ok: true,
        message: 'Request sent. They will see it on their account page and can accept or decline.',
    });
}

export async function PATCH(req: NextRequest) {
    const supabase = await createClient();
    const { failure } = await requireUser(supabase);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 });
    }

    const id = typeof body.id === 'string' ? body.id : '';
    const status = body.status;

    if (!UUID.test(id)) return NextResponse.json({ error: 'Which request?' }, { status: 400 });
    if (status !== 'accepted' && status !== 'revoked') {
        return NextResponse.json({ error: 'Accept it or end it' }, { status: 400 });
    }

    const { data, error } = await supabase
        .from('guardian_links')
        .update({ status })
        .eq('id', id)
        .select('id, status')
        .maybeSingle();

    if (error) {
        // The trigger raises insufficient_privilege when a guardian tries to
        // accept on the learner's behalf. Passed through as a sentence rather
        // than a 500, because it is a rule being enforced, not a fault.
        if (error.code === '42501') {
            return NextResponse.json(
                { error: 'Only the learner can accept a request to follow their progress.' },
                { status: 403 }
            );
        }
        console.error('PATCH /api/guardians failed:', error.message);
        return NextResponse.json({ error: 'Could not update the request' }, { status: 500 });
    }

    if (!data) return NextResponse.json({ error: 'No such request' }, { status: 404 });

    return NextResponse.json({ ok: true, status: data.status });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function shape(row: any, who?: string) {
    return {
        id: row.id,
        who: who ?? 'Someone',
        status: row.status,
        invitedAt: row.invited_at,
        acceptedAt: row.accepted_at ?? null,
        revokedAt: row.revoked_at ?? null,
        learnerId: row.learner_id,
    };
}
