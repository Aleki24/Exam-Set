import React from 'react';
import { Question } from '@/types';
import LatexRenderer from './LatexRenderer';

interface SingleQuestionPreviewProps {
    question: Question;
    index?: number;
}

const SingleQuestionPreview: React.FC<SingleQuestionPreviewProps> = ({ question, index = 1 }) => {
    return (
        <div
            className="bg-white text-black w-[520px] min-h-[280px] rounded-sm"
            style={{ fontFamily: "'Lora', 'Georgia', serif" }}
        >
            {/* Paper header bar */}
            <div className="bg-gradient-to-r from-gray-800 to-gray-700 px-6 py-2 flex items-center justify-between rounded-t-sm">
                <span
                    className="text-[10px] text-gray-300 uppercase tracking-[0.2em]"
                    style={{ fontFamily: "'Outfit', sans-serif" }}
                >
                    Question {index}
                </span>
                <span
                    className="text-[10px] text-gray-300 uppercase tracking-wider"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                >
                    {question.type || 'Structured'}
                </span>
            </div>

            <div className="p-7">
                <div className="flex gap-5">
                    {/* Question number */}
                    <span
                        className="text-xl font-bold text-gray-400 w-8 shrink-0 tabular-nums"
                        style={{ fontFamily: "'Roboto Mono', monospace" }}
                    >
                        {index}.
                    </span>

                    <div className="flex-1">
                        {/* Question text */}
                        <div
                            className="leading-[1.8] mb-5 text-[15px] whitespace-pre-wrap text-gray-900"
                            style={{ fontFamily: "'Lora', 'Georgia', serif" }}
                        >
                            <LatexRenderer content={question.text || ''} />
                        </div>

                        {/* Image Support */}
                        {question.imagePath && (
                            <div className="my-5 border border-gray-200 rounded overflow-hidden max-w-sm mx-auto">
                                <img
                                    src={question.imagePath}
                                    alt={question.imageCaption || 'Question diagram'}
                                    className="w-full max-h-56 object-contain bg-gray-50"
                                />
                                {question.imageCaption && (
                                    <p
                                        className="text-[11px] text-gray-500 text-center py-1.5 px-3 bg-gray-50 border-t border-gray-200 italic"
                                        style={{ fontFamily: "'Inter', sans-serif" }}
                                    >
                                        {question.imageCaption}
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Multiple Choice Options */}
                        {question.type === 'Multiple Choice' && question.options && (
                            <div className="grid grid-cols-2 gap-x-10 gap-y-3 ml-1 mb-4">
                                {question.options.map((opt, i) => (
                                    <div key={i} className="flex items-start gap-3 text-[14px]">
                                        <span
                                            className="font-bold border-2 border-gray-300 rounded-full w-7 h-7 flex items-center justify-center text-[11px] shrink-0 text-gray-500"
                                            style={{ fontFamily: "'Outfit', sans-serif" }}
                                        >
                                            {String.fromCharCode(65 + i)}
                                        </span>
                                        <span className="flex-1 pt-1" style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px' }}>
                                            {opt}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* True/False */}
                        {question.type === 'True/False' && (
                            <div className="flex gap-8 ml-1 mb-4">
                                {['True', 'False'].map((tf) => (
                                    <div key={tf} className="flex items-center gap-3">
                                        <span className="w-5 h-5 border-2 border-gray-400 rounded-sm shrink-0"></span>
                                        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '14px' }}>{tf}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Matching Pairs */}
                        {question.type === 'Matching' && question.matchingPairs && (
                            <div className="grid grid-cols-2 gap-6 mb-5">
                                <div className="space-y-2">
                                    <p
                                        className="font-black text-[10px] uppercase tracking-[0.15em] text-gray-400 mb-2 border-b border-gray-200 pb-1"
                                        style={{ fontFamily: "'Outfit', sans-serif" }}
                                    >
                                        Column A
                                    </p>
                                    {question.matchingPairs.map((pair, i) => (
                                        <div
                                            key={`left-${i}`}
                                            className="p-2.5 bg-gray-50 border border-gray-200 rounded text-[13px]"
                                            style={{ fontFamily: "'Inter', sans-serif" }}
                                        >
                                            {i + 1}. {pair.left}
                                        </div>
                                    ))}
                                </div>
                                <div className="space-y-2">
                                    <p
                                        className="font-black text-[10px] uppercase tracking-[0.15em] text-gray-400 mb-2 border-b border-gray-200 pb-1"
                                        style={{ fontFamily: "'Outfit', sans-serif" }}
                                    >
                                        Column B
                                    </p>
                                    {question.matchingPairs.map((pair, i) => (
                                        <div
                                            key={`right-${i}`}
                                            className="p-2.5 bg-gray-50 border border-gray-200 rounded text-[13px]"
                                            style={{ fontFamily: "'Inter', sans-serif" }}
                                        >
                                            {String.fromCharCode(65 + i)}. {pair.right}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Structured/Essay/Short Answer Lines */}
                        {(question.type === 'Structured' || question.type === 'Essay' || question.type === 'Short Answer') && (
                            <div className="mt-5 space-y-5">
                                {Array.from({ length: question.answerLines || (question.type === 'Essay' ? 8 : 4) }).map((_, i) => (
                                    <div key={i} className="border-b border-dashed border-gray-300 w-full h-5"></div>
                                ))}
                            </div>
                        )}

                        {/* Fill-in-the-blank */}
                        {question.type === 'Fill-in-the-blank' && (
                            <div className="mt-4 mb-4">
                                <div className="inline-block border-b-2 border-gray-400 w-40 h-6 mx-1"></div>
                            </div>
                        )}

                        {/* Sub-parts */}
                        {question.subParts && question.subParts.length > 0 && (
                            <div className="mt-5 space-y-4 border-l-2 border-gray-200 pl-4">
                                {question.subParts.map((part, pIdx) => (
                                    <div key={pIdx} className="flex gap-3">
                                        <span
                                            className="font-bold text-sm w-7 shrink-0 text-gray-500"
                                            style={{ fontFamily: "'Roboto Mono', monospace" }}
                                        >
                                            ({part.label})
                                        </span>
                                        <div className="flex-1">
                                            <div
                                                className="text-[14px] leading-[1.7] mb-1"
                                                style={{ fontFamily: "'Lora', 'Georgia', serif" }}
                                            >
                                                <LatexRenderer content={part.text} />
                                            </div>
                                        </div>
                                        <div className="w-12 text-right shrink-0">
                                            <span
                                                className="text-[11px] font-bold text-gray-400"
                                                style={{ fontFamily: "'Roboto Mono', monospace" }}
                                            >
                                                [{part.marks}]
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Right Margin Marks */}
                    <div className="shrink-0 w-14 text-right">
                        <div
                            className="inline-flex items-center justify-center bg-gray-100 border border-gray-200 rounded px-2 py-1"
                            style={{ fontFamily: "'Roboto Mono', monospace" }}
                        >
                            <span className="text-[12px] font-bold text-gray-600">
                                {question.marks}
                            </span>
                        </div>
                        <p
                            className="text-[9px] text-gray-400 mt-0.5 uppercase tracking-wider"
                            style={{ fontFamily: "'Inter', sans-serif" }}
                        >
                            marks
                        </p>
                    </div>
                </div>
            </div>

            {/* Paper footer */}
            <div className="border-t border-gray-200 px-6 py-2 flex items-center justify-between">
                <span className="text-[9px] text-gray-300" style={{ fontFamily: "'Inter', sans-serif" }}>
                    {question.topic || ''} {question.subtopic ? `• ${question.subtopic}` : ''}
                </span>
                <span className="text-[9px] text-gray-300" style={{ fontFamily: "'Inter', sans-serif" }}>
                    {question.difficulty}
                </span>
            </div>
        </div>
    );
};

export default SingleQuestionPreview;
