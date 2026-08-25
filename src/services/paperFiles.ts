/**
 * MAKING SURE A PAPER HAS A FILE
 * ----------------------------------------------------------------------------
 * There are two kinds of paper in the shop and only one of them arrived with a
 * PDF attached.
 *
 *   uploaded  — an admin uploaded the file. Nothing to do.
 *   set       — built in the setter out of the question bank. It is a list of
 *               question ids, and until now it had no file at all, which meant
 *               the shop could list it, price it and take money for it, and then
 *               fail at the only step that mattered.
 *
 * This closes that. The first time anyone asks for a set paper the PDF is
 * rendered from its questions, stored, and recorded on the row — so it is
 * generated once and behaves identically to an uploaded paper ever after. That
 * also keeps the delivery path single: every route downstream signs a storage
 * key and knows nothing about where it came from.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { putObject, signedDownloadUrl, storageUnavailableReason } from '@/utils/storage';
import { isFigureKey } from '@/lib/figures';
import { imageSize } from './imageSize';
import { renderMarkingSchemePdf, renderPaperPdf, type FigureMap } from './paperPdf';

export type PaperAsset = 'paper' | 'scheme';

export interface EnsureResult {
    /** Storage key to sign, when the file lives in storage. */
    storageKey?: string;
    /** A direct URL, for papers that were uploaded with one. */
    directUrl?: string;
    /** Rendered bytes, when storage is unavailable and we fell back to streaming. */
    buffer?: Buffer;
    error?: string;
}

/**
 * Returns something the caller can deliver: a storage key, a direct URL, or —
 * only when storage is not configured — the bytes themselves.
 *
 * `supabase` must be a service-role client. Writing the generated key back to
 * the row is a privileged update, and the buyer requesting the download is
 * usually not the paper's author.
 */
export async function ensurePaperFile(
    supabase: any,
    paper: any,
    asset: PaperAsset
): Promise<EnsureResult> {
    const existingKey = asset === 'scheme' ? paper.marking_scheme_storage_key : paper.pdf_storage_key;
    const existingUrl = asset === 'scheme' ? paper.marking_scheme_url : paper.pdf_url;

    if (existingKey) return { storageKey: existingKey };
    if (existingUrl) return { directUrl: existingUrl };

    // Nothing stored. The only way to produce a file now is from the questions.
    const questionIds: string[] = Array.isArray(paper.question_ids) ? paper.question_ids : [];
    if (questionIds.length === 0) {
        return { error: 'This paper has no file attached yet' };
    }

    const questions = await loadQuestionsInOrder(supabase, questionIds);
    if (questions.length === 0) {
        return { error: 'The questions for this paper are no longer available' };
    }

    /*
     * Figures are fetched here, not in the renderer.
     *
     * `renderPaperPdf` is synchronous by design — every caller hands its Buffer
     * straight into a response — so it cannot reach storage itself. It takes a
     * map of bytes it has already been given, and draws whatever is in it.
     *
     * A marking scheme has no figures: it prints answers, and the diagram
     * belongs to the question paper the candidate is holding.
     */
    const buffer =
        asset === 'scheme'
            ? renderMarkingSchemePdf(paper, questions)
            : renderPaperPdf(paper, questions, undefined, await loadFigures(questions));

    // Storage unconfigured is a deployment problem, not a reason to withhold a
    // paper somebody has paid for — hand back the bytes and let the caller
    // stream them. Nothing is cached, so it costs a re-render each time.
    if (storageUnavailableReason()) {
        return { buffer };
    }

    const key = `generated/${paper.id}/${asset === 'scheme' ? 'marking-scheme' : 'paper'}.pdf`;

    try {
        await putObject(key, buffer, 'application/pdf');
    } catch (err) {
        console.error('Could not store a generated paper:', err instanceof Error ? err.message : err);
        return { buffer };
    }

    // Record it so this only ever happens once. A failure here is not fatal —
    // the download still works, it just regenerates next time.
    const column = asset === 'scheme' ? 'marking_scheme_storage_key' : 'pdf_storage_key';
    const { error } = await supabase.from('exams').update({ [column]: key }).eq('id', paper.id);
    if (error) console.warn('Could not record the generated file key:', error.message);

    return { storageKey: key };
}

/**
 * Loads the questions and puts them back into the order the author chose.
 *
 * Postgres returns rows in whatever order it likes, and `question_ids` is the
 * paper's running order — question 4 following question 3 is the whole point of
 * having set it.
 */
async function loadQuestionsInOrder(supabase: any, ids: string[]): Promise<any[]> {
    const { data, error } = await supabase
        .from('questions')
        .select(
            'id, text, marks, type, options, sub_parts, answer_lines, marking_scheme, topic, ' +
                'image_path, image_caption, image_required'
        )
        .in('id', ids);

    if (error) {
        console.error('Could not load questions for a paper:', error.message);
        return [];
    }

    const byId = new Map((data ?? []).map((q: any) => [q.id, q]));
    return ids.map((id) => byId.get(id)).filter(Boolean) as any[];
}

/**
 * The bytes of every figure this paper needs, keyed by storage key.
 *
 * WHY A MISSING FIGURE IS NOT AN ERROR HERE
 *
 * A buyer has already paid by the time this runs. Refusing the whole download
 * because one image is unreachable would be the worst possible trade: they get
 * nothing instead of thirty-nine good questions and one that reads a little
 * thin. So each fetch fails on its own, is logged, and is left out of the map —
 * and `drawFigure` simply prints the question without it.
 *
 * The place to stop an unanswerable question is before it is ever sold, which
 * is what `image_required` and the guard in `POST /api/papers` are for.
 *
 * Fetched in parallel: a paper can carry a dozen figures and they are
 * independent, so doing them in series would add a dozen round trips to a
 * download somebody is waiting on.
 */
async function loadFigures(questions: any[]): Promise<FigureMap | undefined> {
    if (storageUnavailableReason()) return undefined;

    const keys = [
        ...new Set(
            questions
                .map((q) => String(q.image_path ?? '').trim())
                .filter((key) => key && isFigureKey(key))
        ),
    ];
    if (keys.length === 0) return undefined;

    const figures: FigureMap = new Map();

    await Promise.all(
        keys.map(async (key) => {
            try {
                const res = await fetch(await signedDownloadUrl(key, 300));
                if (!res.ok) throw new Error(`storage answered ${res.status}`);

                const bytes = new Uint8Array(await res.arrayBuffer());
                const size = imageSize(bytes);
                if (!size || size.width < 1 || size.height < 1) {
                    throw new Error('could not read the image dimensions');
                }

                const mediaType = res.headers.get('content-type') || 'image/jpeg';
                figures.set(key, {
                    dataUrl: `data:${mediaType};base64,${Buffer.from(bytes).toString('base64')}`,
                    width: size.width,
                    height: size.height,
                });
            } catch (err) {
                console.error(
                    `Figure ${key} left out of a paper:`,
                    err instanceof Error ? err.message : err
                );
            }
        })
    );

    return figures.size > 0 ? figures : undefined;
}

/** Filename a teacher will recognise in their downloads folder. */
export function paperFilename(paper: any, asset: PaperAsset): string {
    const base = [paper.grade_label, paper.subject, paper.year]
        .filter(Boolean)
        .join('-')
        .replace(/\s+/g, '-');

    const name = (base || paper.title || 'exam-paper').replace(/[^\w-]/g, '');
    return `${name}${asset === 'scheme' ? '-marking-scheme' : ''}.pdf`.toLowerCase();
}
