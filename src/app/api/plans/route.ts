import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { daysLeft } from '@/lib/plans';

/**
 * GET /api/plans — what an all-access pass costs, and whether the caller has one.
 *
 * Both halves in one response because every screen that shows the plans also
 * needs to know whether to offer them or to say "you already have this".
 * Readable signed out: the price is the pitch, so it must not be behind a login.
 */
export async function GET() {
    try {
        const supabase = await createClient();

        const { data: plans, error } = await supabase
            .from('subscription_plans')
            .select('slug, name, description, price_cents, currency, duration_days, sort_order, is_featured')
            .eq('is_active', true)
            .order('sort_order');

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
            return NextResponse.json({ plans: plans || [], subscription: { active: false } });
        }

        // Row level security limits this to the caller's own rows. `expires_at`
        // is the authority, not `status` — nothing runs on a schedule to flip
        // the label, so a lapsed row can still read 'active'.
        const { data: sub } = await supabase
            .from('subscriptions')
            .select('plan_slug, expires_at, status')
            .eq('user_id', auth.user.id)
            .eq('status', 'active')
            .gt('expires_at', new Date().toISOString())
            .order('expires_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!sub) {
            return NextResponse.json({ plans: plans || [], subscription: { active: false } });
        }

        const plan = (plans || []).find((p) => p.slug === sub.plan_slug);

        return NextResponse.json({
            plans: plans || [],
            subscription: {
                active: true,
                plan_slug: sub.plan_slug,
                plan_name: plan?.name ?? sub.plan_slug,
                expires_at: sub.expires_at,
                days_left: daysLeft(sub.expires_at),
            },
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
