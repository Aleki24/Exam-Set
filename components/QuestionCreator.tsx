
import React, { useState } from 'react';
import { Question, BloomsLevel } from '../types';
import { getAiSuggestions } from '../services/geminiService';

interface QuestionCreatorProps {
  onSave: (q: Question) => void;
  onCancel: () => void;
  initialTopic?: string;
}

const BLOOMS_LEVELS: BloomsLevel[] = ['Knowledge', 'Understanding', 'Application', 'Analysis', 'Evaluation', 'Creation'];

const QuestionCreator: React.FC<QuestionCreatorProps> = ({ onSave, onCancel, initialTopic = 'General' }) => {
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<Partial<Question>>({
    id: `manual-${Date.now()}`,
    text: '',
    type: 'Multiple Choice',
    marks: 1,
    difficulty: 'Medium',
    topic: initialTopic === 'All' ? 'General' : initialTopic,
    options: ['', '', '', ''],
    markingScheme: '',
    graphSvg: '',
    bloomsLevel: 'Knowledge'
  });

  const handleAiAssist = async () => {
    if (!draft.text || draft.text.length < 3) return;
    setLoading(true);
    try {
      const suggestions = await getAiSuggestions(draft.text || '', draft.type || 'Multiple Choice', draft.topic);
      if (suggestions) {
        setDraft(prev => ({
          ...prev,
          text: suggestions.refinedText,
          marks: suggestions.suggestedMarks || prev.marks,
          topic: suggestions.suggestedTopic || prev.topic,
          options: (prev.type === 'Multiple Choice' && suggestions.options?.length) ? suggestions.options : prev.options,
          markingScheme: suggestions.markingScheme || prev.markingScheme,
          graphSvg: suggestions.graphSvg || prev.graphSvg,
          bloomsLevel: suggestions.bloomsLevel || prev.bloomsLevel
        }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const save = () => {
    if (!draft.text) return;
    onSave(draft as Question);
  };

  return (
    <div className="bg-white rounded-3xl border-2 border-blue-600 shadow-xl overflow-hidden mb-8 animate-in fade-in slide-in-from-top-4 duration-300">
      {/* Header / Tabs */}
      <div className="bg-slate-50 border-b border-slate-200 flex flex-wrap gap-1 p-2">
        {(['Multiple Choice', 'Structured', 'Essay'] as const).map(type => (
          <button
            key={type}
            onClick={() => setDraft({ ...draft, type })}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all ${
              draft.type === type 
                ? 'bg-blue-600 text-white shadow-md' 
                : 'text-slate-500 hover:bg-white hover:text-blue-600'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      <div className="p-6 space-y-6">
        {/* Main Input */}
        <div className="relative">
          <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block tracking-wider">Question Content</label>
          <div className="relative">
            <textarea
              value={draft.text}
              onChange={e => setDraft({ ...draft, text: e.target.value })}
              placeholder="Type your question here..."
              className="w-full min-h-[120px] p-4 rounded-xl border-2 border-slate-100 bg-slate-50 text-sm font-medium focus:border-blue-500 focus:bg-white outline-none transition-all resize-none leading-relaxed"
            />
            {/* AI Assist Button */}
            <button
              onClick={handleAiAssist}
              disabled={loading || !draft.text}
              className="absolute bottom-3 right-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-2 shadow-sm hover:shadow-md hover:scale-105 transition-all disabled:opacity-50 disabled:scale-100"
            >
              {loading ? (
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              ) : (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              )}
              AI Assist
            </button>
          </div>
        </div>

        {/* Graph Preview if exists */}
        {draft.graphSvg && (
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
             <div className="flex justify-between items-center mb-2">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Graph / Diagram</label>
                <button onClick={() => setDraft({...draft, graphSvg: ''})} className="text-rose-500 text-[10px] font-bold hover:underline">Remove</button>
             </div>
             <div className="flex justify-center" dangerouslySetInnerHTML={{__html: draft.graphSvg}} />
          </div>
        )}

        {/* Options for MC */}
        {draft.type === 'Multiple Choice' && (
          <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
             <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Answer Options</label>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
               {draft.options?.map((opt, idx) => (
                 <div key={idx} className="flex items-center gap-2">
                   <div className="w-6 h-6 rounded bg-slate-200 text-slate-500 flex items-center justify-center text-[10px] font-bold">
                     {String.fromCharCode(65 + idx)}
                   </div>
                   <input
                      value={opt}
                      onChange={e => {
                        const newOpts = [...(draft.options || [])];
                        newOpts[idx] = e.target.value;
                        setDraft({ ...draft, options: newOpts });
                      }}
                      placeholder={`Option ${idx + 1}`}
                      className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium focus:border-blue-400 outline-none"
                   />
                 </div>
               ))}
             </div>
          </div>
        )}

        {/* Marking Scheme */}
        <div>
           <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block tracking-wider">Marking Scheme / Answer Key</label>
           <textarea
              value={draft.markingScheme}
              onChange={e => setDraft({ ...draft, markingScheme: e.target.value })}
              placeholder="e.g. Correct Answer: B. Reason: ..."
              className="w-full p-3 rounded-xl border border-slate-200 bg-emerald-50/30 text-xs font-medium focus:border-emerald-500 outline-none transition-all resize-none"
              rows={3}
           />
        </div>

        {/* Metadata Footer */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-slate-100 pt-4">
           <div>
             <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Marks</label>
             <input 
               type="number" 
               value={draft.marks}
               onChange={e => setDraft({ ...draft, marks: parseInt(e.target.value) || 0 })}
               className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
             />
           </div>
           <div>
             <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Difficulty</label>
             <select 
               value={draft.difficulty}
               onChange={e => setDraft({ ...draft, difficulty: e.target.value as any })}
               className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
             >
                <option>Easy</option>
                <option>Medium</option>
                <option>Difficult</option>
             </select>
           </div>
           <div>
             <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Bloom's Level</label>
             <select 
               value={draft.bloomsLevel}
               onChange={e => setDraft({ ...draft, bloomsLevel: e.target.value as BloomsLevel })}
               className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
             >
                {BLOOMS_LEVELS.map(level => (
                  <option key={level} value={level}>{level}</option>
                ))}
             </select>
           </div>
           <div>
             <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Topic</label>
             <input 
               value={draft.topic}
               onChange={e => setDraft({ ...draft, topic: e.target.value })}
               className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
             />
           </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-2">
           <button onClick={onCancel} className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100">
             Cancel
           </button>
           <button 
             onClick={save}
             className="px-6 py-2.5 rounded-xl text-xs font-black uppercase text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all hover:scale-[1.02]"
           >
             Save Question
           </button>
        </div>
      </div>
    </div>
  );
};

export default QuestionCreator;
