'use client';

import React, { useMemo } from 'react';
import {
    layoutPaper,
    markingSchemeOf,
    partMarkingScheme,
    type PaperSource,
    type QuestionSource,
} from '@/services/paperLayout';

interface MarkingSchemePreviewProps {
    paper: PaperSource;
    questions: QuestionSource[];
}

/**
 * THE MARKING SCHEME, ON SCREEN
 * ----------------------------------------------------------------------------
 * The teacher's copy of the same paper, drawn from the same layout so the
 * numbering and marks cannot drift from the question paper's.
 *
 * Black on white like the paper. The old version set the answers in a tinted
 * panel with green headings, which photocopies as a grey box with grey writing
 * in it — this is the document somebody marks forty scripts against.
 */
export default function MarkingSchemePreview({ paper, questions }: MarkingSchemePreviewProps) {
    const layout = useMemo(() => layoutPaper(paper, questions), [paper, questions]);
    const { identity } = layout;

    const schemes = useMemo(() => questions.map(markingSchemeOf), [questions]);
    const partSchemes = useMemo(
        () =>
            questions.map((q) => {
                const parts = q.sub_parts ?? q.subParts;
                return (Array.isArray(parts) ? parts : []).map(partMarkingScheme);
            }),
        [questions]
    );

    return (
        <div className="flex flex-col items-center">
            <article className={SHEET} style={INK}>
                <header className="text-center">
                    {identity.institution && (
                        <h1 className="font-serif text-[15px] font-bold uppercase leading-tight">
                            {identity.institution}
                        </h1>
                    )}
                    <h2 className="font-serif text-[18px] font-bold uppercase leading-tight">
                        {identity.title}
                    </h2>
                    <p className="text-[12px] font-bold uppercase">Marking Scheme</p>
                    {identity.context && (
                        <p className="mt-1 font-serif text-[11px]">{identity.context}</p>
                    )}
                </header>

                <div className="mt-2 border-t-[3px] border-black pt-[2px]">
                    <div className="border-t border-black" />
                </div>

                <div className="mt-2 flex justify-between text-[10px] font-bold uppercase">
                    <span>Confidential — for the teacher only</span>
                    {layout.totalMarks > 0 && <span>Total marks: {layout.totalMarks}</span>}
                </div>
                <div className="mt-1 border-t border-black" />

                <ol className="mt-2">
                    {layout.questions.map((question, index) => {
                        const scheme = schemes[index] ?? '';
                        const parts = partSchemes[index] ?? [];

                        return (
                            <li
                                key={question.number}
                                className="break-inside-avoid border-b border-black py-2 last:border-0"
                            >
                                <div className="flex items-baseline gap-2">
                                    <span className="w-5 shrink-0 font-serif text-[11.5px] font-bold">
                                        {question.number}.
                                    </span>
                                    <p className="flex-1 font-serif text-[10.5px] whitespace-pre-wrap">
                                        {question.text}
                                    </p>
                                    {question.marks > 0 && (
                                        <span className="shrink-0 font-serif text-[10.5px]">
                                            ({question.marks} mark{question.marks === 1 ? '' : 's'})
                                        </span>
                                    )}
                                </div>

                                <div className="ml-7 mt-1 font-serif text-[11.5px] font-bold">
                                    {scheme ? (
                                        <p className="whitespace-pre-wrap">{scheme}</p>
                                    ) : question.parts.length > 0 ? (
                                        <ul className="space-y-[2px]">
                                            {question.parts.map((part, i) => (
                                                <li key={i}>
                                                    {part.label} {parts[i] || '—'}
                                                    {part.marks > 0
                                                        ? `  (${part.marks} mark${part.marks === 1 ? '' : 's'})`
                                                        : ''}
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        // Said plainly rather than left blank: a blank
                                        // here reads as an answer of "nothing".
                                        <p className="font-normal">
                                            [ No marking scheme recorded for this question. ]
                                        </p>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ol>

                {layout.questionCount > 0 && (
                    <p className="mt-4 border-t border-black pt-1.5 text-right text-[9px] font-bold uppercase">
                        End of marking scheme
                    </p>
                )}
            </article>
        </div>
    );
}

const SHEET =
    'w-[210mm] min-h-[297mm] bg-white px-[18mm] py-[14mm] font-sans text-black ' +
    'shadow-[0_10px_30px_rgba(0,0,0,0.15)] print:shadow-none print:w-full';

const INK: React.CSSProperties = { color: '#000000', backgroundColor: '#ffffff' };
