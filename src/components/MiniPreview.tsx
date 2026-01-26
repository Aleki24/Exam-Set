"use client";

import React from 'react';
import { Page } from '@/exam-engine/templates/Page';
import { Question, QuestionData } from '@/exam-engine/templates/Question';
import { CoverPage, CoverData } from '@/exam-engine/templates/CoverPage';
import { classicInternationalTheme, ExamTheme } from '@/exam-engine/themes';
import { ExamPaper } from '@/types';

interface MiniPreviewProps {
    paper: ExamPaper;
}

/**
 * A simplified preview component using the new exam-engine templates.
 * This is a read-only, scaled-down preview for the right sidebar.
 * For full editing capabilities, use the TemplateEditor in the Builder view.
 */
export const MiniPreview: React.FC<MiniPreviewProps> = ({ paper }) => {
    const { metadata, questions } = paper;

    // Map app metadata to CoverData
    const coverData: CoverData = {
        examTitle: metadata.title || 'Examination',
        subject: metadata.subject || 'Subject',
        level: metadata.code || 'Paper 1',
        duration: metadata.timeLimit || '2 Hours',
        totalMarks: metadata.totalMarks || questions.reduce((sum, q) => sum + q.marks, 0),
        instructions: metadata.instructions
            ? metadata.instructions.split('\n').filter(line => line.trim().length > 0)
            : ["Answer all questions."],
        schoolName: metadata.institution || 'School Name'
    };

    // Map app questions to QuestionData
    const mappedQuestions: QuestionData[] = questions.map((q, idx) => ({
        number: idx + 1,
        text: q.text,
        marks: q.marks,
        type: q.type,
        options: q.options,
        image: q.imagePath,
        id: q.id,
        // Map subParts to subQuestions for rendering
        subQuestions: q.subParts?.map((part) => ({
            number: part.label,
            text: part.text,
            marks: part.marks,
            type: 'Structured' as const,
        })),
    }));

    // Use default theme - the full editor allows theme customization
    const theme: ExamTheme = classicInternationalTheme;

    return (
        <div id="exam-paper-content" className="flex flex-col gap-4 bg-gray-100 p-2">
            {/* Cover Page (Simplified - no editing) */}
            <CoverPage
                data={coverData}
                theme={theme}
                questionNumbers={mappedQuestions.map(q => q.number)}
            />

            {/* Questions Page */}
            <Page theme={theme} pageNumber={2} autoHeight={true}>
                <div className="flex flex-col w-full">
                    {/* Header for continuation pages */}
                    <div className="border-b pb-4 mb-4 text-center uppercase font-bold text-sm">
                        {coverData.subject} - {coverData.level}
                    </div>

                    {/* Questions */}
                    <div className="flex flex-col gap-2">
                        {mappedQuestions.map((q) => (
                            <Question
                                key={q.id || q.number}
                                {...q}
                                theme={theme}
                            />
                        ))}
                    </div>
                </div>
            </Page>
        </div>
    );
};

export default MiniPreview;
