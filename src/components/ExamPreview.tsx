'use client';

import React, { useMemo } from 'react';
import {
    layoutFor,
    layoutPaper,
    type PaperSource,
    type QuestionSource,
    type SectionDeclaration,
} from '@/services/paperLayout';
import type { AnswerStyle } from '@/services/subjectPaper';
import LatexRenderer from '@/components/LatexRenderer';

interface ExamPreviewProps {
    paper: PaperSource;
    questions: QuestionSource[];
    /** Set when the paper was built from a format, so its own sections print. */
    declaration?: SectionDeclaration;
}

/**
 * THE PAPER, ON SCREEN
 * ----------------------------------------------------------------------------
 * What a teacher approves here is what comes out of the printer, because both
 * are drawn from the same layout in services/paperLayout. Previously this was a
 * separate description of the paper written in Tailwind, and it disagreed with
 * the PDF about spacing, sections, marks and whether there was a rubric at all.
 *
 * Two rules this component does not get to bend:
 *
 *   Everything is pure black on pure white, set in explicit colours rather than
 *   theme tokens. The old preview drew `text-muted-foreground` on a hard-coded
 *   white page, which is grey on white in daylight and near-invisible once the
 *   app is in dark mode — and that faded preview was what people were printing.
 *
 *   The front matter is a cover page, and it is marked as one. The printed
 *   paper puts question 1 on sheet two — that is what an invigilator expects
 *   and it is where the candidate box, the rubric and the marker's table
 *   belong. This is a continuous scroll rather than paginated, so the break is
 *   drawn explicitly; a preview that hid it would have a teacher approving a
 *   one-page paper and printing a two-page one.
 *
 *   Answer space is drawn the way the subject will print it — ruled for prose,
 *   clear for working. See services/subjectPaper.
 *
 *   Maths is rendered, not shown as its source. The setter already accepts
 *   `$…$` and KaTeX is already a dependency; the PDF sets the same notation
 *   with its own typesetter (services/mathDraw). The two are not
 *   glyph-for-glyph identical, but both give a stacked fraction and a real
 *   radical, which is the part a teacher is approving.
 */
export default function ExamPreview({ paper, questions, declaration }: ExamPreviewProps) {
    const layout = useMemo(() => layoutFor(paper, questions, declaration), [paper, questions, declaration]);
    const { identity } = layout;

    return (
        <div className="flex flex-col items-center">
            <article className={SHEET} style={INK}>
                {/* Masthead */}
                <header className="text-center">
                    {identity.institution && (
                        <h1 className="font-serif text-[15px] font-bold uppercase leading-tight">
                            {identity.institution}
                        </h1>
                    )}
                    <h2 className="font-serif text-[18px] font-bold uppercase leading-tight">
                        {identity.title}
                    </h2>
                    {identity.context && (
                        <p className="mt-1 font-serif text-[11px]">{identity.context}</p>
                    )}
                </header>

                <div className="mt-2 border-t-[3px] border-black pt-[2px]">
                    <div className="border-t border-black" />
                </div>

                {/* Candidate details */}
                <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 border border-black p-2.5 font-serif text-[11px] font-bold">
                    {['NAME:', 'ADM NO:', 'CLASS:', 'DATE:'].map((label) => (
                        <div key={label} className="flex items-end gap-2">
                            <span>{label}</span>
                            <span className="flex-1 border-b border-black" />
                        </div>
                    ))}
                </div>

                {/* Time and marks */}
                {(identity.duration || layout.totalMarks > 0) && (
                    <div className="mt-2 flex justify-between text-[10.5px] font-bold uppercase">
                        <span>{identity.duration ? `Time: ${identity.duration}` : ''}</span>
                        <span>{layout.totalMarks > 0 ? `Total marks: ${layout.totalMarks}` : ''}</span>
                    </div>
                )}

                {/* Instructions */}
                {layout.instructions.length > 0 && (
                    <section className="mt-2">
                        <h3 className="text-[11px] font-bold uppercase">Instructions to Candidates</h3>
                        <ol className="mt-1 space-y-[2px] font-serif text-[11.5px]">
                            {layout.instructions.map((instruction, i) => (
                                <li key={i} className="flex gap-2">
                                    <span className="w-4 shrink-0 text-right">{i + 1}.</span>
                                    <span>{instruction}</span>
                                </li>
                            ))}
                        </ol>
                    </section>
                )}

                {/* For examiner's use */}
                {layout.examinerRows.length > 0 && <ExaminerTable layout={layout} />}

                {layout.rubric && <Rubric bands={layout.rubric} />}

                {/* Where the printed paper turns over. */}
                {layout.questionCount > 0 && (
                    <div className="my-4 flex items-center gap-3">
                        <span className="h-px flex-1 border-t border-dashed border-black" />
                        <span className="text-[8.5px] font-bold uppercase tracking-wide">
                            End of cover · Page 2 begins here
                        </span>
                        <span className="h-px flex-1 border-t border-dashed border-black" />
                    </div>
                )}

                {/* Questions */}
                {layout.sections.map((section, i) => (
                    <section key={section.label ?? i} className="mt-3">
                        {section.label && (
                            <div className="mb-2">
                                <div className="flex items-baseline justify-between">
                                    <h3 className="text-[12px] font-bold uppercase">
                                        {section.title ? `${section.label}: ${section.title}` : section.label}
                                    </h3>
                                    {section.marks > 0 && (
                                        <span className="text-[11px] font-bold">({section.marks} marks)</span>
                                    )}
                                </div>
                                {section.instruction && (
                                    <p className="font-serif text-[11px]">{section.instruction}</p>
                                )}
                                <div className="mt-1 border-t border-black" />
                            </div>
                        )}

                        <ol className="space-y-3">
                            {section.questions.map((question) => (
                                <li key={question.number} className="break-inside-avoid font-serif text-[11.5px]">
                                    <div className="flex items-baseline gap-2">
                                        <span className="w-5 shrink-0 font-bold">{question.number}.</span>
                                        <p className="flex-1 whitespace-pre-wrap">
                                            <LatexRenderer content={question.text} />
                                        </p>
                                        {question.marks > 0 && (
                                            <span className="shrink-0 text-[10.5px]">
                                                ({question.marks} mark{question.marks === 1 ? '' : 's'})
                                            </span>
                                        )}
                                    </div>

                                    {question.options.length > 0 && (
                                        <ul
                                            className={`ml-7 mt-1 gap-x-6 ${
                                                question.optionsFitTwoColumns ? 'grid grid-cols-2' : 'space-y-[2px]'
                                            }`}
                                        >
                                            {question.options.map((option, i) => (
                                                <li key={i}>
                                                    {String.fromCharCode(65 + i)}.&nbsp;&nbsp;{option}
                                                </li>
                                            ))}
                                        </ul>
                                    )}

                                    {question.parts.map((part, i) => (
                                        <div key={i} className="ml-5 mt-1.5">
                                            <div className="flex items-baseline gap-2">
                                                <span className="w-6 shrink-0">{part.label}</span>
                                                <p className="flex-1 whitespace-pre-wrap">
                                                    <LatexRenderer content={part.text} />
                                                </p>
                                                {part.marks > 0 && (
                                                    <span className="shrink-0 text-[10.5px]">
                                                        ({part.marks} mark{part.marks === 1 ? '' : 's'})
                                                    </span>
                                                )}
                                            </div>
                                            <AnswerLines
                                                count={part.answerLines}
                                                indent="ml-8"
                                                style={layout.answerStyle}
                                            />
                                        </div>
                                    ))}

                                    <AnswerLines
                                        count={question.answerLines}
                                        indent="ml-7"
                                        style={layout.answerStyle}
                                    />
                                </li>
                            ))}
                        </ol>
                    </section>
                ))}

                {layout.questionCount > 0 && (
                    <p className="mt-4 border-t border-black pt-1.5 text-right text-[9px] font-bold uppercase">
                        This is the last printed page
                    </p>
                )}
            </article>
        </div>
    );
}

/** Ruled writing space, at the same rhythm the PDF uses. */
/**
 * Room to answer in, drawn the way the PDF will draw it.
 *
 * The preview exists so that what a teacher approves is what prints, and a
 * maths paper that shows ruled lines here and clear working space in the
 * download breaks exactly that promise. `19px` is `ANSWER_LINE_GAP` from the
 * renderer — the same unit either way, so the two stay the same height.
 */
function AnswerLines({
    count,
    indent,
    style,
}: {
    count: number;
    indent: string;
    style: AnswerStyle;
}) {
    if (count <= 0) return null;
    return (
        <div className={`${indent} mt-1.5`}>
            {Array.from({ length: count }).map((_, i) => (
                <div
                    key={i}
                    className={style === 'blank' ? 'h-[19px]' : 'h-[19px] border-b border-black'}
                />
            ))}
        </div>
    );
}

function ExaminerTable({ layout }: { layout: ReturnType<typeof layoutPaper> }) {
    const columns = [
        ...layout.examinerRows,
        { label: 'TOTAL', marks: layout.examinerRows.reduce((sum, r) => sum + r.marks, 0) },
    ];

    return (
        <table className="mt-3 w-full table-fixed border-collapse border border-black text-center text-[9px]">
            <thead>
                <tr>
                    <th colSpan={columns.length + 1} className="border-b border-black py-[3px] font-bold uppercase">
                        For Examiner&apos;s Use Only
                    </th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <th className="w-[22%] border border-black px-1.5 py-[3px] text-left font-bold uppercase">
                        {layout.sections.length > 1 ? 'Section' : 'Question'}
                    </th>
                    {columns.map((column) => (
                        <th key={column.label} className="border border-black py-[3px] font-bold">
                            {column.label}
                        </th>
                    ))}
                </tr>
                <tr>
                    <th className="border border-black px-1.5 py-[3px] text-left font-bold uppercase">
                        Maximum score
                    </th>
                    {columns.map((column) => (
                        <td key={column.label} className="border border-black py-[3px] font-serif">
                            {column.marks > 0 ? column.marks : ''}
                        </td>
                    ))}
                </tr>
                <tr>
                    <th className="border border-black px-1.5 py-[3px] text-left font-bold uppercase">
                        Candidate&apos;s score
                    </th>
                    {columns.map((column) => (
                        <td key={column.label} className="h-[15px] border border-black" />
                    ))}
                </tr>
            </tbody>
        </table>
    );
}

/**
 * The CBC bands with the marks each one means for this paper. The blank row is
 * the only thing left for the teacher to fill in — an empty four-box grid, which
 * is what this used to be, is a picture of a rubric rather than one.
 */
function Rubric({ bands }: { bands: NonNullable<ReturnType<typeof layoutPaper>['rubric']> }) {
    return (
        <table className="mt-2 w-full table-fixed border-collapse border border-black text-center text-[9px]">
            <thead>
                <tr>
                    <th colSpan={bands.length} className="border-b border-black py-[3px] font-bold uppercase">
                        Assessment Rubric · Tick the band the candidate&apos;s score falls in
                    </th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    {bands.map((band) => (
                        <th key={band.code} className="border border-black px-1 py-[3px]">
                            <span className="block font-bold">
                                {band.code} · {band.percent}
                            </span>
                            <span className="block font-normal uppercase">{band.name}</span>
                        </th>
                    ))}
                </tr>
                <tr>
                    {bands.map((band) => (
                        <td key={band.code} className="border border-black py-[3px] font-serif font-bold">
                            {band.range} marks
                        </td>
                    ))}
                </tr>
                <tr>
                    {bands.map((band) => (
                        <td key={band.code} className="h-[18px] border border-black" />
                    ))}
                </tr>
            </tbody>
        </table>
    );
}

/**
 * A4 at 96dpi, with the same margins as the PDF. Colours are set explicitly and
 * not through theme tokens: this sheet is white in dark mode too, so anything
 * inheriting the theme's foreground would print as pale grey on white.
 */
const SHEET =
    'w-[210mm] min-h-[297mm] bg-white px-[18mm] py-[14mm] font-sans text-black ' +
    'shadow-[0_10px_30px_rgba(0,0,0,0.15)] print:shadow-none print:w-full';

const INK: React.CSSProperties = { color: '#000000', backgroundColor: '#ffffff' };
