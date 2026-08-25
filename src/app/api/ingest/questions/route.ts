import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { presentedKey, resolveKey } from '@/lib/ingestKeys';
import { normaliseIngest, type IngestQuestion } from '@/lib/ingestQuestions';

/**
 * POST /api/ingest/questions — a program contributes to the bank.
 *
 * This is the door the MCP server writes through, so that generating a term of
 * questions is a conversation rather than an afternoon of typing. It is also
 * the reason the bank is worth filling at all: a question in here is sold many
 * times over — inside a generated paper, inside a topical set, inside the
 * setter, inside practice — where an uploaded PDF is sold once.
 *
 * WHY THIS TAKES QUESTIONS AND NOT A FINISHED PDF
 *
 * A model can produce a PDF. It cannot produce *this* PDF: the renderer here
 * already lays out a Kenyan paper properly — examiner's table, CBE rubric,
 * name and admission boxes, black text at five kilobytes. Accepting structured
 * questions means every generated paper looks like every other paper in the
 * shop, the marking scheme comes from the same data rather than a second file
 * that can disagree with it, and a typo is one field to correct rather than a
 * document to remake.
 *
 * NOTHING HERE REACHES A BUYER
 *
 * Every question lands `pending`, whatever the caller asks for, and the row
 * level security policy added in migration 041 keeps pending questions out of
 * the public bank. A person approves them in /admin. The whole argument for
 * letting a model write into a shop is that a human still decides what is sold.
 *
 * A marking scheme is required rather than encouraged. The site's own title
 * sells "papers & marking schemes", and 203 of the first 253 questions arrived
 * without one — which is exactly how a paper somebody paid for comes to print
 * "No marking scheme recorded for this question".
 */

export const maxDuration = 60;

const MAX_BATCH = 50;

export async function POST(req: NextRequest) {
    try {
        const admin = createAdminClient();
        if (!admin) {
            return NextResponse.json({ error: 'Ingest is not configured on this deployment.' }, { status: 503 });
        }

        const presented = presentedKey(req.headers);
        if (!presented) {
            return NextResponse.json(
                { error: 'Missing ingest key. Send it as `Authorization: Bearer <key>`.' },
                { status: 401 }
            );
        }

        const owner = await resolveKey(admin, presented);
        if (!owner) {
            return NextResponse.json({ error: 'That ingest key is not valid or has been revoked.' }, { status: 401 });
        }

        let body: unknown;
        try {
            body = await req.json();
        } catch {
            return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 });
        }

        const raw = (body as { questions?: unknown })?.questions;
        if (!Array.isArray(raw) || raw.length === 0) {
            return NextResponse.json({ error: 'Send `questions`: a non-empty array.' }, { status: 400 });
        }
        if (raw.length > MAX_BATCH) {
            return NextResponse.json(
                { error: `${MAX_BATCH} questions at a time. Send ${raw.length} in smaller batches.` },
                { status: 400 }
            );
        }

        /*
         * Resolve the taxonomy once for the whole batch rather than per
         * question.
         *
         * `curriculum_id` and `level` come along because grade names are not
         * unique: there are two rows called "Grade 9" — one CBC, one IGCSE —
         * and the IGCSE one has no level for the setter's filter to match.
         * Choosing blindly between them writes a question that exists in the
         * table and can never be found in the product.
         */
        const [{ data: subjects }, { data: grades }, { data: cbc }] = await Promise.all([
            admin.from('subjects').select('id, name'),
            admin.from('grades').select('id, name, curriculum_id, level'),
            admin.from('curriculums').select('id').eq('name', 'CBC').maybeSingle(),
        ]);

        const { rows, rejected } = normaliseIngest(raw as IngestQuestion[], {
            subjects: (subjects ?? []).map((row) => ({ id: row.id, name: row.name })),
            grades: (grades ?? []).map((row) => ({
                id: row.id,
                name: row.name,
                curriculumId: row.curriculum_id,
                level: row.level,
            })),
            // CBC unless a caller ever needs otherwise: every question in this
            // bank is CBC, and an untagged one is invisible to the setter.
            curriculumId: cbc?.id ?? null,
            createdBy: owner.userId,
        });

        if (rows.length === 0) {
            return NextResponse.json(
                { accepted: 0, rejected, error: 'Nothing in that batch could be accepted.' },
                { status: 400 }
            );
        }

        const { data, error } = await admin.from('questions').insert(rows).select('id');
        if (error) {
            console.error('POST /api/ingest/questions insert failed:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(
            {
                accepted: data?.length ?? 0,
                rejected,
                review_status: 'pending',
                note: 'Held for review. Approve them in /admin before they can be used in a paper that is sold.',
            },
            { status: 201 }
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        console.error('POST src/app/api/ingest/questions/route.ts:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
