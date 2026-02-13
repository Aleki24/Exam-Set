import React from 'react';
import { ExamTheme } from '../themes';

export interface QuestionData {
    number: number | string;
    text: string;
    marks: number;
    subQuestions?: QuestionData[]; // Recursive data structure
    customSpacing?: string; // Optional custom spacing override
    type?:
    | 'Multiple Choice'
    | 'True/False'
    | 'Matching'
    | 'Fill-in-the-blank'
    | 'Numeric'
    | 'Structured'
    | 'Short Answer'
    | 'Essay'
    | 'Practical'
    | 'Oral';
    options?: string[];
    matchingPairs?: { left: string; right: string }[];
    unit?: string;
    image?: string;
    imageWidth?: number; // Check percentage (0-100)
    id?: string;
}

interface QuestionProps extends QuestionData {
    theme: ExamTheme;
    className?: string;
}

export const Question: React.FC<QuestionProps> = ({
    number,
    text,
    marks,
    subQuestions,
    customSpacing,
    type,
    options,
    matchingPairs,
    unit,
    image,
    imageWidth,
    theme,
    className = ''
}) => {
    // Determine the space to reserve
    const spacingStyle = {
        marginBottom: customSpacing || theme.styles.questionSpacing,
        fontFamily: theme.fontFamily
    };

    const renderAnswerSpace = () => {
        if (subQuestions && subQuestions.length > 0) return null; // Subquestions handle their own space

        switch (type) {
            case 'Multiple Choice':
                if (options && options.length > 0) {
                    return (
                        <div className="ml-8 mt-2 space-y-1 mb-4">
                            {options.map((opt, idx) => (
                                <div key={idx} className="flex items-start gap-2">
                                    <div className="w-5 h-5 rounded-full border border-gray-400 shrink-0 text-[10px] flex items-center justify-center text-gray-400 mt-0.5">
                                        {String.fromCharCode(65 + idx)}
                                    </div>
                                    <span className="text-sm" dangerouslySetInnerHTML={{ __html: opt }} />
                                </div>
                            ))}
                        </div>
                    );
                }
                return null;

            case 'True/False':
                return (
                    <div className="ml-8 mt-2 flex gap-12 font-bold opacity-80">
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 border border-black rounded-full"></div>
                            <span>TRUE</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 border border-black rounded-full"></div>
                            <span>FALSE</span>
                        </div>
                    </div>
                );

            case 'Matching':
                if (matchingPairs && matchingPairs.length > 0) {
                    return (
                        <div className="ml-8 mt-4 grid grid-cols-2 gap-x-12 gap-y-4 max-w-2xl">
                            {matchingPairs.map((pair, idx) => (
                                <React.Fragment key={idx}>
                                    <div className="flex items-center justify-between gap-4 border-b border-dotted border-gray-300 pb-1">
                                        <span className="text-sm font-medium">{idx + 1}. {pair.left}</span>
                                        <div className="w-6 h-6 border border-black flex items-center justify-center text-xs font-bold bg-gray-50"></div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold w-4">{String.fromCharCode(65 + idx)}.</span>
                                        <span className="text-sm">{pair.right}</span>
                                    </div>
                                </React.Fragment>
                            ))}
                        </div>
                    );
                }
                return null;

            case 'Fill-in-the-blank':
                return null;

            case 'Numeric':
                return (
                    <div className="ml-8 mt-4 flex items-center gap-4">
                        <div className="w-32 h-10 border border-black flex items-center justify-end px-2">
                            <span className="text-xs opacity-30 italic">Answer here</span>
                        </div>
                        {unit && <span className="font-bold">{unit}</span>}
                    </div>
                );

            case 'Short Answer':
                return (
                    <div
                        className="w-full mt-2 opacity-50 block ml-8"
                        style={{
                            height: '50px',
                            backgroundImage: `repeating-linear-gradient(transparent, transparent 24px, #000 25px)`,
                            backgroundSize: '100% 25px',
                            borderTop: '1px solid #000',
                        }}
                    />
                );

            case 'Essay':
                // Render ruled lines filling the space
                return (
                    <div
                        className="w-full mt-2 opacity-50 block h-full"
                        style={{
                            height: customSpacing || theme.styles.questionSpacing,
                            backgroundImage: `repeating-linear-gradient(transparent, transparent 24px, #000 25px)`,
                            backgroundSize: '100% 25px',
                            borderTop: '1px solid #000',
                            ...(!customSpacing && { minHeight: '150px' })
                        }}
                    />
                );

            case 'Practical':
            case 'Oral':
                return (
                    <div className="ml-8 mt-4 p-4 border border-dashed border-gray-400 bg-gray-50/50 rounded-lg">
                        <h4 className="text-[10px] font-black uppercase text-gray-500 mb-2">Examiner's Comments / Score</h4>
                        <div className="h-20"></div>
                    </div>
                );

            case 'Structured':
            default:
                return null;
        }
    };

    return (
        <div
            className={`question-container flex flex-col w-full ${className}`}
            style={type === 'Essay' ? { marginBottom: '1em', fontFamily: theme.fontFamily } : spacingStyle}
        >
            <div className="flex flex-row w-full items-start gap-4">
                {/* Question Number */}
                <span
                    className="font-bold shrink-0 w-8"
                    style={{
                        fontSize: `${theme.fontSize}pt`,
                    }}
                >
                    {number}.
                </span>

                {/* Question Text */}
                <div className="flex-grow">
                    <div
                        style={{
                            fontSize: `${theme.fontSize}pt`,
                            lineHeight: theme.lineHeight,
                            marginBottom: (subQuestions || type === 'Multiple Choice' || type === 'Essay') ? '0.5em' : '0'
                        }}
                        dangerouslySetInnerHTML={{ __html: text }}
                    />

                    {/* Image Attachment */}
                    {image && (
                        <div className="my-4">
                            <img
                                src={image}
                                alt="Question Diagram"
                                className="object-contain border border-gray-200 rounded p-1 block"
                                style={{
                                    maxWidth: imageWidth ? `${imageWidth}%` : '100%',
                                    maxHeight: '400px'
                                }}
                            />
                        </div>
                    )}

                    {/* Render specific answer format */}
                    {renderAnswerSpace()}
                </div>

                {/* Marks */}
                {theme.showMarks && (
                    <span
                        className="shrink-0 italic opacity-80 ml-4 font-semibold"
                        style={{ fontSize: `${theme.fontSize * 0.9}pt` }}
                    >
                        [{marks} {marks === 1 ? 'mark' : 'marks'}]
                    </span>
                )}
            </div>

            {/* Sub-questions */}
            {subQuestions && subQuestions.length > 0 && (
                <div className="ml-8 mt-4 flex flex-col">
                    {subQuestions.map((sq, idx) => (
                        <Question
                            key={idx}
                            {...sq}
                            theme={theme}
                            className="mb-2"
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
