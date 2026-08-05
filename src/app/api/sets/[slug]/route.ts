import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { toListing } from '@/lib/paperMapper';
import { applyPaperFilters } from '@/services/paperSearch';
import type { PaperListing } from '@/types/shop';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * GET /api/sets/[slug] — one sitting and the papers in it.
 *
 * Accepts a slug or an id, the same way /api/papers/[id] does, so a link built
 * from either works.
 *
 * The papers come back through the same filter builder the shop and the bot use,
 * so a set page cannot show a paper the shop would hide. Ownership is marked the
 * same way the listing does it, because the point of this page is a buyer
 * deciding what is left to buy.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, context: { params: Promise<{ slug: string }> }) {
    try {
        const { slug } = await context.params;
        const supabase = await createClient();

        const { data: set, error: setError } = await supabase
            .from('exam_sets')
            .select('id, slug, name, institution, exam_type, term_slug, year, level_slug, description, is_published')
            .eq(UUID.test(slug) ? 'id' : 'slug', slug)
            .maybeSingle();

        if (setError) {
            console.error('GET /api/sets/[slug] failed:', setError.message);
            return NextResponse.json({ error: setError.message }, { status: 500 });
        }
        // Row level security has already hidden unpublished sets from anyone but
        // an admin, so a miss here is genuinely "no such set" for this caller.
        if (!set) return NextResponse.json({ error: 'Set not found' }, { status: 404 });

        let query: any = supabase
            .from('exams')
            .select('*')
            .eq('source', 'catalog')
            .eq('is_published', true);

        query = applyPaperFilters(query, { setIds: [set.id] });

        const { data: rows, error } = await query
            .order('subject', { ascending: true })
            .order('paper_number', { ascending: true, nullsFirst: true })
            .limit(200);

        if (error) {
            console.error('GET /api/sets/[slug] papers failed:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const papers: PaperListing[] = (rows ?? []).map((row: any) => ({
            ...toListing(row),
            set_name: set.name,
            set_slug: set.slug,
        }));

        // Which of these the caller already owns, so the page can offer "add the
        // rest" rather than asking somebody to buy what they have. Same shape as
        // the shop listing uses, deliberately.
        const { data: auth } = await supabase.auth.getUser();
        let ownedIds = new Set<string>();
        if (auth?.user) {
            const { data: ents } = await supabase
                .from('entitlements')
                .select('exam_id')
                .eq('user_id', auth.user.id);
            ownedIds = new Set((ents ?? []).map((e: any) => e.exam_id as string));
        }
        for (const paper of papers) {
            paper.owned = ownedIds.has(paper.id) || paper.price_cents === 0;
        }

        return NextResponse.json({
            set: { ...set, paper_count: papers.length },
            papers,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not load the set';
        console.error('GET /api/sets/[slug] error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
