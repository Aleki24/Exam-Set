import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { requireOwner } from '@/utils/auth/guards';

/**
 * ACCOUNT RECOVERY THAT DOES NOT DEPEND ON EMAIL
 *
 * Supabase's built-in mailer only delivers to members of the project and is
 * rate limited to a couple of messages an hour. On this deployment that has
 * meant confirmation emails silently never arriving, leaving accounts that can
 * never sign in — and it would mean the same for password resets, so a reset
 * page alone does not actually fix anything.
 *
 * This gives the owner two service-role operations that bypass mail entirely:
 * confirm an account, and mint a recovery link to hand over by any channel they
 * like. Both are things they would otherwise have to open the Supabase
 * dashboard to do.
 *
 * Owner only, deliberately. Minting a recovery link for an address is
 * equivalent to taking over that account, so it is not something an ordinary
 * admin should be able to do to a colleague — or to the owner.
 */

/** GET /api/admin/users — accounts and whether each one can actually sign in. */
export async function GET() {
    try {
        const supabase = await createClient();
        const { failure } = await requireOwner(supabase);
        if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

        const admin = createAdminClient();
        if (!admin) {
            return NextResponse.json(
                { error: 'SUPABASE_SERVICE_ROLE_KEY is not set, so accounts cannot be managed from here.' },
                { status: 503 }
            );
        }

        const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        const { data: profiles } = await admin.from('profiles').select('id, role, full_name');
        const roleById = new Map((profiles ?? []).map((p) => [p.id, p]));

        const users = data.users.map((u) => {
            const profile = roleById.get(u.id);
            return {
                id: u.id,
                email: u.email ?? null,
                phone: u.phone ?? null,
                full_name: profile?.full_name ?? null,
                role: profile?.role ?? 'user',
                confirmed: Boolean(u.email_confirmed_at || u.phone_confirmed_at),
                last_sign_in_at: u.last_sign_in_at ?? null,
                created_at: u.created_at,
                // The thing that actually matters operationally: an account that
                // has never been confirmed cannot sign in, and on this project
                // the confirmation email probably never arrived.
                blocked: !u.email_confirmed_at && !u.phone_confirmed_at,
            };
        });

        return NextResponse.json({
            users,
            blockedCount: users.filter((u) => u.blocked).length,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * POST /api/admin/users
 *   { action: 'confirm',    user_id }  mark the address confirmed so they can sign in
 *   { action: 'reset_link', email   }  mint a one-time link to set a new password
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { actor, failure } = await requireOwner(supabase);
        if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

        const admin = createAdminClient();
        if (!admin) {
            return NextResponse.json(
                { error: 'SUPABASE_SERVICE_ROLE_KEY is not set, so accounts cannot be managed from here.' },
                { status: 503 }
            );
        }

        const body = await req.json();
        const action = String(body.action ?? '');

        if (action === 'confirm') {
            const userId = String(body.user_id ?? '');
            if (!userId) return NextResponse.json({ error: 'user_id is required' }, { status: 400 });

            const { data, error } = await admin.auth.admin.updateUserById(userId, { email_confirm: true });
            if (error) return NextResponse.json({ error: error.message }, { status: 400 });

            console.info(`Owner ${actor.email} confirmed account ${data.user?.email ?? userId}`);
            return NextResponse.json({
                ok: true,
                message: `${data.user?.email ?? 'The account'} can now sign in.`,
            });
        }

        if (action === 'reset_link') {
            const email = String(body.email ?? '').trim();
            if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 });

            const base = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, '') ?? new URL(req.url).origin;

            // generateLink returns the link rather than relying on the mailer,
            // which is the entire point: it works when email does not.
            const { data, error } = await admin.auth.admin.generateLink({
                type: 'recovery',
                email,
                options: { redirectTo: `${base}/auth/callback?next=${encodeURIComponent('/auth/reset-password')}` },
            });

            if (error) return NextResponse.json({ error: error.message }, { status: 400 });

            console.info(`Owner ${actor.email} generated a recovery link for ${email}`);
            return NextResponse.json({
                ok: true,
                link: data.properties?.action_link ?? null,
                // Said plainly, because handing this to the wrong person hands
                // them the account.
                warning:
                    'This link signs whoever opens it into that account and lets them set its password. Send it only to the account holder, and only over a channel you trust. It can be used once and expires in an hour.',
            });
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        console.error('POST /api/admin/users error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
