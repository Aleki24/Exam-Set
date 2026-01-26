import React, { FC } from 'react';
import { ExamCoverData } from '@/types/ExamCoverData';

export const CambridgeCover: FC<ExamCoverData> = ({
    institutionName,
    examTitle,
    subject,
    level,
    duration,
    totalMarks,
    additionalMaterials,
}) => {
    const questionCount = 20; // Default or calculated rows

    return (
        <div className="w-full h-full bg-white text-black p-[20mm] font-sans relative border-4 border-gray-300 rounded-2xl shadow-lg">
            {/* Header Section */}
            <div className="flex items-start justify-between mb-12">
                <div className="flex items-center gap-4">
                    {/* Logo Placeholder */}
                    <div className="w-16 h-16 bg-gray-200 flex items-center justify-center">
                        <svg viewBox="0 0 24 24" className="w-10 h-10 text-black" fill="currentColor">
                            <path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z" />
                        </svg>
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold leading-tight">{institutionName || 'Cambridge Assessment'}</h1>
                        <h2 className="text-xl leading-tight text-gray-700">{institutionName?.includes('Cambridge') ? 'International Education' : ''}</h2>
                    </div>
                </div>
            </div>

            {/* Exam Title Block */}
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-[#0091D5] mb-2">{examTitle || 'Cambridge Primary Progression Test'}</h1>
                <h2 className="text-2xl font-bold mb-1">{subject}</h2>
                <h3 className="text-2xl font-normal">{level}</h3>
            </div>

            {/* Barcode Side Strip */}
            <div className="absolute left-[10mm] top-[40mm] bottom-[40mm] w-[10mm] flex flex-col justify-center items-center">
                <div className="h-full w-full border-r border-black flex flex-col gap-1 items-end pr-1">
                    {/* Fake Barcode Lines */}
                    {Array.from({ length: 40 }).map((_, i) => (
                        <div key={i} className={`w-full bg-black ${i % 3 === 0 ? 'h-3' : 'h-1'} mb-1`}></div>
                    ))}
                </div>
                <div className="text-[10px] transform -rotate-90 origin-center whitespace-nowrap mt-4 tracking-widest">
                    * 1234567890 *
                </div>
            </div>

            <div className="flex justify-between items-end mb-4">
                {/* Duration aligned to right, but above name line in visual hierarchy usually? 
                     In the image, '45 minutes' is right aligned above the table.
                 */}
                <div className="flex-grow"></div>
                <div className="font-bold text-lg">{duration}</div>
            </div>

            {/* Name Field */}
            <div className="mb-8 flex items-baseline gap-4">
                <span className="font-bold">Name</span>
                <div className="border-b border-dotted border-black flex-grow h-4"></div>
            </div>

            {/* Additional Materials */}
            {additionalMaterials && (
                <div className="mb-6">
                    <span className="font-bold">Additional materials:</span> {additionalMaterials}
                </div>
            )}

            {/* Main Content Areas */}
            <div className="flex gap-8">
                {/* Left Column: Instructions */}
                <div className="flex-1">
                    <div className="mb-6">
                        <strong className="block mb-4">READ THESE INSTRUCTIONS FIRST</strong>
                        <ul className="list-none space-y-4">
                            <li>Answer <strong>all</strong> questions in the spaces provided on the question paper.</li>
                            <li>You should show all your working on the question paper.</li>
                            <li>The number of marks is given in brackets [ ] at the end of each question or part question.</li>
                            <li>The total number of marks for this paper is {totalMarks}.</li>
                        </ul>
                    </div>

                    {/* Footer Code */}
                    <div className="mt-20 text-xs text-gray-500">
                        <p>{subject && subject.substring(0, 3).toUpperCase()}_02_{level?.replace(/[^0-9]/g, '') || '01'}_7RP</p>
                        <p>© UCLES {new Date().getFullYear()}</p>
                    </div>
                </div>

                {/* Right Column: Teacher's Use Table */}
                <div className="w-48 flex-shrink-0">
                    <table className="w-full border-collapse border border-black text-center text-sm">
                        <thead>
                            <tr>
                                <th colSpan={2} className="border border-black p-1">For Teacher's Use</th>
                            </tr>
                            <tr>
                                <th className="border border-black p-1 w-1/2">Page</th>
                                <th className="border border-black p-1 w-1/2">Mark</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Array.from({ length: 22 }).map((_, i) => (
                                <tr key={i} className="h-6">
                                    <td className="border border-black p-0">{i + 1}</td>
                                    <td className="border border-black p-0 relative">
                                        {/* Cross out example for first and last if needed, but keeping clean for now */}
                                    </td>
                                </tr>
                            ))}
                            <tr className="h-6 font-bold">
                                <td className="border border-black p-0">Total</td>
                                <td className="border border-black p-0"></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
