'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import { LEVELS } from '@/lib/catalog';

/**
 * SETTING UP — a class, then something to assess.
 *
 * Both are pasted as one block, one per line, rather than typed into a field
 * each. A teacher already has their register somewhere — a printout, a WhatsApp
 * message, last term's list — and fifty separate inputs on a phone is the setup
 * cost that stops a tool being adopted at all.
 */
export default function NewAssessmentPage() {
    return (
        <Suspense fallback={<Fallback />}>
            <NewAssessmentForm />
        </Suspense>
    );
}

function Fallback() {
    return (
        <div className="min-h-screen bg-background">
            <TopNav />
            <main className="shell-width grid place-items-center py-32">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
            </main>
        </div>
    );
}

function NewAssessmentForm() {
    const router = useRouter();
    const params = useSearchParams();
    const existingClass = params.get('class');

    const [className, setClassName] = useState('');
    const [grade, setGrade] = useState('');
    const [learningArea, setLearningArea] = useState('');
    const [register, setRegister] = useState('');

    const [title, setTitle] = useState('');
    const [outcomes, setOutcomes] = useState('');
    const [dueOn, setDueOn] = useState('');

    const [saving, setSaving] = useState(false);

    const grades = LEVELS.flatMap((l) => l.grades);

    // Skip straight to the assessment when a class was already chosen.
    const [step, setStep] = useState<'class' | 'assessment'>(existingClass ? 'assessment' : 'class');
    const [classId, setClassId] = useState<string | null>(existingClass);

    useEffect(() => {
        if (existingClass) setClassId(existingClass);
    }, [existingClass]);

    const createClass = async () => {
        if (!className.trim()) return;
        setSaving(true);
        try {
            const res = await fetch('/api/cba/classes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: className.trim(),
                    grade_label: grade || null,
                    learning_area: learningArea.trim() || null,
                    learners: register,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not create the class');

            if (data.warning) toast.warning(data.warning);
            else toast.success(`${className} added${data.learnerCount ? ` — ${data.learnerCount} learners` : ''}`);

            setClassId(data.class.id);
            setStep('assessment');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not create the class');
        } finally {
            setSaving(false);
        }
    };

    const createAssessment = async () => {
        if (!classId || !title.trim() || !outcomes.trim()) return;
        setSaving(true);
        try {
            const res = await fetch('/api/cba/assessments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    class_id: classId,
                    title: title.trim(),
                    outcomes,
                    due_on: dueOn || null,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not create the assessment');

            toast.success('Ready to score');
            router.push('/teach/assess');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not create the assessment');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-background">
            <TopNav />

            <main className="shell-width max-w-3xl py-10 sm:py-14">
                <header>
                    <p className="overline">
                        {step === 'class' ? 'Step 1 of 2' : 'Step 2 of 2'}
                    </p>
                    <h1 className="display-2 mt-3">
                        {step === 'class' ? 'Add your class' : 'What are you assessing?'}
                    </h1>
                </header>

                {step === 'class' ? (
                    <>
                        <section className="mt-10">
                            <label htmlFor="class-name" className="overline block">
                                Class name
                            </label>
                            <input
                                id="class-name"
                                value={className}
                                onChange={(e) => setClassName(e.target.value)}
                                placeholder="e.g. Grade 7 Blue"
                                maxLength={120}
                                className="field mt-2"
                            />

                            <h2 className="overline mt-6">Grade</h2>
                            <ul className="mt-2 flex flex-wrap gap-2">
                                {grades.map((g) => (
                                    <li key={g}>
                                        <button
                                            type="button"
                                            onClick={() => setGrade(grade === g ? '' : g)}
                                            aria-pressed={grade === g}
                                            className={grade === g ? 'chip chip-active' : 'chip'}
                                        >
                                            {g}
                                        </button>
                                    </li>
                                ))}
                            </ul>

                            <label htmlFor="learning-area" className="overline mt-6 block">
                                Learning area <span className="normal-case tracking-normal">(optional)</span>
                            </label>
                            <input
                                id="learning-area"
                                value={learningArea}
                                onChange={(e) => setLearningArea(e.target.value)}
                                placeholder="e.g. Pre-Technical Studies"
                                maxLength={120}
                                className="field mt-2"
                            />

                            <label htmlFor="register" className="overline mt-6 block">
                                The register
                            </label>
                            <p className="meta mt-1.5 leading-relaxed">
                                One learner per line. Put the admission number first if you have it —
                                &ldquo;12 Achieng Otieno&rdquo; — and it will be picked up
                                automatically.
                            </p>
                            <textarea
                                id="register"
                                value={register}
                                onChange={(e) => setRegister(e.target.value)}
                                rows={10}
                                placeholder={'12 Achieng Otieno\n13 Brian Kimani\n14 Cynthia Wanjiru'}
                                className="field mt-2 font-mono text-[13px]"
                            />
                            <p className="meta mt-1.5">
                                {register.split('\n').filter((l) => l.trim()).length} learners
                            </p>
                        </section>

                        <div className="mt-10 flex flex-wrap gap-3 border-t border-border pt-8">
                            <button
                                type="button"
                                onClick={createClass}
                                disabled={saving || !className.trim()}
                                className="btn-primary"
                            >
                                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                                Continue
                            </button>
                            <Link href="/teach/assess" className="btn-ghost">
                                Cancel
                            </Link>
                        </div>
                    </>
                ) : (
                    <>
                        <section className="mt-10">
                            <label htmlFor="assess-title" className="overline block">
                                Assessment
                            </label>
                            <input
                                id="assess-title"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="e.g. Term 2 project — making a model"
                                maxLength={160}
                                className="field mt-2"
                            />

                            <label htmlFor="assess-outcomes" className="overline mt-6 block">
                                What you are scoring
                            </label>
                            <p className="meta mt-1.5 leading-relaxed">
                                One learning outcome per line. Each learner gets Below, Approaching,
                                Meeting or Exceeding against every line.
                            </p>
                            <textarea
                                id="assess-outcomes"
                                value={outcomes}
                                onChange={(e) => setOutcomes(e.target.value)}
                                rows={7}
                                placeholder={
                                    'Selects appropriate materials\nFollows the steps in order\nWorks safely with tools\nExplains the finished model'
                                }
                                className="field mt-2"
                            />
                            <p className="meta mt-1.5">
                                {outcomes.split('\n').filter((l) => l.trim()).length} outcomes
                            </p>

                            <label htmlFor="assess-due" className="overline mt-6 block">
                                KNEC deadline <span className="normal-case tracking-normal">(optional)</span>
                            </label>
                            <input
                                id="assess-due"
                                type="date"
                                value={dueOn}
                                onChange={(e) => setDueOn(e.target.value)}
                                className="field mt-2"
                            />
                        </section>

                        <div className="mt-10 flex flex-wrap gap-3 border-t border-border pt-8">
                            <button
                                type="button"
                                onClick={createAssessment}
                                disabled={saving || !title.trim() || !outcomes.trim()}
                                className="btn-primary"
                            >
                                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                                Start scoring
                            </button>
                            <Link href="/teach/assess" className="btn-ghost">
                                Cancel
                            </Link>
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
