import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { requireAdmin } from '@/utils/auth/guards';
import { mintKey } from '@/lib/ingestKeys';

/**
 * Ingest keys — mint, list, revoke.
 *
 * The key is returned exactly once, by the call that creates it. There is no
 * route that reads one back, because only its hash is stored and that is the
 * property worth keeping: a credential that cannot be read out of the database
 * cannot be leaked by a backup, a support query, or the next bug in an admin
 * screen. Losing one costs a revoke and a re-mint, which is cheap; being unable
 * to prove one has not leaked is not.
 */

export async function GET() {
    const supabase = await createClient();
    const { failure } = await requireAdmin(supabase);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    const { data, error } = await supabase
        .from('ingest_keys')
        .select('id, name, key_prefix, created_at, last_used_at, revoked_at')
        .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ keys: data ?? [] });
}

export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const { actor, failure } = await requireAdmin(supabase);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: 'Server is not configured for this.' }, { status: 503 });

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || '').trim().slice(0, 80);
    if (!name) return NextResponse.json({ error: 'Give the key a name so it can be revoked later.' }, { status: 400 });

    const minted = mintKey();
    const { error } = await admin.from('ingest_keys').insert({
        name,
        key_hash: minted.hash,
        key_prefix: minted.prefix,
        created_by: actor.id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(
        {
            key: minted.key,
            warning: 'Copy this now — it is not stored and cannot be shown again.',
        },
        { status: 201 }
    );
}

export async function DELETE(req: NextRequest) {
    const supabase = await createClient();
    const { failure } = await requireAdmin(supabase);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: 'Server is not configured for this.' }, { status: 503 });

    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Which key?' }, { status: 400 });

    // Revoked, never deleted: the row is the record of what a key did and when
    // it was last used, which is the only thing that can answer "was this the
    // one that leaked".
    const { error } = await admin
        .from('ingest_keys')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
