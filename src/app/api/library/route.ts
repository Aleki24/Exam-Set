import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { toListing } from '@/lib/paperMapper';

/**
 * GET /api/library — everything the signed-in user can open:
 * papers they bought or claimed, and papers they built in the setter.
 */
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
        const userId = auth.user.id;

        const [{ data: entitlements }, { data: mySets }, { data: orders }] = await Promise.all([
            supabase
                .from('entitlements')
                // The set comes through the nested paper so the library can
                // group a twelve-subject purchase back into the sitting it was
                // bought as, instead of twelve cards in no particular order.
                .select('kind, granted_at, exams(*, exam_sets (id, name, slug))')
                .eq('user_id', userId)
                .order('granted_at', { ascending: false }),
            supabase
                .from('exams')
                .select('*')
                .eq('created_by', userId)
                .eq('source', 'user_set')
                .order('created_at', { ascending: false })
                .limit(100),
            supabase
                .from('orders')
                .select('id, reference, status, total_cents, currency, created_at, paid_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(20),
        ]);

        /* eslint-disable @typescript-eslint/no-explicit-any */
        const purchased = (entitlements || [])
            .filter((row: any) => row.exams)
            .map((row: any) => ({
                ...toListing(row.exams),
                owned: true,
                entitlement_kind: row.kind,
                granted_at: row.granted_at,
            }));

        const sets = (mySets || []).map((row: any) => ({ ...toListing(row), owned: true }));
        /* eslint-enable @typescript-eslint/no-explicit-any */

        return NextResponse.json({ purchased, sets, orders: orders || [] });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
