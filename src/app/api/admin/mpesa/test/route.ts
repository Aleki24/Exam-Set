import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireAdmin } from '@/utils/auth/guards';
import { collectionMode, getMpesaConfig, mpesaAuthCheck } from '@/lib/mpesa';

/**
 * POST /api/admin/mpesa/test — do these Daraja credentials actually work?
 *
 * Otherwise the first proof that payments are wired up correctly is a customer
 * failing to pay, which is the worst possible place to find out. This does the
 * OAuth handshake and nothing else: no prompt is sent, no phone rings, and no
 * money moves. It answers the one question the environment cannot — whether
 * Safaricom accepts this key and secret — and reports which shortcode and which
 * collection mode the deployment is actually running.
 *
 * A POST rather than a GET because it calls out to Safaricom, and because it is
 * an action a person takes rather than something a page load should trigger.
 */
export async function POST() {
    try {
        const supabase = await createClient();
        const { failure } = await requireAdmin(supabase, { fresh: true });
        if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

        const config = getMpesaConfig();
        if (!config) {
            return NextResponse.json({
                ok: false,
                detail:
                    'Daraja is not configured. Set MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, ' +
                    'MPESA_SHORTCODE, MPESA_PASSKEY and NEXT_PUBLIC_BASE_URL, then redeploy.',
            });
        }

        const mode = collectionMode(config);
        // Nothing secret is echoed. The shortcode and till are printed on
        // receipts and shop counters; the key, secret and passkey never leave
        // the server.
        const where =
            mode === 'buy-goods'
                ? `Buy Goods — till ${config.till}, authenticating as ${config.shortcode}`
                : `PayBill ${config.shortcode}`;

        const result = await mpesaAuthCheck(config);

        return NextResponse.json({
            ok: result.ok,
            environment: config.env,
            mode,
            detail: result.ok
                ? `Safaricom accepted these credentials. ${where}. Callback: ${config.callbackUrl}`
                : `Safaricom rejected these credentials: ${result.error}`,
            callbackUrl: config.callbackUrl,
            fix: result.ok
                ? null
                : 'Check MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET, and that MPESA_ENV matches the app they belong to — sandbox keys are rejected in production and the reverse.',
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not reach Safaricom';
        return NextResponse.json({ ok: false, detail: message }, { status: 500 });
    }
}
