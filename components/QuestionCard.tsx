
import React, { useState } from 'react';
import { Question, BloomsLevel } from '../types';

interface QuestionCardProps {
  question: Question;
  onAdd?: (q: Question) => void;
  onRemove?: (id: string) => void;
  onUpdate?: (id: string, updates: Partial<Question>) => void;
  variant?: 'bank' | 'selected' | 'exam';
}

const BLOOMS_LEVELS: BloomsLevel[] = ['Knowledge', 'Understanding', 'Application', 'Analysis', 'Evaluation', 'Creation'];

const QuestionCard: React.FC<QuestionCardProps> = ({ question, onAdd, onRemove, onUpdate, variant = 'bank' }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [editState, setEditState] = useState(question);

  const getDifficultyColor = (diff: string) => {
    switch (diff) {
      case 'Easy': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'Medium': return 'bg-amber-50 text-amber-700 border-amber-100';
      case 'Difficult': return 'bg-rose-50 text-rose-700 border-rose-100';
      default: return 'bg-slate-50 text-slate-700 border-slate-100';
    }
  };

  const getBloomsColor = (level?: string) => {
    switch (level) {
      case 'Knowledge': case 'Understanding': return 'text-slate-500 bg-slate-100 border-slate-200';
      case 'Application': case 'Analysis': return 'text-blue-600 bg-blue-50 border-blue-100';
      case 'Evaluation': case 'Creation': return 'text-purple-600 bg-purple-50 border-purple-100';
      default: return 'text-slate-400 bg-slate-50 border-slate-100';
    }
  };

  const handleSave = () => {
    if (onUpdate) {
      onUpdate(question.id, editState);
    }
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="bg-white border-2 border-blue-500 rounded-xl p-5 shadow-lg relative z-10">
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold uppercase text-slate-400">Question Text</label>
            <textarea 
              value={editState.text} 
              onChange={e => setEditState({...editState, text: e.target.value})}
              className="w-full p-2 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
              rows={3}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
             <div>
                <label className="text-[10px] font-bold uppercase text-slate-400">Topic</label>
                <input 
                  value={editState.topic} 
                  onChange={e => setEditState({...editState, topic: e.target.value})}
                  className="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold"
                />
             </div>
             <div>
                <label className="text-[10px] font-bold uppercase text-slate-400">Marks</label>
                <input 
                  type="number"
                  value={editState.marks} 
                  onChange={e => setEditState({...editState, marks: parseInt(e.target.value) || 0})}
                  className="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold"
                />
             </div>
             <div>
                <label className="text-[10px] font-bold uppercase text-slate-400">Bloom's Level</label>
                <select 
                  value={editState.bloomsLevel || 'Knowledge'} 
                  onChange={e => setEditState({...editState, bloomsLevel: e.target.value as BloomsLevel})}
                  className="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold"
                >
                  {BLOOMS_LEVELS.map(level => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
             </div>
             <div>
                <label className="text-[10px] font-bold uppercase text-slate-400">Difficulty</label>
                <select 
                  value={editState.difficulty} 
                  onChange={e => setEditState({...editState, difficulty: e.target.value as any})}
                  className="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold"
                >
                  <option>Easy</option>
                  <option>Medium</option>
                  <option>Difficult</option>
                </select>
             </div>
          </div>
          
          {editState.type === 'Multiple Choice' && (
             <div>
               <label className="text-[10px] font-bold uppercase text-slate-400 mb-2 block">Options</label>
               <div className="space-y-2">
                 {editState.options?.map((opt, idx) => (
                   <div key={idx} className="flex gap-2 items-center">
                     <span className="text-xs font-bold text-slate-400 w-4">{String.fromCharCode(65+idx)}</span>
                     <input 
                        value={opt}
                        onChange={e => {
                          const newOpts = [...(editState.options || [])];
                          newOpts[idx] = e.target.value;
                          setEditState({...editState, options: newOpts});
                        }}
                        className="flex-1 p-1.5 border border-slate-200 rounded text-xs"
                     />
                   </div>
                 ))}
               </div>
             </div>
          )}

          <div>
             <label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">Marking Scheme / Answer Key</label>
             <textarea 
               value={editState.markingScheme || ''} 
               onChange={e => setEditState({...editState, markingScheme: e.target.value})}
               className="w-full p-2 border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none bg-emerald-50/50"
               rows={3}
               placeholder="Enter detailed marking guidance here..."
             />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button onClick={handleSave} className="px-3 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save Changes</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`group bg-white border rounded-xl p-5 transition-all relative flex flex-col h-full ${variant === 'selected' ? 'border-blue-200 shadow-sm' : 'border-slate-200 hover:border-blue-300 hover:shadow-sm'}`}>
      <div className="flex justify-between items-start mb-3">
        <div className="flex flex-wrap gap-2 items-center">
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getDifficultyColor(question.difficulty)}`}>
            {question.difficulty}
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border bg-blue-50 text-blue-700 border-blue-100 truncate max-w-[100px]">
            {question.topic}
          </span>
          {question.bloomsLevel && (
            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wide border ${getBloomsColor(question.bloomsLevel)}`}>
              {question.bloomsLevel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsEditing(true)} className="text-slate-300 hover:text-blue-500 transition-colors" title="Edit Question">
             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
          </button>
          <div className="text-slate-400 font-medium text-xs whitespace-nowrap">
            [{question.marks} marks]
          </div>
        </div>
      </div>
      
      <div className="flex-1 mb-4 space-y-4">
        <p className="text-slate-800 text-sm leading-relaxed whitespace-pre-wrap">
          {question.text}
        </p>

        {question.graphSvg && (
          <div className="my-4 p-4 bg-slate-50 rounded-lg flex justify-center border border-slate-100" dangerouslySetInnerHTML={{ __html: question.graphSvg }} />
        )}

        {question.options && (
          <ul className="space-y-1">
            {question.options.map((opt, i) => (
              <li key={i} className="text-xs text-slate-600 flex gap-2">
                <span className="font-semibold">{String.fromCharCode(65 + i)})</span> {opt}
              </li>
            ))}
          </ul>
        )}
      </div>

      {question.markingScheme && (
        <div className="mb-4">
           <button 
             onClick={() => setShowAnswer(!showAnswer)}
             className="flex items-center gap-2 text-[10px] font-bold uppercase text-emerald-600 hover:text-emerald-700 transition-colors"
           >
             <svg className={`w-4 h-4 transition-transform ${showAnswer ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
             {showAnswer ? 'Hide Marking Scheme' : 'Show Marking Scheme'}
           </button>
           {showAnswer && (
             <div className="mt-2 p-3 bg-emerald-50 rounded-lg border border-emerald-100 text-xs text-slate-700 leading-relaxed whitespace-pre-wrap animate-in slide-in-from-top-2">
               {question.markingScheme}
             </div>
           )}
        </div>
      )}

      <div className="flex justify-end pt-2 border-t border-slate-50 mt-auto gap-2">
        {variant === 'bank' && onAdd && (
          <button 
            onClick={() => onAdd(question)}
            className="w-full text-xs bg-slate-50 text-slate-600 font-bold px-3 py-2 rounded-lg hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center gap-2 group-hover:bg-blue-600 group-hover:text-white"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
            Select
          </button>
        )}
        
        {variant === 'selected' && (
          <>
            {onRemove && (
              <button 
                onClick={() => onRemove(question.id)}
                className="text-xs text-rose-500 hover:bg-rose-50 px-3 py-2 rounded-lg font-bold transition-colors"
              >
                Remove
              </button>
            )}
            {onAdd && (
              <button 
                onClick={() => onAdd(question)}
                className="flex-1 text-xs bg-blue-600 text-white font-bold px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                Add to Paper
              </button>
            )}
          </>
        )}

        {variant === 'exam' && onRemove && (
          <button 
            onClick={() => onRemove(question.id)}
            className="text-xs bg-rose-50 text-rose-600 font-bold px-3 py-1.5 rounded-lg hover:bg-rose-100 transition-colors flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" /></svg>
            Remove from Paper
          </button>
        )}
      </div>
    </div>
  );
};

export default QuestionCard;
