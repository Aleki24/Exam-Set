import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { adminClientMissingMessage, createAdminClient } from '@/utils/supabase/admin';
import { requireAdmin } from '@/utils/auth/guards';
import { deleteObject, objectInfo, storageUnavailableReason } from '@/utils/storage';
import { isFigureKey, isQuestionId } from '@/lib/figures';

/**
 * A question's diagram, once the bytes are in the bucket.
 *
 * POST attaches, PATCH edits the caption and the required flag, DELETE removes.
 * The upload itself never comes through here — see `./sign`.
 *
 * WHY `image_required` IS A SEPARATE THING FROM `image_path`
 *
 * Two different claims, and only a person reading the question can make the
 * second one:
 *
 *   image_path set          the diagram is available and will be printed.
 *   image_required true     the question cannot be answered without it.
 *
 * Most figures are the first: helpful, but "State two uses of a transformer"
 * survives without the picture. The second is "measure angle BAC in the figure
 * below" — sell that in a paper with no figure and the buyer has an
 * unanswerable item. `POST /api/papers` refuses to publish a paper containing
 * one, which is the last moment before money changes hands.
 */

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { failure } = await requireAdmin(supabase);
        if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

        const admin = createAdminClient();
        if (!admin) return NextResponse.json({ error: adminClientMissingMessage() }, { status: 503 });

        const unavailable = storageUnavailableReason();
        if (unavailable) return NextResponse.json({ error: unavailable }, { status: 503 });

        const body = await req.json().catch(() => ({}));
        const questionId = String(body?.questionId || '');
        const key = String(body?.key || '');

        if (!isQuestionId(questionId)) {
            return NextResponse.json({ error: 'Which question?' }, { status: 400 });
        }
        if (!isFigureKey(key)) {
            return NextResponse.json({ error: 'Not a figure key.' }, { status: 400 });
        }

        /*
         * The browser saying "I uploaded it" is a claim, not proof. Without this
         * a failed or abandoned upload would still set `image_path`, and the
         * paper would render a blank box where the graph should be — discovered
         * by whoever paid for it.
         */
        const info = await objectInfo(key);
        if (!info) {
            return NextResponse.json(
                { error: 'That image is not in the bucket. The upload did not finish — try again.' },
                { status: 422 }
            );
        }

        const patch: Record<string, unknown> = { image_path: key };
        if (typeof body.caption === 'string') patch.image_caption = body.caption.trim() || null;
        if (typeof body.required === 'boolean') patch.image_required = body.required;

        const { error } = await admin.from('questions').update(patch).eq('id', questionId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        return NextResponse.json({ ok: true, key, bytes: info.size });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not attach that figure';
        console.error('POST /api/admin/questions/figure:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * PATCH — the caption and the required flag, without re-uploading.
 *
 * `required` is settable on a question that has no figure yet. That is
 * deliberate: it is how a reviewer records "this one needs a picture and has
 * not got one", which is the state that keeps it out of a paper.
 */
export async function PATCH(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { failure } = await requireAdmin(supabase);
        if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

        const admin = createAdminClient();
        if (!admin) return NextResponse.json({ error: adminClientMissingMessage() }, { status: 503 });

        const body = await req.json().catch(() => ({}));
        const questionId = String(body?.questionId || '');
        if (!isQuestionId(questionId)) {
            return NextResponse.json({ error: 'Which question?' }, { status: 400 });
        }

        const patch: Record<string, unknown> = {};
        if (typeof body.caption === 'string') patch.image_caption = body.caption.trim() || null;
        if (typeof body.required === 'boolean') patch.image_required = body.required;

        if (Object.keys(patch).length === 0) {
            return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
        }

        const { error } = await admin.from('questions').update(patch).eq('id', questionId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        return NextResponse.json({ ok: true });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not save that';
        console.error('PATCH /api/admin/questions/figure:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * DELETE — take the figure off the question and out of the bucket.
 *
 * The row is cleared first and the object second. If the delete fails the
 * question is already correct and the bucket has one stray file; the other
 * order leaves a question pointing at nothing, which prints a blank box into
 * something somebody bought. A stray file costs a fraction of a cent.
 *
 * The caption goes with it. A caption describing a picture that is no longer
 * there is worse than no caption.
 */
export async function DELETE(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { failure } = await requireAdmin(supabase);
        if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

        const admin = createAdminClient();
        if (!admin) return NextResponse.json({ error: adminClientMissingMessage() }, { status: 503 });

        const questionId = new URL(req.url).searchParams.get('questionId') || '';
        if (!isQuestionId(questionId)) {
            return NextResponse.json({ error: 'Which question?' }, { status: 400 });
        }

        const { data: question, error: readError } = await admin
            .from('questions')
            .select('image_path')
            .eq('id', questionId)
            .maybeSingle();

        if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
        if (!question) return NextResponse.json({ error: 'No such question.' }, { status: 404 });

        const { error } = await admin
            .from('questions')
            .update({ image_path: null, image_caption: null })
            .eq('id', questionId);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        const key = question.image_path;
        if (key && isFigureKey(key) && !storageUnavailableReason()) {
            // Best effort. The question is already correct; a file left behind
            // is not worth failing the request the reviewer asked for.
            await deleteObject(key).catch((err) => {
                console.error(`Figure removed from ${questionId} but ${key} is still in the bucket:`, err);
            });
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not remove that figure';
        console.error('DELETE /api/admin/questions/figure:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
