'use client';

import React, { useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { FIGURE_TYPES, MAX_FIGURE_BYTES, figureUrl } from '@/lib/figures';

/**
 * THE DIAGRAM ON A QUESTION.
 *
 * A large share of a Kenyan science or maths paper is unanswerable as text: a
 * velocity-time graph, a ray diagram, a map extract, a titration curve. The
 * extractor pulls the words out of a scanned paper and leaves the picture
 * behind, so every one of those questions arrives in the review queue looking
 * complete and printing as nonsense. This is where a person puts the picture
 * back.
 *
 * THREE ROUND TRIPS, NOT ONE
 *
 *   1. ask `/sign` for somewhere to put it
 *   2. PUT the bytes straight at the bucket
 *   3. tell `/figure` it landed
 *
 * The middle step skips the server entirely, which is the only way a photo of a
 * textbook page gets uploaded at all — a multipart POST to a route handler dies
 * at Vercel's ~4.5 MB body limit. It is the same shape `/papers/new` uses for
 * paper PDFs, for the same reason.
 *
 * Step 3 is not bookkeeping. `image_path` is set only after the server has
 * confirmed the object is really in the bucket, so a failed upload leaves the
 * question honestly figure-less rather than pointing at a blank box.
 */

interface Props {
    questionId: string;
    imagePath: string | null;
    imageCaption: string | null;
    imageRequired: boolean;
    /** Lets the parent list keep its own copy in step. */
    onChange: (patch: {
        image_path?: string | null;
        image_caption?: string | null;
        image_required?: boolean;
    }) => void;
}

const ACCEPT = Object.keys(FIGURE_TYPES).join(',');
const MAX_MB = Math.round(MAX_FIGURE_BYTES / (1024 * 1024));

export default function FigureControl({
    questionId,
    imagePath,
    imageCaption,
    imageRequired,
    onChange,
}: Props) {
    const inputRef = useRef<HTMLInputElement>(null);

    const [busy, setBusy] = useState<'idle' | 'uploading' | 'saving'>('idle');
    const [dragging, setDragging] = useState(false);
    const [caption, setCaption] = useState(imageCaption ?? '');

    /**
     * Beats the cache on a replacement.
     *
     * `/api/questions/figure` answers `immutable, max-age=31536000`, which is
     * right — a figure at a given key never changes for a buyer. But the key is
     * the question id, so uploading a *corrected* crop writes the same key, and
     * without this the reviewer would go on looking at the wrong picture for a
     * year while every buyer got the right one. The serving route ignores
     * parameters it does not know.
     */
    const [version, setVersion] = useState(0);

    const upload = async (file: File) => {
        if (!FIGURE_TYPES[file.type]) {
            toast.error('A figure must be a JPG, PNG or WebP image.');
            return;
        }
        if (file.size > MAX_FIGURE_BYTES) {
            toast.error(
                `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. Crop it to the diagram — ${MAX_MB} MB is the limit.`
            );
            return;
        }

        setBusy('uploading');
        try {
            const signRes = await fetch('/api/admin/questions/figure/sign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ questionId, contentType: file.type, size: file.size }),
            });
            const ticket = await signRes.json();
            if (!signRes.ok) throw new Error(ticket.error || 'Could not start the upload');

            const put = await fetch(ticket.url, {
                method: ticket.method,
                headers: ticket.headers,
                body: file,
            });
            // The bucket answers, not this app, so there is no message to read
            // out — the status code is the only thing there is to report.
            if (!put.ok) throw new Error(`The bucket refused the upload (${put.status}).`);

            const attachRes = await fetch('/api/admin/questions/figure', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ questionId, key: ticket.key, caption }),
            });
            const attached = await attachRes.json();
            if (!attachRes.ok) throw new Error(attached.error || 'Could not attach that figure');

            onChange({ image_path: ticket.key });
            setVersion((v) => v + 1);
            toast.success('Figure attached');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not upload that image');
        } finally {
            setBusy('idle');
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    const save = async (patch: { caption?: string; required?: boolean }) => {
        setBusy('saving');
        try {
            const res = await fetch('/api/admin/questions/figure', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ questionId, ...patch }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not save');

            onChange({
                ...(patch.caption !== undefined ? { image_caption: patch.caption || null } : {}),
                ...(patch.required !== undefined ? { image_required: patch.required } : {}),
            });
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not save');
        } finally {
            setBusy('idle');
        }
    };

    const remove = async () => {
        setBusy('saving');
        try {
            const res = await fetch(
                `/api/admin/questions/figure?questionId=${encodeURIComponent(questionId)}`,
                { method: 'DELETE' }
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not remove that figure');

            onChange({ image_path: null, image_caption: null });
            setCaption('');
            toast.success('Figure removed');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not remove that figure');
        } finally {
            setBusy('idle');
        }
    };

    const working = busy !== 'idle';

    return (
        <div className="mt-4 border-t border-border pt-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <p className="overline">Figure</p>

                {/* Settable with no figure attached, on purpose: it is how a
                    reviewer records "this needs a picture and has not got one",
                    which is the state the paper builder refuses to sell. */}
                <label className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
                    <input
                        type="checkbox"
                        checked={imageRequired}
                        disabled={working}
                        onChange={(e) => void save({ required: e.target.checked })}
                        className="h-4 w-4"
                    />
                    Cannot be answered without it
                </label>
            </div>

            {/* The warning that earns this whole control. A question flagged as
                needing a figure, with none attached, will be kept out of every
                paper — so it is worth more than a quiet empty state. */}
            {imageRequired && !imagePath && (
                <p className="mt-2 flex items-start gap-2 text-[13px] text-accent">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    No figure attached, so this question cannot go into a paper. Add one, or
                    untick the box if the question reads without it.
                </p>
            )}

            <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void upload(file);
                }}
            />

            {imagePath ? (
                <div className="mt-3">
                    {/* Plain <img>: next/image wants a known host, and these are
                        streamed from a private bucket through our own route. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={`${figureUrl(imagePath)}&v=${version}`}
                        alt={imageCaption || 'Figure for this question'}
                        className="max-h-64 w-auto max-w-full rounded-md border border-border bg-white"
                    />

                    <div className="mt-3 flex flex-wrap items-end gap-2">
                        <div className="min-w-48 flex-1">
                            <label className="label" htmlFor={`caption-${questionId}`}>
                                Caption (printed under the figure)
                            </label>
                            <input
                                id={`caption-${questionId}`}
                                className="field"
                                value={caption}
                                disabled={working}
                                placeholder="Figure 1"
                                onChange={(e) => setCaption(e.target.value)}
                                onBlur={() => {
                                    if (caption.trim() !== (imageCaption ?? '')) {
                                        void save({ caption });
                                    }
                                }}
                            />
                        </div>

                        <button
                            type="button"
                            disabled={working}
                            onClick={() => inputRef.current?.click()}
                            className="btn-outline btn-sm"
                        >
                            {busy === 'uploading' ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            ) : (
                                <ImagePlus className="h-3.5 w-3.5" aria-hidden />
                            )}
                            Replace
                        </button>

                        <button
                            type="button"
                            disabled={working}
                            onClick={() => void remove()}
                            className="btn-ghost btn-sm"
                        >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            Remove
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    disabled={working}
                    onClick={() => inputRef.current?.click()}
                    onDragOver={(e) => {
                        e.preventDefault();
                        setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setDragging(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) void upload(file);
                    }}
                    className={`mt-3 flex min-h-16 w-full items-center justify-center gap-2 rounded-md border border-dashed px-3 text-sm font-semibold transition-all duration-150 ${
                        dragging
                            ? 'border-primary bg-primary/5 text-foreground'
                            : 'border-border text-muted-foreground hover:border-primary hover:bg-primary/[0.03] hover:text-foreground'
                    }`}
                >
                    {busy === 'uploading' ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            Uploading…
                        </>
                    ) : (
                        <>
                            <ImagePlus className="h-4 w-4" aria-hidden />
                            Drop a diagram here, or choose one
                        </>
                    )}
                </button>
            )}
        </div>
    );
}
