import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireAdmin } from '@/utils/auth/guards';
import { storageBackend } from '@/utils/storage';
import { getMpesaConfig } from '@/lib/mpesa';
import { createAdminClient } from '@/utils/supabase/admin';

/**
 * GET /api/admin/diagnostics — is this deployment configured?
 *
 * Environment variables are invisible from inside the product, so a missing one
 * shows up as a confusing 503 halfway through an upload. This reports what is
 * actually wired, checked at request time on the server.
 *
 * It reports presence and never values: no secret is returned, and the two
 * public NEXT_PUBLIC_* variables are the only ones echoed back.
 */
export async function GET() {
    try {
        const supabase = await createClient();
        // `fresh` because what follows holds a service-role client, which is not
        // subject to row level security. Everywhere else the database re-checks
        // the role on every statement and a stale token claim cannot get past
        // it; here this guard is the only wall.
        const { failure } = await requireAdmin(supabase, { fresh: true });
        if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

        // Accounts that can never sign in. On this project the built-in mailer
        // reaches only project members, so an unconfirmed account is usually a
        // confirmation email that was never delivered rather than a user who
        // ignored one — and it is invisible until somebody complains.
        let blockedAccounts = 0;
        let accountsChecked = false;
        const admin = createAdminClient();
        if (admin) {
            const { data: userPage } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
            if (userPage) {
                accountsChecked = true;
                blockedAccounts = userPage.users.filter(
                    (u) => !u.email_confirmed_at && !u.phone_confirmed_at
                ).length;
            }
        }

        const storage = storageBackend();
        const mpesa = getMpesaConfig();
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || null;
        const paybill = process.env.NEXT_PUBLIC_MPESA_PAYBILL || process.env.NEXT_PUBLIC_MPESA_TILL || null;

        const checks = [
            {
                id: 'storage',
                label: 'Paper storage',
                ok: storage !== 'none',
                detail:
                    storage === 'r2'
                        ? 'Cloudflare R2'
                        : storage === 'supabase'
                          ? 'Supabase Storage'
                          : 'Not configured — uploads and paid downloads will fail',
                fix: storage === 'none' ? 'Set SUPABASE_SERVICE_ROLE_KEY, or all four R2_* variables.' : null,
            },
            {
                id: 'payments',
                label: 'M-Pesa',
                // Manual confirmation is a valid mode, not a failure — as long as
                // buyers can see a paybill to pay to.
                ok: Boolean(mpesa) || Boolean(paybill),
                detail: mpesa
                    ? `STK push (${mpesa.env})`
                    : paybill
                      ? 'Manual confirmation — buyers pay to the paybill, an admin confirms'
                      : 'No payment route: no Daraja credentials and no paybill to show',
                fix: !mpesa && !paybill ? 'Set NEXT_PUBLIC_MPESA_PAYBILL, or the four MPESA_* variables.' : null,
            },
            {
                id: 'callback',
                label: 'Public URL',
                // Only actually required once STK push is live, since that is what
                // builds the callback Safaricom posts back to.
                ok: Boolean(baseUrl) || !mpesa,
                detail: baseUrl ?? 'Not set',
                fix: !baseUrl && mpesa ? 'Set NEXT_PUBLIC_BASE_URL — the M-Pesa callback URL is built from it.' : null,
            },
        ];

        if (accountsChecked) {
            checks.push({
                id: 'accounts',
                label: 'Sign-in',
                ok: blockedAccounts === 0,
                detail:
                    blockedAccounts === 0
                        ? 'Every account can sign in'
                        : `${blockedAccounts} account${blockedAccounts === 1 ? '' : 's'} cannot sign in — the address was never confirmed`,
                fix:
                    blockedAccounts > 0
                        ? 'Confirm them from Team, or turn off "Confirm email" in Supabase → Authentication → Providers, or configure SMTP so the emails actually arrive.'
                        : null,
            });
        }

        return NextResponse.json({
            ready: checks.every((c) => c.ok),
            checks,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
