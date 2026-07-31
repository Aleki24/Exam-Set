import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { missingSupabaseEnv, supabaseAnonKey, supabaseUrl } from '@/lib/supabaseEnv';

/**
 * GET /api/health — can this deployment reach its database?
 *
 * Deliberately public and deliberately unauthenticated, because the failure it
 * exists to diagnose is the one that makes signing in impossible. An admin-only
 * diagnostic cannot tell you why nobody can become an admin.
 *
 * It reports presence and counts, never values. No key, no connection string and
 * no row content is returned, so there is nothing here worth stealing: an
 * attacker already knows whether the site works by trying to use it.
 */

export const dynamic = 'force-dynamic';

export async function GET() {
    const missing = missingSupabaseEnv();

    if (missing.length > 0) {
        return NextResponse.json(
            {
                ok: false,
                problem: 'supabase_env_missing',
                missing,
                fix:
                    'Set these in your hosting environment variables and redeploy. The public key is ' +
                    'accepted as NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or ' +
                    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY.',
            },
            { status: 503 }
        );
    }

    // Exercise the same path the browser uses: the public key against RLS. If
    // this succeeds, the question bank and sign-in have what they need.
    try {
        const supabase = createClient(supabaseUrl()!, supabaseAnonKey()!, {
            auth: { persistSession: false, autoRefreshToken: false },
        });

        const [questions, papers] = await Promise.all([
            supabase.from('questions').select('id', { count: 'exact', head: true }),
            supabase
                .from('exams')
                .select('id', { count: 'exact', head: true })
                .eq('source', 'catalog')
                .eq('is_published', true),
        ]);

        if (questions.error) {
            // A refused connection and a refused row look the same from here
            // until you check: PostgREST always names the reason, so a blank or
            // network-shaped message means the request never arrived.
            const detail = questions.error.message?.trim();
            const neverArrived =
                !detail || /fetch failed|network|timeout|econnrefused|enotfound/i.test(detail);

            return NextResponse.json(
                {
                    ok: false,
                    problem: neverArrived ? 'supabase_unreachable' : 'question_bank_unreadable',
                    detail: detail || 'The request to Supabase did not complete.',
                    fix: neverArrived
                        ? 'Check that NEXT_PUBLIC_SUPABASE_URL points at the right project and that the project is not paused.'
                        : 'Check that row level security still allows a public SELECT on questions.',
                },
                { status: 503 }
            );
        }

        return NextResponse.json({
            ok: true,
            supabase: 'reachable',
            questionsVisibleToPublic: questions.count ?? 0,
            publishedPapers: papers.count ?? 0,
        });
    } catch (err) {
        return NextResponse.json(
            {
                ok: false,
                problem: 'supabase_unreachable',
                detail: err instanceof Error ? err.message : 'Unknown error',
            },
            { status: 503 }
        );
    }
}
