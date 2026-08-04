import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireAdmin } from '@/utils/auth/guards';
import { generateSchemes } from '@/services/schemeGeneration';

/**
 * FILLING IN THE MISSING MARKING SCHEMES
 * ----------------------------------------------------------------------------
 * Three operations, three verbs, and only one of them writes:
 *
 *   GET    the next batch of questions with no marking scheme yet.
 *   POST   ask the AI to propose one for a given set of ids — read-only.
 *   PATCH  save the schemes an admin has actually reviewed and approved.
 *
 * GET and POST never touch a row. Only PATCH does, and only for the ids and
 * text it is given — an admin has to have looked at every one of them first,
 * because that review is the entire justification for using AI here at all.
 * See services/schemeGeneration for why a wrong scheme is a worse mistake than
 * a wrong question: it is invisible until it marks a real answer incorrectly,
 * on a question that may already be sold.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const BATCH_LIMIT = 25;
const MAX_SCHEME_LENGTH = 4000;

/** GET /api/admin/questions/marking-schemes — the next batch missing a scheme. */
export async function GET(req: NextRequest) {
    const supabase = await createClient();
    const { failure } = await requireAdmin(supabase);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    const limit = Math.min(BATCH_LIMIT, Math.max(1, Number(req.nextUrl.searchParams.get('limit')) || BATCH_LIMIT));

    const [{ count: totalMissing }, { data, error }] = await Promise.all([
        supabase
            .from('questions')
            .select('id', { count: 'exact', head: true })
            .or('marking_scheme.is.null,marking_scheme.eq.'),
        supabase
            .from('questions')
            .select('id, text, type, marks, options, topic, marking_scheme')
            .or('marking_scheme.is.null,marking_scheme.eq.')
            .order('created_at', { ascending: true })
            .limit(limit),
    ]);

    if (error) {
        console.error('GET /api/admin/questions/marking-schemes failed:', error.message);
        return NextResponse.json({ error: 'Could not load questions' }, { status: 500 });
    }

    return NextResponse.json({
        questions: data ?? [],
        remaining: totalMissing ?? 0,
    });
}

/**
 * POST /api/admin/questions/marking-schemes — propose schemes for given ids.
 *
 * Nothing is written. The response is a set of proposals for a human to read,
 * edit or discard — the same contract `/api/questions/extract` keeps for
 * questions themselves.
 */
export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const { failure } = await requireAdmin(supabase);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    let body: { ids?: unknown };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 });
    }

    const ids = Array.isArray(body.ids)
        ? body.ids.filter((id): id is string => typeof id === 'string' && id.length > 0).slice(0, BATCH_LIMIT)
        : [];

    if (ids.length === 0) {
        return NextResponse.json({ error: 'No question ids given' }, { status: 400 });
    }

    const { data: questions, error } = await supabase
        .from('questions')
        .select('id, text, type, marks, options')
        .in('id', ids);

    if (error) {
        console.error('Loading questions for scheme generation failed:', error.message);
        return NextResponse.json({ error: 'Could not load the questions' }, { status: 500 });
    }

    if (!questions || questions.length === 0) {
        return NextResponse.json({ error: 'None of those questions were found' }, { status: 404 });
    }

    const proposals = await generateSchemes(questions as any[]);

    return NextResponse.json({
        proposals: ids
            .filter((id) => proposals.has(id))
            .map((id) => {
                const p = proposals.get(id)!;
                return {
                    id,
                    markingScheme: p.markingScheme,
                    confidence: p.confidence,
                    reason: p.reason,
                };
            }),
    });
}

/**
 * PATCH /api/admin/questions/marking-schemes — save reviewed schemes.
 *
 * Writes only the `marking_scheme` column, and only for rows already missing
 * one — never overwrites a scheme somebody wrote by hand. An admin filling a
 * gap should not be able to accidentally clobber a real one just because both
 * happened to be in the same batch on screen.
 */
export async function PATCH(req: NextRequest) {
    const supabase = await createClient();
    const { failure } = await requireAdmin(supabase);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    let body: { updates?: unknown };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 });
    }

    const updates = Array.isArray(body.updates)
        ? body.updates
              .map((u: any) => ({
                  id: typeof u?.id === 'string' ? u.id : '',
                  markingScheme: typeof u?.markingScheme === 'string' ? u.markingScheme.trim().slice(0, MAX_SCHEME_LENGTH) : '',
              }))
              .filter((u) => u.id && u.markingScheme)
        : [];

    if (updates.length === 0) {
        return NextResponse.json({ error: 'Nothing to save' }, { status: 400 });
    }

    let saved = 0;
    const failed: string[] = [];

    // One statement per row rather than a single bulk write: each carries its
    // own `.or('marking_scheme.is.null,...')` guard, and a bulk update has no
    // way to apply a different WHERE per row.
    for (const update of updates) {
        const { error, count } = await supabase
            .from('questions')
            .update({ marking_scheme: update.markingScheme }, { count: 'exact' })
            .eq('id', update.id)
            .or('marking_scheme.is.null,marking_scheme.eq.');

        if (error) {
            console.error(`Saving scheme for ${update.id} failed:`, error.message);
            failed.push(update.id);
        } else if (!count) {
            // Matched nothing — either the id is gone, or the row already
            // gained a scheme from elsewhere since the batch was generated.
            failed.push(update.id);
        } else {
            saved += 1;
        }
    }

    return NextResponse.json({
        saved,
        failed,
        message:
            failed.length === 0
                ? `Saved ${saved} marking scheme${saved === 1 ? '' : 's'}`
                : `Saved ${saved} of ${updates.length} — ${failed.length} already had a scheme or could not be found`,
    });
}
