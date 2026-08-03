import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireUser } from '@/utils/auth/guards';
import { ACCOUNT_TYPE_BY_SLUG, toAccountProfile } from '@/lib/accounts';
import { LEVEL_BY_SLUG } from '@/lib/catalog';

/**
 * The account holder's own profile — who they are, not what they may do.
 *
 * GET  /api/account   read it
 * PATCH /api/account  change it
 *
 * The whole security posture of this route is one sentence: it writes an
 * allow-list of six personalisation columns and nothing else. `role` is not on
 * that list and never will be, because a route that accepts a body and spreads
 * it into an update is a route that grants ownership to whoever reads the
 * network tab. A trigger in migration 024 refuses the change from the database
 * side as well — one guard in the app and one in the data, because the app is
 * the one that gets rewritten.
 */
export async function GET() {
    const supabase = await createClient();
    const { user, failure } = await requireUser(supabase);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    const { data, error } = await supabase
        .from('profiles')
        .select('account_type, level_slug, grade_label, subject_interests, school_name, onboarded_at')
        .eq('id', user.id)
        .maybeSingle();

    if (error) {
        console.error('GET /api/account failed:', error.message);
        return NextResponse.json({ error: 'Could not load your account' }, { status: 500 });
    }

    return NextResponse.json({ account: toAccountProfile(data) });
}

export async function PATCH(req: NextRequest) {
    const supabase = await createClient();
    const { user, failure } = await requireUser(supabase);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 });
    }

    // Built field by field from known keys. Never `...body`.
    const update: Record<string, unknown> = {};

    if ('account_type' in body) {
        const value = body.account_type;
        if (value !== null && (typeof value !== 'string' || !ACCOUNT_TYPE_BY_SLUG[value])) {
            return NextResponse.json({ error: 'That is not an account type' }, { status: 400 });
        }
        update.account_type = value;
    }

    if ('level_slug' in body) {
        const value = body.level_slug;
        if (value !== null && (typeof value !== 'string' || !LEVEL_BY_SLUG[value])) {
            return NextResponse.json({ error: 'That is not a level' }, { status: 400 });
        }
        update.level_slug = value;
    }

    if ('grade_label' in body) {
        update.grade_label = typeof body.grade_label === 'string' ? body.grade_label.slice(0, 40) : null;
    }

    if ('school_name' in body) {
        update.school_name = typeof body.school_name === 'string' ? body.school_name.slice(0, 160) : null;
    }

    if ('subject_interests' in body) {
        // Capped and trimmed. This is stored as a Postgres array and read back
        // into a filter, so an unbounded list from the browser becomes an
        // unbounded query — the limit is the point, not the tidiness.
        const raw = Array.isArray(body.subject_interests) ? body.subject_interests : [];
        update.subject_interests = raw
            .filter((s): s is string => typeof s === 'string')
            .map((s) => s.trim().slice(0, 80))
            .filter(Boolean)
            .slice(0, 20);
    }

    if (Object.keys(update).length === 0) {
        return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });
    }

    // Answering the question at all is what counts as being asked, including
    // when the answer is "skip". Without this the prompt would return on every
    // sign-in and a helpful question would turn into nagging.
    update.onboarded_at = new Date().toISOString();
    update.updated_at = new Date().toISOString();

    const { data, error } = await supabase
        .from('profiles')
        .update(update)
        .eq('id', user.id)
        .select('account_type, level_slug, grade_label, subject_interests, school_name, onboarded_at')
        .maybeSingle();

    if (error) {
        console.error('PATCH /api/account failed:', error.message);
        return NextResponse.json({ error: 'Could not save your account' }, { status: 500 });
    }

    return NextResponse.json({ account: toAccountProfile(data) });
}
