
import React from 'react';
import { ExamPaper, LogoPlacement } from '../types';

interface ExamPreviewProps {
  paper: ExamPaper;
  onEdit?: (type: 'metadata' | 'question', id: string, key: string, value: string) => void;
}

const ExamPreview: React.FC<ExamPreviewProps> = ({ paper, onEdit }) => {
  const { metadata, questions } = paper;

  const handleBlur = (type: 'metadata' | 'question', id: string, key: string, e: React.FocusEvent<HTMLElement>) => {
    if (onEdit) onEdit(type, id, key, e.currentTarget.innerText);
  };

  const getFontFamily = () => {
    switch (metadata.layoutConfig.fontFamily) {
      case 'serif': return 'font-serif';
      case 'mono': return 'font-mono';
      default: return 'font-sans';
    }
  };

  // Removed overflow-hidden to allow content to flow naturally to next pages in PDF/Print
  const pageBaseClass = `bg-white w-[210mm] min-h-[297mm] p-[20mm] relative shadow-[0_20px_50px_rgba(0,0,0,0.1)] mb-12 last:mb-0 print:shadow-none print:m-0 print:w-full flex flex-col ${getFontFamily()} ${metadata.layoutConfig.fontSize} text-slate-900`;

  const renderEditable = (text: string, type: 'metadata' | 'question', id: string, key: string, className?: string) => (
    <span 
      contentEditable={!!onEdit}
      suppressContentEditableWarning={true}
      onBlur={(e) => handleBlur(type, id, key, e)}
      className={`outline-none focus:bg-blue-50/50 transition-colors rounded-sm empty:inline-block empty:min-w-[50px] ${onEdit ? 'hover:bg-slate-50 cursor-text' : ''} ${className}`}
    >
      {text || (onEdit ? '...' : '')}
    </span>
  );

  const renderHeader = () => {
    const isCentered = metadata.logoPlacement === 'center';
    const isRight = metadata.logoPlacement === 'right';

    // === PEARSON STYLE ===
    if (metadata.templateId === 'pearson') {
      return (
        <div className="mb-8">
           <div className="bg-slate-100 p-4 border-b-2 border-slate-300 flex justify-between items-center mb-6">
              <div>
                 <p className="font-bold text-slate-500 text-xs uppercase tracking-widest">Candidate Number</p>
                 <div className="flex gap-1 mt-1">
                    {[1,2,3,4].map(i => <div key={i} className="w-8 h-8 border border-slate-400 bg-white"></div>)}
                 </div>
              </div>
              <div className="text-right">
                 <h1 className="text-xl font-bold uppercase">{renderEditable(metadata.institution, 'metadata', '', 'institution')}</h1>
                 <p className="text-xs text-slate-500">{renderEditable(metadata.title, 'metadata', '', 'title')}</p>
              </div>
           </div>
           
           <div className="flex items-start gap-6 mb-8">
              <div className="flex-1">
                 <div className="bg-slate-900 text-white p-3 text-center uppercase font-bold text-sm mb-4">
                    Paper Reference: {renderEditable(metadata.code || 'CODE/01', 'metadata', '', 'code')}
                 </div>
                 <div className="space-y-4">
                    <div className="flex justify-between border-b border-slate-300 pb-1">
                       <span className="font-bold uppercase text-xs">Surname</span>
                       <span className="text-sm">{renderEditable(' ', 'metadata', '', 'surname_placeholder')}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-300 pb-1">
                       <span className="font-bold uppercase text-xs">Other Names</span>
                       <span className="text-sm">{renderEditable(' ', 'metadata', '', 'othernames_placeholder')}</span>
                    </div>
                 </div>
              </div>
              
              <div className="w-32 flex flex-col items-center justify-center space-y-1">
                 {/* Fake Barcode */}
                 <div className="h-24 w-full flex items-end justify-center gap-[2px] overflow-hidden">
                    {Array.from({length: 40}).map((_, i) => (
                       <div key={i} className="bg-black" style={{ width: Math.random() > 0.5 ? '2px' : '4px', height: `${Math.random() * 50 + 50}%` }}></div>
                    ))}
                 </div>
                 <p className="text-[10px] font-mono tracking-widest">P49832A</p>
              </div>
           </div>
           
           <div className="grid grid-cols-2 gap-8 text-sm mb-8">
              <div>
                 <p className="font-bold mb-1">Time: {renderEditable(metadata.timeLimit, 'metadata', '', 'timeLimit')}</p>
                 <p className="text-slate-500 italic">You must have: Ruler, Calculator</p>
              </div>
              <div className="text-right">
                 <p className="font-bold">Total Marks: {metadata.totalMarks}</p>
              </div>
           </div>
        </div>
      );
    }

    // === CBC (Competency Based Curriculum) STYLE ===
    if (metadata.templateId === 'cbc') {
       return (
         <div className="mb-8 font-sans">
            <div className="text-center border-b-4 border-double border-slate-900 pb-6 mb-6">
               {metadata.logo && <img src={metadata.logo} className="h-20 mx-auto mb-2" alt="Logo" />}
               <h1 className="text-2xl font-black uppercase underline decoration-2 underline-offset-4 mb-2">
                  {renderEditable(metadata.institution, 'metadata', '', 'institution')}
               </h1>
               <h2 className="text-xl font-bold uppercase text-slate-700 mb-1">
                  {renderEditable(metadata.title, 'metadata', '', 'title')}
               </h2>
               <p className="font-bold uppercase tracking-widest text-sm">{renderEditable(metadata.subject, 'metadata', '', 'subject')}</p>
            </div>

            <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm font-bold border-2 border-slate-900 p-4 mb-6">
               <div className="flex gap-2 items-end">
                  <span>NAME:</span>
                  <div className="flex-1 border-b-2 border-dotted border-slate-400"></div>
               </div>
               <div className="flex gap-2 items-end">
                  <span>ADM NO:</span>
                  <div className="flex-1 border-b-2 border-dotted border-slate-400"></div>
               </div>
               <div className="flex gap-2 items-end">
                  <span>CLASS:</span>
                  <div className="flex-1 border-b-2 border-dotted border-slate-400"></div>
               </div>
               <div className="flex gap-2 items-end">
                  <span>DATE:</span>
                  <div className="flex-1 border-b-2 border-dotted border-slate-400"></div>
               </div>
            </div>

            {/* Rubric Grid */}
            <div className="border border-slate-900 mb-8">
               <div className="bg-slate-100 border-b border-slate-900 p-2 text-center font-black text-xs uppercase">Assessment Rubric</div>
               <div className="grid grid-cols-4 divide-x divide-slate-900 text-center text-[10px] uppercase font-bold">
                  <div className="p-2">Exceeding Exp.</div>
                  <div className="p-2">Meeting Exp.</div>
                  <div className="p-2">Approaching Exp.</div>
                  <div className="p-2">Below Exp.</div>
               </div>
               <div className="grid grid-cols-4 divide-x divide-slate-900 text-center h-8">
                  <div></div><div></div><div></div><div></div>
               </div>
            </div>
         </div>
       )
    }

    // === MODERN / MINIMALIST ===
    if (metadata.templateId === 'modern' || metadata.templateId === 'minimalist') {
      return (
        <div className="mb-12 p-8 rounded-3xl" style={{ backgroundColor: metadata.templateId === 'modern' ? (metadata.headerColor || '#0f172a') : 'transparent', color: metadata.templateId === 'modern' ? '#fff' : '#000' }}>
          <div className={`flex flex-col md:flex-row items-center gap-6 ${isCentered ? 'text-center' : isRight ? 'md:flex-row-reverse text-right' : ''}`}>
            {metadata.logo && <img src={metadata.logo} className={`w-16 h-16 object-contain p-2 rounded-2xl ${metadata.templateId === 'modern' ? 'bg-white/20' : ''}`} alt="Logo" />}
            <div className="flex-1">
              <h1 className="text-3xl font-black mb-1">{renderEditable(metadata.title, 'metadata', '', 'title')}</h1>
              <p className={`${metadata.templateId === 'modern' ? 'text-blue-300' : 'text-blue-600'} font-black uppercase tracking-[0.3em] text-[10px] mb-4`}>{renderEditable(metadata.institution, 'metadata', '', 'institution')}</p>
              <div className={`flex flex-wrap gap-x-6 gap-y-2 text-[10px] font-black uppercase ${metadata.templateId === 'modern' ? 'opacity-60' : 'text-slate-400'} ${isCentered ? 'justify-center' : isRight ? 'justify-end' : ''}`}>
                {metadata.customFields.map(f => (
                  <div key={f.id} className="flex gap-2">
                    <span>{f.label}:</span>
                    {renderEditable(f.value, 'metadata', '', `custom_${f.id}`)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // === CAMBRIDGE / DEFAULT STYLE ===
    return (
      <div className="border-b-[6px] pb-6 mb-8" style={{ borderColor: metadata.headerColor || '#0f172a' }}>
        <div className={`flex items-start justify-between mb-8 ${isRight ? 'flex-row-reverse' : isCentered ? 'flex-col items-center text-center' : ''}`}>
          {metadata.logo && <img src={metadata.logo} className="w-24 h-24 object-contain mb-4" alt="Institution Logo" />}
          <div className={isCentered ? 'text-center' : isRight ? 'text-right' : ''}>
             <h1 className="text-3xl font-black uppercase tracking-tighter leading-none mb-2" style={{ color: metadata.headerColor }}>
                {renderEditable(metadata.institution, 'metadata', '', 'institution')}
             </h1>
             <p className="text-[11px] font-black tracking-[0.5em] text-slate-400 uppercase">Assessment Intelligence System</p>
          </div>
        </div>

        {/* Cambridge ID Box */}
        <div className="border-2 border-slate-900 mb-6">
           <div className="flex divide-x-2 divide-slate-900 border-b-2 border-slate-900">
               <div className="p-2 text-[10px] font-bold uppercase w-32 shrink-0">Candidate Name</div>
               <div className="p-2 flex-1"></div>
           </div>
           <div className="flex divide-x-2 divide-slate-900">
               <div className="p-2 text-[10px] font-bold uppercase w-32 shrink-0">Centre Number</div>
               <div className="p-2 w-40"></div>
               <div className="p-2 text-[10px] font-bold uppercase w-32 shrink-0 border-l-2 border-slate-900">Candidate Number</div>
               <div className="p-2 flex-1"></div>
           </div>
        </div>

        <div className="flex justify-between items-end">
           <div>
              <h2 className="text-xl font-bold uppercase tracking-tight mb-1">
                {renderEditable(metadata.title, 'metadata', '', 'title')}
              </h2>
              <div className="space-y-0.5 text-sm font-medium">
                 <p>{renderEditable(metadata.subject, 'metadata', '', 'subject')} - {renderEditable(metadata.code, 'metadata', '', 'code')}</p>
                 <p>Time: {renderEditable(metadata.timeLimit, 'metadata', '', 'timeLimit')}</p>
              </div>
           </div>
           
           <div className="text-right">
              <div className="border-2 border-slate-900 px-4 py-2 text-center">
                 <p className="text-[10px] font-bold uppercase">Total Marks</p>
                 <p className="text-xl font-black">{metadata.totalMarks}</p>
              </div>
           </div>
        </div>
      </div>
    );
  };

  return (
    <div className="exam-container print:bg-white bg-slate-200/50 flex flex-col items-center">
      <div id="exam-paper-content" className={pageBaseClass}>
        {renderHeader()}
        
        {metadata.instructions && (
          <div className={`mb-8 p-6 border-y-2 border-slate-200 italic text-slate-600 relative overflow-hidden text-sm ${metadata.templateId === 'pearson' ? 'bg-slate-50' : ''}`}>
             <p className="not-italic font-black uppercase text-[10px] tracking-widest mb-2 text-slate-900">Instructions to Candidates:</p>
             <div className="whitespace-pre-wrap leading-relaxed opacity-90">
                {renderEditable(metadata.instructions, 'metadata', '', 'instructions')}
             </div>
          </div>
        )}

        <div className="flex-1 space-y-8">
          {questions.map((q, index) => (
            <div key={q.id} className="page-break-inside-avoid relative flex gap-6 pt-4 first:pt-0">
              <span className="font-bold text-lg text-slate-700 w-8 shrink-0">{index + 1}</span>
              <div className="flex-1">
                <div className="font-medium leading-relaxed mb-6 text-[15px] text-slate-900 whitespace-pre-wrap">
                  {renderEditable(q.text, 'question', q.id, 'text')}
                </div>
                
                {q.type === 'Multiple Choice' && q.options && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-4 ml-2 mb-4">
                    {q.options.map((opt, i) => (
                      <div key={i} className="flex items-start gap-3 text-[14px]">
                        <span className="font-bold border border-slate-400 rounded w-6 h-6 flex items-center justify-center text-[11px] shrink-0 text-slate-700">{String.fromCharCode(65 + i)}</span>
                        <span className="flex-1 pt-0.5">{opt}</span>
                      </div>
                    ))}
                  </div>
                )}

                {(q.type === 'Structured' || q.type === 'Essay') && (
                  <div className="mt-6 space-y-6">
                    {Array.from({ length: q.type === 'Essay' ? 8 : 4 }).map((_, i) => (
                      <div key={i} className="border-b border-slate-300 w-full h-6"></div>
                    ))}
                  </div>
                )}
              </div>
              <div className="shrink-0 flex flex-col items-end pl-4">
                 <div className="font-bold text-[11px] text-slate-500">
                   [{renderEditable(q.marks.toString(), 'question', q.id, 'marks')}]
                 </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 pt-8 text-center border-t-4 border-slate-100 page-break-inside-avoid">
           <p className="font-bold uppercase tracking-[0.2em] text-[10px] text-slate-400">End of Examination</p>
        </div>
      </div>
    </div>
  );
};

export default ExamPreview;
