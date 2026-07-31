import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireAdmin } from '@/utils/auth/guards';
import { storageBackend } from '@/utils/storage';
import { getMpesaConfig } from '@/lib/mpesa';

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
        const { failure } = await requireAdmin(supabase);
        if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

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

        return NextResponse.json({
            ready: checks.every((c) => c.ok),
            checks,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
