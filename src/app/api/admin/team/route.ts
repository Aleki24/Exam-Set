import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireAdmin, requireOwner } from '@/utils/auth/guards';

/** GET /api/admin/team — who can stock the shop. */
export async function GET() {
    try {
        const supabase = await createClient();
        const { actor, failure } = await requireAdmin(supabase);
        if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

        const { data, error } = await supabase
            .from('profiles')
            .select('id, email, full_name, role, created_at')
            .in('role', ['owner', 'admin'])
            .order('role', { ascending: true });

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        return NextResponse.json({ team: data || [], me: actor });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * POST /api/admin/team — appoint or remove an admin. Owner only.
 * { email, role: 'admin' | 'user' }
 *
 * The person has to have signed up already: roles attach to an existing account
 * rather than creating one, so nobody can be granted access to an inbox they do
 * not control.
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { failure } = await requireOwner(supabase);
        if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

        const body = await req.json();
        const email = String(body.email || '').trim();
        const role = body.role === 'user' ? 'user' : 'admin';

        if (!email) return NextResponse.json({ error: 'Enter the account email' }, { status: 400 });

        const { data, error } = await supabase.rpc('set_user_role', { p_email: email, p_role: role });
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });

        const updated = Array.isArray(data) ? data[0] : data;
        return NextResponse.json({
            member: updated,
            message:
                role === 'admin'
                    ? `${email} can now upload and price papers.`
                    : `${email} no longer has admin access.`,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
