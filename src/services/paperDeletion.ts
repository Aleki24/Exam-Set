/**
 * DELETING A PAPER
 * ----------------------------------------------------------------------------
 * One description of what deleting a paper means, because there are two doors
 * into it — an admin clearing the catalog, and an author tidying their own
 * library — and they were never going to stay in step if each wrote its own
 * rules. The admin route already had a delete; the author had none at all, so a
 * paper you set and saved could be created and never removed.
 *
 * WHAT DELETING MUST NOT TAKE WITH IT
 *
 * The foreign keys onto `exams` are not uniform, and two of them matter:
 *
 *   order_items    RESTRICT  — Postgres itself refuses. A sold paper cannot be
 *                              deleted, full stop, and that is the correct
 *                              guarantee: buyers keep what they paid for.
 *   exam_sessions  CASCADE   — Postgres says nothing and takes them with it.
 *
 * That second one is the dangerous one. A paper somebody has actually sat
 * carries their answers, their marks and their results, and deleting the paper
 * would erase all of it without a word — no error, no warning, just a smaller
 * table. Nothing in the product asks for that, so this refuses it. The same
 * principle as the sold-paper rule, applied to the other thing a person can
 * have invested in a paper: buyers keep their downloads, learners keep their
 * results.
 *
 * The questions are never touched. A set paper is a list of ids pointing into
 * the bank; deleting the paper deletes the list, not the bank.
 *
 * ORDER OF OPERATIONS
 *
 * The row goes first, then the stored files. Do it the other way and a failed
 * row delete leaves a paper that still exists with its PDF destroyed, which is
 * worse than the alternative: an orphaned file nobody is pointing at. So a
 * storage failure is reported and does not fail the delete — by then the thing
 * the caller asked for has already happened.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { deleteObject, storageUnavailableReason } from '@/utils/storage';

export interface PaperDeleteActor {
    id: string;
    isAdmin: boolean;
}

export interface PaperDeleteRefusal {
    ok: false;
    error: string;
    status: 401 | 403 | 404 | 409 | 500;
}

export interface PaperDeleteSuccess {
    ok: true;
    title: string;
    /** Storage objects removed. Zero is normal for a paper never rendered. */
    filesRemoved: number;
    /** Set when the row went but a file could not be cleaned up behind it. */
    storageWarning?: string;
}

export type PaperDeleteResult = PaperDeleteSuccess | PaperDeleteRefusal;

/**
 * Deletes a paper on behalf of `actor`, or explains why it will not.
 *
 * `supabase` must be a client carrying the actor's own session: the delete is
 * checked here *and* by row level security, and passing a service-role client
 * would quietly skip the second one.
 */
export async function deletePaper(
    supabase: any,
    paperId: string,
    actor: PaperDeleteActor
): Promise<PaperDeleteResult> {
    if (!paperId) return { ok: false, error: 'Missing paper id', status: 404 };

    const { data: paper, error: readError } = await supabase
        .from('exams')
        .select('id, title, created_by, pdf_storage_key, marking_scheme_storage_key')
        .eq('id', paperId)
        .maybeSingle();

    if (readError) return { ok: false, error: readError.message, status: 500 };
    if (!paper) return { ok: false, error: 'Paper not found', status: 404 };

    if (!actor.isAdmin && paper.created_by !== actor.id) {
        return {
            ok: false,
            error: 'This paper belongs to somebody else. Only its author or an admin can delete it.',
            status: 403,
        };
    }

    // Sold. Postgres would refuse this anyway — order_items is RESTRICT — but a
    // foreign key violation reaches the user as a wall of SQL, and the thing
    // they actually want to hear is that unpublishing does what they meant.
    const { data: sold } = await supabase
        .from('order_items')
        .select('id')
        .eq('exam_id', paperId)
        .limit(1);

    if (sold && sold.length > 0) {
        return {
            ok: false,
            error:
                'This paper has been sold, so it cannot be deleted. Unpublish it instead — it leaves the shop and buyers keep their downloads.',
            status: 409,
        };
    }

    // Sat. Nothing in the database would stop this: exam_sessions cascades, so
    // the delete would succeed and take somebody's answers and marks with it.
    const { data: sat } = await supabase
        .from('exam_sessions')
        .select('id')
        .eq('exam_id', paperId)
        .neq('status', 'in_progress')
        .limit(1);

    if (sat && sat.length > 0) {
        return {
            ok: false,
            error:
                'Somebody has sat this paper, so deleting it would erase their answers and results. Unpublish it instead.',
            status: 409,
        };
    }

    const { error: deleteError } = await supabase.from('exams').delete().eq('id', paperId);
    if (deleteError) return { ok: false, error: deleteError.message, status: 500 };

    // The row is gone; everything below is tidying up after it.
    const keys = [paper.pdf_storage_key, paper.marking_scheme_storage_key].filter(
        (key: unknown): key is string => typeof key === 'string' && key.length > 0
    );

    if (keys.length === 0) return { ok: true, title: paper.title, filesRemoved: 0 };

    if (storageUnavailableReason()) {
        return {
            ok: true,
            title: paper.title,
            filesRemoved: 0,
            storageWarning: 'Storage is not configured, so the generated files were left in place.',
        };
    }

    let removed = 0;
    const failed: string[] = [];

    for (const key of keys) {
        try {
            await deleteObject(key);
            removed += 1;
        } catch (err) {
            failed.push(key);
            console.error(
                'Could not remove a stored file for a deleted paper:',
                key,
                err instanceof Error ? err.message : err
            );
        }
    }

    return {
        ok: true,
        title: paper.title,
        filesRemoved: removed,
        storageWarning:
            failed.length > 0
                ? `The paper was deleted, but ${failed.length} stored file(s) could not be removed.`
                : undefined,
    };
}
