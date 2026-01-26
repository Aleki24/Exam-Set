import React, { useState, useEffect } from 'react';
import { ExamTheme } from '../themes';

interface TeacherUseTableProps {
    questionNumbers: (number | string)[];
    theme: ExamTheme;
    isEditing?: boolean;
    onUpdateQuestions?: (questions: (number | string)[]) => void;
}

export const TeacherUseTable: React.FC<TeacherUseTableProps> = ({
    questionNumbers,
    theme,
    isEditing = false,
    onUpdateQuestions
}) => {
    const [tableTitle, setTableTitle] = useState("For Examiner's Use Only");
    const [localQuestions, setLocalQuestions] = useState(questionNumbers);

    useEffect(() => {
        setLocalQuestions(questionNumbers);
    }, [questionNumbers]);

    if (!theme.showTeacherUse) return null;

    const count = localQuestions.length;

    const handleAddQuestion = () => {
        const newNum = localQuestions.length + 1;
        const updated = [...localQuestions, newNum];
        setLocalQuestions(updated);
        onUpdateQuestions?.(updated);
    };

    const handleRemoveQuestion = (index: number) => {
        const updated = localQuestions.filter((_, i) => i !== index);
        setLocalQuestions(updated);
        onUpdateQuestions?.(updated);
    };

    // Horizontal layout for 10+ questions
    if (count > 10) {
        return (
            <div className="teacher-use-table-container mt-auto border-2 border-black w-full">
                {/* Editable Header */}
                <div className="bg-gray-100 border-b border-black p-1 text-center font-bold text-xs uppercase flex items-center justify-center gap-2">
                    {isEditing ? (
                        <input
                            type="text"
                            value={tableTitle}
                            onChange={(e) => setTableTitle(e.target.value)}
                            className="bg-transparent border-none text-center font-bold text-xs uppercase focus:outline-none focus:ring-1 focus:ring-blue-400 rounded"
                        />
                    ) : (
                        tableTitle
                    )}
                </div>
                {/* Horizontal scrollable container */}
                <div className="overflow-x-auto">
                    <div className="flex min-w-max">
                        {localQuestions.map((q, idx) => (
                            <div key={`q-${idx}`} className="flex flex-col border-r border-black last:border-r-0 shrink-0 relative group">
                                <div className="w-12 border-b border-black p-1 text-center font-bold bg-gray-50 text-xs">
                                    Q{q}
                                </div>
                                <div className="w-12 p-1 bg-white h-8"></div>
                                {/* Remove button on hover */}
                                {isEditing && (
                                    <button
                                        onClick={() => handleRemoveQuestion(idx)}
                                        className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10"
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                        ))}
                        {/* Total Cell */}
                        <div className="flex flex-col border-l-2 border-black shrink-0">
                            <div className="w-14 border-b border-black p-1 text-center font-bold bg-gray-200 text-xs">
                                Total
                            </div>
                            <div className="w-14 p-1 bg-white h-8"></div>
                        </div>
                        {/* Add Question Button */}
                        {isEditing && (
                            <button
                                onClick={handleAddQuestion}
                                className="flex flex-col border-l border-black shrink-0 hover:bg-blue-50 transition-colors"
                            >
                                <div className="w-10 border-b border-black p-1 text-center font-bold bg-gray-50 text-xs text-blue-600">
                                    +
                                </div>
                                <div className="w-10 p-1 bg-white h-8 flex items-center justify-center text-blue-600 text-xs">
                                    Add
                                </div>
                            </button>
                        )}
                    </div>
                </div>
                {/* Scroll hint for many questions */}
                {count > 15 && (
                    <div className="text-[9px] text-gray-400 text-center py-0.5 bg-gray-50 border-t border-black">
                        ← Scroll to see all questions →
                    </div>
                )}
            </div>
        );
    }

    // Standard Vertical Table for 10 or fewer questions
    return (
        <div className="teacher-use-table-container mt-8 border-2 border-black p-0 w-48 ml-auto">
            {/* Editable Header */}
            <div className="bg-gray-100 border-b border-black p-1 text-center font-bold text-xs uppercase">
                {isEditing ? (
                    <input
                        type="text"
                        value={tableTitle}
                        onChange={(e) => setTableTitle(e.target.value)}
                        className="bg-transparent border-none text-center font-bold text-xs uppercase focus:outline-none focus:ring-1 focus:ring-blue-400 rounded w-full"
                    />
                ) : (
                    tableTitle
                )}
            </div>
            <table className="w-full border-collapse text-sm" style={{ fontFamily: 'sans-serif' }}>
                <thead>
                    <tr className="bg-gray-100">
                        <th className="border border-black p-1 text-center font-bold">Qn</th>
                        <th className="border border-black p-1 text-center font-bold">Mark</th>
                        {isEditing && <th className="border border-black p-1 w-6"></th>}
                    </tr>
                </thead>
                <tbody>
                    {localQuestions.map((q, idx) => (
                        <tr key={`q-${idx}`} className="group">
                            <td className="border border-black p-1 text-center font-semibold">{q}</td>
                            <td className="border border-black p-1 bg-white h-8"></td>
                            {isEditing && (
                                <td className="border border-black p-0.5 text-center">
                                    <button
                                        onClick={() => handleRemoveQuestion(idx)}
                                        className="w-4 h-4 bg-red-500 text-white rounded-full text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center mx-auto"
                                    >
                                        ×
                                    </button>
                                </td>
                            )}
                        </tr>
                    ))}
                    <tr>
                        <td className="border border-black p-1 text-center font-bold bg-gray-100">Total</td>
                        <td className="border border-black p-1 bg-white h-8"></td>
                        {isEditing && <td className="border border-black p-0.5"></td>}
                    </tr>
                    {/* Add row button when editing */}
                    {isEditing && (
                        <tr>
                            <td colSpan={3} className="border border-black p-1 text-center">
                                <button
                                    onClick={handleAddQuestion}
                                    className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                                >
                                    + Add Question
                                </button>
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};
