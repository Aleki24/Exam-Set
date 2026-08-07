import React from 'react';
import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import { nextSitting, countdownLabel } from '@/lib/examCalendar';

/**
 * How long until the exam that actually matters to this learner.
 *
 * Renders nothing when there is no answer — no level chosen, no national exam
 * at that level, or a calendar past its review date. All three are real and all
 * three deserve silence rather than a filled space: a Grade 2 learner does not
 * sit a national exam, and a countdown invented to occupy the gap is noise
 * dressed as guidance.
 *
 * Unconfirmed dates say "expected" and are never counted down to as though
 * published. A learner who plans around a date that turns out to be three weeks
 * early has been harmed by a decorative widget.
 */
export default function ExamCountdown({ level }: { level?: string | null }) {
    const next = nextSitting(level);
    if (!next) return null;

    const { sitting, daysAway, today } = next;
    const label = countdownLabel(next);

    // Close enough to change what somebody should be revising.
    const urgent = daysAway <= 30;

    return (
        <section
            aria-labelledby="countdown-heading"
            className="ruled mt-10 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius)] border border-border p-6"
        >
            <div className="min-w-0">
                <p className="overline inline-flex items-center gap-1.5">
                    <CalendarClock className="h-3 w-3" aria-hidden />
                    {sitting.confirmed ? 'Confirmed date' : 'Expected date'}
                </p>

                <h2 id="countdown-heading" className="title-2 mt-2">
                    {sitting.name} {sitting.year} — {label}
                </h2>

                <p className="meta mt-1 leading-relaxed">
                    {sitting.full}
                    {' · '}
                    {sitting.confirmed
                        ? formatDate(sitting.startsOn)
                        : `usually starts around ${formatDate(sitting.startsOn)}`}
                    {!sitting.confirmed && ' — check the KNEC timetable for the exact day'}
                </p>
            </div>

            {!today && (
                <Link
                    href={
                        level
                            ? `/catalog?level=${level}&kind=${urgent ? 'prediction' : 'past-paper'}`
                            : '/catalog?kind=past-paper'
                    }
                    className={urgent ? 'btn-primary btn-sm shrink-0' : 'btn-outline btn-sm shrink-0'}
                >
                    {urgent ? 'Revise now' : 'Start revising'}
                </Link>
            )}
        </section>
    );
}

function formatDate(iso: string): string {
    try {
        return new Date(`${iso}T00:00:00`).toLocaleDateString('en-KE', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        });
    } catch {
        return iso;
    }
}
