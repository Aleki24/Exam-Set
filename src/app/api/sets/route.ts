import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireAdmin } from '@/utils/auth/guards';
import {
    forgetStockedSets,
    setFingerprint,
    setSlugStem,
    suggestSetName,
    withPaperCounts,
    type ExamSetSummary,
} from '@/lib/examSets';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * EXAM SETS — the sittings a paper can belong to.
 *
 * GET  /api/sets   list published sets, with the member count each caller may see
 * POST /api/sets   admin: find an existing set matching a paper, or create one
 *
 * A set is a grouping, never a product. There is no price here and no download
 * route beside it — buying "the whole set" adds its members to the cart, and
 * each paper is paid for and released by exactly the gate it always was.
 */

const MAX_SETS = 200;

export async function GET(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { searchParams } = new URL(req.url);

        const search = searchParams.get('search')?.trim() || '';
        const institution = searchParams.get('institution')?.trim() || '';
        const examType = searchParams.get('exam_type') || '';
        const term = searchParams.get('term') || '';
        const year = searchParams.get('year') || '';
        const limit = Math.min(parseInt(searchParams.get('limit') || '50'), MAX_SETS);

        let query: any = supabase
            .from('exam_sets')
            .select('id, slug, name, institution, exam_type, term_slug, year, level_slug, description')
            .eq('is_published', true);

        // Institution is matched loosely on purpose: this endpoint's main caller
        // is the upload form, which is asking "has this school's sitting already
        // been created?" while somebody is still typing the school's name.
        if (institution) {
            query = query.ilike('institution', `%${institution.replace(/[,()%]/g, ' ').trim()}%`);
        }
        if (examType) query = query.eq('exam_type', examType);
        if (term) query = query.eq('term_slug', term);
        if (year) query = query.eq('year', Number(year));
        if (search) {
            const safe = search.replace(/[,()]/g, ' ').trim();
            if (safe) query = query.or(`name.ilike.%${safe}%,institution.ilike.%${safe}%`);
        }

        const { data, error } = await query
            .order('year', { ascending: false, nullsFirst: false })
            .order('name', { ascending: true })
            .limit(limit);

        if (error) {
            console.error('GET /api/sets failed:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const sets = (data ?? []) as ExamSetSummary[];
        return NextResponse.json({ sets: await withPaperCounts(supabase, sets) });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not load sets';
        console.error('GET /api/sets error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * POST /api/sets — find the set this paper belongs to, or create it.
 *
 * Called by the upload form. Find-or-create rather than plain create because the
 * twelfth subject of a sitting must land in the same set as the first, and the
 * person uploading should not have to remember which of "Kabras Mock Term 2" and
 * "Kabras Mock End Term 2" they typed the first time.
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();

        // Sets group shop stock, so creating one is the same admin action as
        // stocking the shop. Teachers' own papers are never in a set.
        const { actor, failure } = await requireAdmin(supabase);
        if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

        const body = await req.json();
        const fields = {
            institution: body.institution?.trim() || null,
            exam_type: body.exam_type || null,
            term_slug: body.term_slug || null,
            year: body.year ? Number(body.year) : null,
            level_slug: body.level_slug || null,
        };

        if (!fields.institution && !body.name) {
            return NextResponse.json(
                { error: 'A set needs a school name or a name of its own' },
                { status: 400 }
            );
        }

        // An explicit id wins: the uploader picked an existing set from the list
        // and their choice is not a hint to be re-derived.
        if (body.set_id) {
            const { data } = await supabase
                .from('exam_sets')
                .select('id, slug, name, institution, exam_type, term_slug, year, level_slug')
                .eq('id', body.set_id)
                .maybeSingle();
            if (data) return NextResponse.json({ set: data, created: false });
        }

        const existing = await findByFingerprint(supabase, fields);
        if (existing) return NextResponse.json({ set: existing, created: false });

        const name = (body.name?.trim() || suggestSetName(fields)).slice(0, 160);
        const slug = await uniqueSetSlug(supabase, setSlugStem(name));

        const { data, error } = await supabase
            .from('exam_sets')
            .insert({
                ...fields,
                name,
                slug,
                description: body.description || null,
                is_published: body.is_published !== false,
                created_by: actor.id,
            })
            .select('id, slug, name, institution, exam_type, term_slug, year, level_slug')
            .single();

        if (error) {
            console.error('set insert failed:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // The WhatsApp parser matches against a cached list of stocked sets. A
        // set nobody can say out loud until the cache expires is a set that
        // looks broken for five minutes after it is made.
        forgetStockedSets();

        return NextResponse.json({ set: data, created: true }, { status: 201 });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not save the set';
        console.error('POST /api/sets error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * The existing set for a sitting, matched on the natural key.
 *
 * The comparison is done here rather than in SQL because `setFingerprint` is the
 * one definition of "the same sitting" and it is shared with the upload form,
 * which needs to make the same judgement before it has sent anything.
 */
async function findByFingerprint(supabase: any, fields: any): Promise<any | null> {
    if (!fields.institution) return null;

    const { data, error } = await supabase
        .from('exam_sets')
        .select('id, slug, name, institution, exam_type, term_slug, year, level_slug')
        .ilike('institution', fields.institution)
        .limit(50);

    if (error || !data?.length) return null;

    const wanted = setFingerprint(fields);
    return data.find((row: any) => setFingerprint(row) === wanted) ?? null;
}

/** Mirrors `uniqueSlug` in /api/papers: append a counter until the slug is free. */
async function uniqueSetSlug(supabase: any, stem: string): Promise<string> {
    let candidate = stem;
    for (let i = 2; i < 100; i++) {
        const { data } = await supabase
            .from('exam_sets')
            .select('id')
            .eq('slug', candidate)
            .maybeSingle();
        if (!data) return candidate;
        candidate = `${stem}-${i}`;
    }
    return `${stem}-${Date.now()}`;
}
