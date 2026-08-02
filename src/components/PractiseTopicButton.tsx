'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Dumbbell, Loader2 } from 'lucide-react';

/**
 * Turns a weak topic into the next thing to do.
 *
 * The weakest-topic list was a diagnosis with no treatment: it said Geometry
 * was costing marks and left the learner to go and find some Geometry. This
 * builds a short set on that strand and drops them straight into it.
 *
 * A 404 here is an ordinary outcome, not a fault — the bank genuinely may hold
 * no markable questions on a topic yet — so it is reported as a plain sentence
 * rather than an error. Promising practice and delivering an empty paper would
 * be worse than saying there is none.
 */
export default function PractiseTopicButton({
    topic,
    subject,
    className = 'btn-primary btn-sm',
}: {
    topic: string;
    subject?: string | null;
    className?: string;
}) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    const start = async () => {
        setBusy(true);
        try {
            const res = await fetch('/api/practice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic, subject }),
            });
            const data = await res.json();

            if (!res.ok) {
                if (data.empty) {
                    toast.message('Nothing to practise yet', { description: data.error });
                } else {
                    toast.error(data.error ?? 'Could not build a practice set');
                }
                return;
            }

            if (data.short) {
                toast.message(`${data.questionCount} questions on ${topic}`, {
                    description: 'That is everything markable we have on this topic so far.',
                });
            }

            router.push(`/exam/${data.examId}`);
        } catch {
            toast.error('Could not build a practice set');
        } finally {
            setBusy(false);
        }
    };

    return (
        <button type="button" onClick={start} disabled={busy} className={className}>
            {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
                <Dumbbell className="h-3.5 w-3.5" aria-hidden />
            )}
            Practise this
        </button>
    );
}
