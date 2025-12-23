
'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Question, ViewState, ExamMetadata, ExamPaper, TemplateId, FontFamily, LogoPlacement, CustomField, MobileTab } from '../types';
import Sidebar from '../components/Sidebar';
import QuestionCard from '../components/QuestionCard';
import ExamPreview from '../components/ExamPreview';
import QuestionCreator from '../components/QuestionCreator'; 
import MarkingSchemePreview from '../components/MarkingSchemePreview'; 
import BalanceCharts from '../components/BalanceCharts';
import { generateQuestionsFromMaterial, generateQuestionsByFilter } from '../services/geminiService';
import { INITIAL_QUESTIONS } from '../data/mockData';

declare var html2pdf: any;

const DEFAULT_METADATA: ExamMetadata = {
  id: '',
  title: 'Annual Summative Assessment',
  subject: 'General Science',
  code: 'SCI101',
  timeLimit: '2 Hours',
  totalMarks: 0,
  institution: 'ExamGenius AI',
  instructions: '1. Answer all questions.\n2. Do not use external materials.',
  templateId: 'cambridge',
  layoutConfig: {
    fontSize: 'text-base',
    fontFamily: 'sans'
  },
  logoPlacement: 'left',
  headerColor: '#0f172a', 
  footerColor: '#0f172a',
  customFields: []
};

// Filter Types
interface FilterState {
  curriculum: string;
  subject: string;
  term: string;
  grade: string;
  topic: string;
  blooms: string; 
}

// Static Data for Filters
const STATIC_CURRICULUMS = ['IGCSE', 'CBC', 'Pearson', 'Cambridge', 'National', 'IB'];
const STATIC_SUBJECTS = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'Integrated Science', 'English', 'History', 'Geography', 'Computer Science'];
const STATIC_TERMS = ['Opener', 'Mid Term 1', 'End of Term 1', 'Mid Term 2', 'End of Term 2', 'Mid Term 3', 'End of Term 3'];
const BLOOMS_LEVELS = ['Knowledge', 'Understanding', 'Application', 'Analysis', 'Evaluation', 'Creation'];

export default function Home() {
  const [currentView, setCurrentView] = useState<ViewState>('materials');
  const [materialText, setMaterialText] = useState('');
  const [uploadedImages, setUploadedImages] = useState<{ data: string; mimeType: string }[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Initialize with Mock Data
  const [questionBank, setQuestionBank] = useState<Question[]>(INITIAL_QUESTIONS);
  
  // STAGING STATE (The "Selected" tab)
  const [selectedQuestions, setSelectedQuestions] = useState<Question[]>([]); 
  
  // FINAL EXAM STATE (The actual paper)
  const [examQuestions, setExamQuestions] = useState<Question[]>([]);
  
  // Manual Creation Mode State
  const [isCreatingManual, setIsCreatingManual] = useState(false);

  const [metadata, setMetadata] = useState<ExamMetadata>({ ...DEFAULT_METADATA, id: Date.now().toString() });
  const [library, setLibrary] = useState<ExamPaper[]>([]);
  
  // Advanced Filters
  const [filters, setFilters] = useState<FilterState>({
    curriculum: 'All',
    subject: 'All',
    term: 'All',
    grade: 'All',
    topic: 'All',
    blooms: 'All'
  });
  
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'topic' | 'marks' | 'difficulty' | 'none'>('none');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // View State for Right Sidebar (Desktop) and Mobile Tabs
  const [previewDevice, setPreviewDevice] = useState<'phone' | 'tablet' | 'desktop'>('desktop');
  const [mobileTab, setMobileTab] = useState<MobileTab>('editor');
  const [desktopRightTab, setDesktopRightTab] = useState<'preview' | 'selected'>('preview');
  
  // Replenish Loading State
  const [isReplenishing, setIsReplenishing] = useState(false);

  // Download Dropdown
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('exam_genius_library');
    if (saved) {
      try {
        setLibrary(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse library", e);
      }
    }
    const savedInst = localStorage.getItem('exam_genius_institution');
    if (savedInst) setMetadata(p => ({...p, institution: savedInst}));
  }, []);

  const saveToLibrary = () => {
    const paper: ExamPaper = {
      metadata: { ...metadata, totalMarks: totalMarks },
      questions: examQuestions,
      updatedAt: Date.now()
    };
    const updatedLibrary = [paper, ...library.filter(p => p.metadata.id !== metadata.id)];
    setLibrary(updatedLibrary);
    localStorage.setItem('exam_genius_library', JSON.stringify(updatedLibrary));
    alert("Exam successfully saved to library!");
  };

  const loadFromLibrary = (paper: ExamPaper) => {
    setMetadata(paper.metadata);
    setExamQuestions(paper.questions);
    setSelectedQuestions([]); 
    setCurrentView('builder');
  };

  const deleteFromLibrary = (id: string) => {
    if (confirm("Are you sure you want to permanently delete this exam paper?")) {
      const updated = library.filter(p => p.metadata.id !== id);
      setLibrary(updated);
      localStorage.setItem('exam_genius_library', JSON.stringify(updated));
    }
  };

  // Generation Logic
  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      if (materialText.trim() || uploadedImages.length > 0) {
        // Generate from Material
        const { questions, suggestedTitle } = await generateQuestionsFromMaterial(materialText, uploadedImages, 20);
        const taggedQuestions = questions.map(q => ({
           ...q,
           curriculum: filters.curriculum !== 'All' ? filters.curriculum : 'Generated',
           subject: filters.subject !== 'All' ? filters.subject : 'General',
        }));
        setQuestionBank(prev => [...taggedQuestions, ...prev]);
        if (!metadata.title || metadata.title === DEFAULT_METADATA.title) {
          setMetadata(prev => ({ ...prev, title: suggestedTitle }));
        }
      } else {
        // Generate from Filters
        const questions = await generateQuestionsByFilter(filters, 20);
        setQuestionBank(questions); 
      }
      setCurrentView('bank');
    } catch (err) {
      console.error(err);
      alert("AI Generation failed. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const replenishOneQuestion = async () => {
    setIsReplenishing(true);
    try {
      const newQuestions = await generateQuestionsByFilter(filters, 1, questionBank);
      if (newQuestions.length > 0) {
        setQuestionBank(prev => [...prev, ...newQuestions]);
      }
    } catch (e) {
      console.error("Auto-replenish failed", e);
    } finally {
      setIsReplenishing(false);
    }
  };

  const downloadPDF = (type: 'paper' | 'answers') => {
    const elementId = type === 'paper' ? 'exam-paper-content' : 'marking-scheme-content';
    const element = document.getElementById(elementId);
    
    if (!element) {
      alert("Content not found. Please ensure you have added questions.");
      return;
    }
    
    const suffix = type === 'paper' ? '' : '_MARKING_SCHEME';
    
    const opt = {
      margin: 0,
      filename: `${metadata.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}${suffix}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, scrollY: 0 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    if (typeof html2pdf !== 'undefined') {
      html2pdf().set(opt).from(element).save();
    } else {
      window.print();
    }
    setShowDownloadMenu(false);
  };

  // BANK -> SHORTLIST (SELECTED QUESTIONS TAB)
  const addToShortlist = (q: Question) => {
    if (!selectedQuestions.some(sq => sq.id === q.id) && !examQuestions.some(eq => eq.id === q.id)) {
      setSelectedQuestions(prev => [...prev, q]);
      setQuestionBank(prev => prev.filter(item => item.id !== q.id));
      replenishOneQuestion();
    }
  };

  const handleManualSave = (q: Question) => {
     setSelectedQuestions(prev => [q, ...prev]);
     setIsCreatingManual(false);
  };

  // SHORTLIST -> EXAM (ADD TO PAPER)
  const moveToPaper = (q: Question) => {
    if (!examQuestions.some(eq => eq.id === q.id)) {
       setExamQuestions(prev => [...prev, q]);
       setSelectedQuestions(prev => prev.filter(sq => sq.id !== q.id));
    }
  };

  const moveAllToPaper = () => {
     setExamQuestions(prev => [...prev, ...selectedQuestions.filter(sq => !prev.some(eq => eq.id === sq.id))]);
     setSelectedQuestions([]);
  };

  // REMOVE FROM SHORTLIST
  const removeFromShortlist = (id: string) => {
    setSelectedQuestions(prev => prev.filter(q => q.id !== id));
  };

  // REMOVE FROM EXAM
  const removeFromExam = (id: string) => {
    setExamQuestions(prev => prev.filter(q => q.id !== id));
  };

  const updateQuestion = (source: 'bank' | 'selected' | 'exam', id: string, updates: Partial<Question>) => {
    if (source === 'bank') setQuestionBank(prev => prev.map(q => q.id === id ? { ...q, ...updates } : q));
    if (source === 'selected') setSelectedQuestions(prev => prev.map(q => q.id === id ? { ...q, ...updates } : q));
    if (source === 'exam') setExamQuestions(prev => prev.map(q => q.id === id ? { ...q, ...updates } : q));
  };

  const addCustomField = () => {
    const newField: CustomField = { id: Date.now().toString(), label: 'Field Name', value: 'Value' };
    setMetadata(prev => ({ ...prev, customFields: [...prev.customFields, newField] }));
  };

  const updateCustomField = (id: string, label: string, value: string) => {
    setMetadata(prev => ({
      ...prev,
      customFields: prev.customFields.map(f => f.id === id ? { ...f, label, value } : f)
    }));
  };

  const removeCustomField = (id: string) => {
    setMetadata(prev => ({
      ...prev,
      customFields: prev.customFields.filter(f => f.id !== id)
    }));
  };

  const handleInlineEdit = (type: 'metadata' | 'question', id: string, key: string, value: string) => {
    if (type === 'metadata') {
      if (key.startsWith('custom_')) {
        const fieldId = key.replace('custom_', '');
        updateCustomField(fieldId, metadata.customFields.find(f => f.id === fieldId)?.label || '', value);
      } else {
        setMetadata(prev => ({ ...prev, [key as keyof ExamMetadata]: value }));
      }
    } else {
      updateQuestion('exam', id, { [key as keyof Question]: value });
    }
  };

  const totalMarks = examQuestions.reduce((sum, q) => sum + q.marks, 0);

  // --- Filtering Logic ---
  
  const availableCurriculums = useMemo(() => Array.from(new Set([...STATIC_CURRICULUMS, ...questionBank.map(q => q.curriculum || 'General')])).sort(), [questionBank]);
  const availableSubjects = useMemo(() => Array.from(new Set([...STATIC_SUBJECTS, ...questionBank.map(q => q.subject || 'General')])).sort(), [questionBank]);
  const availableTerms = STATIC_TERMS;
  const availableTopics = useMemo(() => Array.from(new Set(questionBank.map(q => q.topic))).sort(), [questionBank]);

  const sortedAndFilteredQuestions = useMemo(() => {
    let result = questionBank.filter(q => {
      const matchesSearch = q.text.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           (q.topic && q.topic.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesCurriculum = filters.curriculum === 'All' || q.curriculum === filters.curriculum;
      const matchesSubject = filters.subject === 'All' || q.subject === filters.subject;
      const matchesTerm = filters.term === 'All' || q.term === filters.term;
      const matchesGrade = filters.grade === 'All' || q.grade === filters.grade;
      const matchesTopic = filters.topic === 'All' || q.topic === filters.topic;
      const matchesBlooms = filters.blooms === 'All' || (q.bloomsLevel || 'Knowledge') === filters.blooms;

      return matchesSearch && matchesCurriculum && matchesSubject && matchesTerm && matchesGrade && matchesTopic && matchesBlooms;
    });

    if (sortBy !== 'none') {
      result = [...result].sort((a, b) => {
        let valA: any, valB: any;
        if (sortBy === 'difficulty') {
          const map = { 'Easy': 1, 'Medium': 2, 'Difficult': 3 };
          valA = map[a.difficulty];
          valB = map[b.difficulty];
        } else {
          valA = a[sortBy];
          valB = b[sortBy];
        }
        if (typeof valA === 'string') {
          return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else {
          return sortOrder === 'asc' ? valA - valB : valB - valA;
        }
      });
    }
    return result;
  }, [questionBank, searchQuery, filters, sortBy, sortOrder]);

  const gradeLabel = (filters.curriculum === 'IGCSE' || filters.curriculum === 'Pearson' || filters.curriculum === 'Cambridge') ? 'Year' : 'Grade';

  const currentPaper: ExamPaper = { metadata: { ...metadata, totalMarks }, questions: examQuestions, updatedAt: Date.now() };

  return (
    <>
      <div id="print-area">
        <ExamPreview paper={currentPaper} />
      </div>
      <div id="marking-scheme-print-area" style={{ position: 'fixed', left: '-10000px', top: 0, width: '210mm', zIndex: -50 }}>
         <MarkingSchemePreview paper={currentPaper} />
      </div>

      <div id="root-container" className="flex h-screen bg-slate-50 overflow-hidden flex-col lg:flex-row font-sans">
        <Sidebar 
          currentView={currentView} 
          setView={setCurrentView} 
          isOpen={isSidebarOpen} 
          onClose={() => setIsSidebarOpen(false)} 
          brandName={metadata.institution} 
        />
        
        <main className="flex-1 flex overflow-hidden flex-col">
          <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-4 lg:px-6 shrink-0 z-10">
            <div className="flex items-center gap-3">
              <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 text-slate-500 hover:bg-slate-50 rounded-lg">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7" /></svg>
              </button>
              
              <div className="flex lg:hidden bg-slate-100 p-1 rounded-lg">
                <button 
                  onClick={() => setMobileTab('editor')}
                  className={`px-2 py-1.5 text-[10px] font-bold rounded-md transition-all ${mobileTab === 'editor' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                >
                  Bank
                </button>
                <button 
                  onClick={() => setMobileTab('selected')}
                  className={`px-2 py-1.5 text-[10px] font-bold rounded-md transition-all ${mobileTab === 'selected' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                >
                  Selected ({selectedQuestions.length})
                </button>
                <button 
                  onClick={() => setMobileTab('preview')}
                  className={`px-2 py-1.5 text-[10px] font-bold rounded-md transition-all ${mobileTab === 'preview' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                >
                  Preview
                </button>
              </div>

              <h2 className="hidden lg:block font-bold text-slate-800 truncate">
                {currentView === 'builder' ? 'EXAM BUILDER' : currentView.toUpperCase()}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={saveToLibrary} className="hidden md:flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-bold border border-emerald-100 hover:bg-emerald-100 transition-colors">
                Save Draft
              </button>
              
              <div className="relative">
                <button onClick={() => setShowDownloadMenu(!showDownloadMenu)} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700 shadow-sm active:scale-95 transition-transform flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Download PDF
                  <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                </button>
                
                {showDownloadMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowDownloadMenu(false)}></div>
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                      <button 
                        onClick={() => downloadPDF('paper')} 
                        className="w-full text-left px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2"
                      >
                         <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                         Question Paper
                      </button>
                      <button 
                        onClick={() => downloadPDF('answers')} 
                        className="w-full text-left px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2 border-t border-slate-50"
                      >
                         <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                         Marking Scheme
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </header>

          <div className="flex-1 flex overflow-hidden relative">
            {/* Main Content Area */}
            <div className={`
              flex-1 overflow-y-auto p-4 lg:p-6 scroll-smooth 
              ${mobileTab === 'preview' ? 'hidden lg:block' : ''}
            `}>
              
              <div className={mobileTab === 'editor' ? 'block' : 'hidden lg:block'}>
                {currentView === 'materials' && (
                  <div className="max-w-2xl mx-auto space-y-6">
                    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl">
                      <h3 className="text-2xl font-black text-slate-900 mb-6">Import Curriculum</h3>
                      <textarea 
                        value={materialText}
                        onChange={(e) => setMaterialText(e.target.value)}
                        placeholder="Paste your content here..."
                        className="w-full h-64 p-6 rounded-2xl border border-slate-100 bg-slate-50 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all text-sm mb-6 shadow-inner leading-relaxed"
                      />
                      <button 
                        onClick={handleGenerate}
                        disabled={isGenerating || !materialText}
                        className="w-full py-4 rounded-2xl font-black text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.98] transition-all shadow-lg shadow-blue-500/30 flex items-center justify-center gap-3"
                      >
                        {isGenerating ? 'AI Engine Working...' : 'Synthesize Questions'}
                      </button>
                    </div>
                  </div>
                )}

                {currentView === 'builder' && (
                  <div className="max-w-4xl mx-auto space-y-8 pb-32">
                    {/* Visual Analytics */}
                    <div className="h-48">
                        <BalanceCharts questions={examQuestions} />
                    </div>

                    {/* Identity Matrix */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                            <h4 className="text-[10px] font-black uppercase text-blue-600 tracking-[0.2em]">Identity Matrix</h4>
                          </div>
                          <div className="space-y-4">
                            <div className="group">
                              <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block">Exam Title</label>
                              <input value={metadata.title} onChange={e => setMetadata(p => ({...p, title: e.target.value}))} className="w-full px-4 py-2.5 bg-slate-50 rounded-xl border border-slate-200 focus:border-blue-500 outline-none text-sm font-bold transition-all" />
                            </div>
                            <div className="group">
                              <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block">Institution Name</label>
                              <input value={metadata.institution} onChange={e => setMetadata(p => ({...p, institution: e.target.value}))} className="w-full px-4 py-2.5 bg-slate-50 rounded-xl border border-slate-200 focus:border-blue-500 outline-none text-sm font-black text-blue-700 transition-all" />
                            </div>
                            
                            <div className="pt-4 border-t border-slate-50">
                              <div className="flex items-center justify-between mb-4">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Custom Fields</label>
                                <button onClick={addCustomField} className="text-[10px] font-black text-blue-600 uppercase bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors">+ Add</button>
                              </div>
                              <div className="space-y-3">
                                {metadata.customFields.map(f => (
                                  <div key={f.id} className="flex gap-2 items-start bg-slate-50 p-2 rounded-xl border border-slate-100">
                                      <div className="flex-1 space-y-1">
                                        <input 
                                          placeholder="Label (e.g. Date)" 
                                          value={f.label} 
                                          onChange={e => updateCustomField(f.id, e.target.value, f.value)} 
                                          className="w-full bg-transparent text-[10px] font-black uppercase text-slate-500 outline-none placeholder:text-slate-300" 
                                        />
                                        <input 
                                          placeholder="Value" 
                                          value={f.value} 
                                          onChange={e => updateCustomField(f.id, f.label, e.target.value)} 
                                          className="w-full bg-white px-2 py-1 rounded-md text-xs font-bold text-slate-800 outline-none border border-slate-200 focus:border-blue-400" 
                                        />
                                      </div>
                                      <button onClick={() => removeCustomField(f.id)} className="text-slate-300 hover:text-rose-500 p-2 hover:bg-rose-50 rounded-lg transition-colors">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                      </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                      </div>
                      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                            <h4 className="text-[10px] font-black uppercase text-blue-600 tracking-[0.2em]">Templates</h4>
                          </div>
                          <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-3">
                              {(['cambridge', 'pearson', 'cbc', 'modern', 'minimalist'] as TemplateId[]).map(t => (
                                <button 
                                  key={t} 
                                  onClick={() => setMetadata(p => ({...p, templateId: t}))} 
                                  className={`py-3 px-2 rounded-xl text-[10px] font-black uppercase transition-all border ${metadata.templateId === t ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200' : 'bg-slate-50 text-slate-500 border-slate-100 hover:border-blue-200 hover:text-blue-600'}`}
                                >
                                  {t}
                                </button>
                              ))}
                            </div>
                            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50">
                                <div className="space-y-2">
                                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Typography</label>
                                  <select value={metadata.layoutConfig.fontFamily} onChange={e => setMetadata(p => ({...p, layoutConfig: {...p.layoutConfig, fontFamily: e.target.value as any}}))} className="w-full bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs font-bold outline-none focus:border-blue-500">
                                      <option value="sans">Modern Sans</option>
                                      <option value="serif">Academic Serif</option>
                                      <option value="mono">Technical Mono</option>
                                  </select>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Size</label>
                                  <select value={metadata.layoutConfig.fontSize} onChange={e => setMetadata(p => ({...p, layoutConfig: {...p.layoutConfig, fontSize: e.target.value as any}}))} className="w-full bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs font-bold outline-none focus:border-blue-500">
                                      <option value="text-sm">Compact</option>
                                      <option value="text-base">Standard</option>
                                      <option value="text-lg">Large</option>
                                  </select>
                                </div>
                            </div>
                          </div>
                      </div>
                    </div>
                    
                    {/* Exam Questions List (Builder View) */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between px-2">
                          <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Questions ({examQuestions.length})</h4>
                          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">Total Marks: {totalMarks}</span>
                      </div>
                      <div className="space-y-3">
                        {examQuestions.map((q, idx) => (
                          <div key={q.id} className="bg-white p-5 rounded-3xl border border-slate-200 group shadow-sm hover:border-blue-200 transition-all flex items-start gap-4">
                              <span className="shrink-0 w-8 h-8 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center text-xs font-black">{idx + 1}</span>
                              <div className="flex-1 space-y-3">
                                <textarea value={q.text} onChange={e => updateQuestion('exam', q.id, { text: e.target.value })} className="w-full text-sm font-bold text-slate-800 bg-transparent border-none focus:ring-0 p-0 resize-none leading-relaxed" rows={2} />
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
                                      <span className="text-[9px] font-black text-slate-400 uppercase">Points</span>
                                      <input type="number" value={q.marks} onChange={e => updateQuestion('exam', q.id, { marks: parseInt(e.target.value) || 0 })} className="w-8 text-[11px] font-black text-blue-600 bg-transparent outline-none" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                       <span className="text-[9px] font-black text-slate-400 uppercase">Ans</span>
                                       <input 
                                         value={q.markingScheme || ''} 
                                         onChange={e => updateQuestion('exam', q.id, { markingScheme: e.target.value })} 
                                         className="w-48 text-[11px] font-medium text-emerald-700 bg-emerald-50/50 border border-emerald-100 rounded px-2 py-0.5 truncate focus:w-full transition-all focus:absolute focus:z-10 focus:shadow-md" 
                                         placeholder="Add marking scheme..."
                                       />
                                    </div>
                                </div>
                              </div>
                              <button onClick={() => removeFromExam(q.id)} className="text-slate-300 hover:text-rose-500 transition-colors mt-2">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {currentView === 'bank' && (
                  <div className="space-y-6">
                    {/* Header / Actions */}
                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                      <div className="flex flex-col md:flex-row gap-4 items-start md:items-end justify-between">
                          <div>
                            <h2 className="text-xl font-black text-slate-900 mb-1">Question Repository</h2>
                            <p className="text-xs text-slate-500 font-medium">
                               {isCreatingManual ? 'Create custom questions manually' : `Browse and filter ${questionBank.length} available questions`}
                            </p>
                          </div>
                          
                          {/* Toggle Between Browse and Create */}
                          <div className="w-full md:w-auto flex flex-col sm:flex-row gap-2">
                            {isCreatingManual ? (
                               <button 
                                 onClick={() => setIsCreatingManual(false)}
                                 className="px-4 py-2 rounded-xl text-xs font-black uppercase text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
                               >
                                 Cancel Creation
                               </button>
                            ) : (
                               <>
                                <button 
                                  onClick={() => setIsCreatingManual(true)}
                                  className="px-4 py-2 rounded-xl text-xs font-black uppercase text-blue-600 bg-blue-50 border border-blue-100 hover:bg-blue-100 transition-all flex items-center justify-center gap-2"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                                  Create Manually
                                </button>
                                <button 
                                  onClick={handleGenerate}
                                  disabled={isGenerating}
                                  className={`px-4 py-2 rounded-xl text-xs font-black uppercase text-white transition-all shadow-md flex items-center justify-center gap-2 ${isGenerating ? 'bg-slate-400' : 'bg-slate-900 hover:bg-black active:scale-95'}`}
                                >
                                  {isGenerating ? (
                                    <>
                                       <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                       <span>Generating...</span>
                                    </>
                                  ) : (
                                    <>
                                       <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                       <span>Generate AI Questions</span>
                                    </>
                                  )}
                                </button>
                               </>
                            )}
                          </div>
                      </div>
                      
                      {/* Show Filters only when not creating manually */}
                      {!isCreatingManual && (
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 pt-2">
                            <div className="space-y-1">
                              <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Curriculum</label>
                              <select 
                                  value={filters.curriculum} 
                                  onChange={e => setFilters(p => ({...p, curriculum: e.target.value, subject: 'All', topic: 'All'}))}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-400 cursor-pointer"
                              >
                                  <option value="All">All Curriculums</option>
                                  {availableCurriculums.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Subject</label>
                              <select 
                                  value={filters.subject} 
                                  onChange={e => setFilters(p => ({...p, subject: e.target.value}))}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-400 cursor-pointer"
                              >
                                  <option value="All">All Subjects</option>
                                  {availableSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Exam Term</label>
                              <select 
                                  value={filters.term} 
                                  onChange={e => setFilters(p => ({...p, term: e.target.value}))}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-400 cursor-pointer"
                              >
                                  <option value="All">All Terms</option>
                                  {availableTerms.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-black uppercase text-slate-400 ml-1">{gradeLabel}</label>
                              <select 
                                  value={filters.grade} 
                                  onChange={e => setFilters(p => ({...p, grade: e.target.value}))}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-400 cursor-pointer"
                              >
                                  <option value="All">All Levels</option>
                                  {[7,8,9,10,11,12].map(g => <option key={g} value={gradeLabel + ' ' + g}>{gradeLabel} {g}</option>)}
                                  {[1,2,3,4,5,6].map(g => <option key={g} value={gradeLabel + ' ' + g}>{gradeLabel} {g}</option>)}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Topic</label>
                              <select 
                                  value={filters.topic} 
                                  onChange={e => setFilters(p => ({...p, topic: e.target.value}))}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-400 cursor-pointer"
                              >
                                  <option value="All">All Topics</option>
                                  {availableTopics.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Cognitive Level</label>
                              <select 
                                  value={filters.blooms} 
                                  onChange={e => setFilters(p => ({...p, blooms: e.target.value}))}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-blue-700 outline-none focus:border-blue-400 cursor-pointer"
                              >
                                  <option value="All">All Cognitive Levels</option>
                                  {BLOOMS_LEVELS.map(b => <option key={b} value={b}>{b}</option>)}
                              </select>
                            </div>
                        </div>
                      )}
                    </div>

                    {/* Content: Either Creator or Grid */}
                    {isCreatingManual ? (
                       <QuestionCreator 
                          onSave={handleManualSave}
                          onCancel={() => setIsCreatingManual(false)}
                          initialTopic={filters.topic}
                       />
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
                        {sortedAndFilteredQuestions.length > 0 ? (
                          <>
                            {sortedAndFilteredQuestions.map(q => (
                              <QuestionCard 
                                key={q.id} 
                                question={q} 
                                onAdd={addToShortlist} 
                                onUpdate={(id, u) => updateQuestion('bank', id, u)}
                                variant="bank"
                              />
                            ))}
                            {isReplenishing && (
                              <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-5 flex items-center justify-center min-h-[200px] animate-pulse">
                                <div className="text-center">
                                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                                    <p className="text-xs font-bold text-slate-400">Replenishing Question Bank...</p>
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="col-span-full py-16 text-center">
                            {isGenerating ? (
                              <div>
                                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                                <h3 className="text-slate-900 font-bold mb-1">Generating Questions...</h3>
                                <p className="text-slate-500 text-sm">Gemini is creating high-quality academic content.</p>
                              </div>
                            ) : (
                              <>
                                <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                </div>
                                <h3 className="text-slate-900 font-bold mb-1">No questions found</h3>
                                <p className="text-slate-500 text-sm mb-4">
                                  {filters.blooms !== 'All' ? `No ${filters.blooms} level questions match your criteria.` : 'Try adjusting your filters or search query.'}
                                </p>
                                <button onClick={handleGenerate} className="text-blue-600 font-bold text-sm hover:underline">
                                    Auto-generate questions for this filter
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {currentView === 'library' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {library.map(paper => (
                      <div key={paper.metadata.id} className="bg-white p-6 rounded-3xl border border-slate-200 hover:border-blue-400 transition-all group shadow-sm flex flex-col h-full">
                        <h3 className="font-black text-slate-900 group-hover:text-blue-600 mb-2 truncate">{paper.metadata.title}</h3>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-4">{paper.metadata.subject}</p>
                        <div className="mt-auto pt-6 border-t border-slate-50 flex gap-2">
                            <button onClick={() => loadFromLibrary(paper)} className="flex-1 bg-blue-50 text-blue-700 py-3 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-100 transition-all">Load</button>
                            <button onClick={() => deleteFromLibrary(paper.metadata.id)} className="w-12 bg-rose-50 text-rose-600 flex items-center justify-center rounded-2xl hover:bg-rose-100 transition-all">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Mobile Selected Tab Content */}
              {mobileTab === 'selected' && (
                <div className="lg:hidden pb-20">
                  <div className="flex items-center justify-between px-2 mb-4">
                     <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Selected Questions ({selectedQuestions.length})</h4>
                     {selectedQuestions.length > 0 && (
                        <button onClick={moveAllToPaper} className="text-[10px] font-bold text-white bg-blue-600 px-3 py-1.5 rounded shadow-sm hover:bg-blue-700 active:scale-95 transition-all">Add All to Paper</button>
                     )}
                  </div>
                  <div className="space-y-3">
                    {selectedQuestions.length > 0 ? (
                      selectedQuestions.map((q, idx) => (
                      <QuestionCard 
                         key={q.id} 
                         question={q} 
                         onAdd={moveToPaper}
                         onRemove={removeFromShortlist}
                         onUpdate={(id, u) => updateQuestion('selected', id, u)}
                         variant="selected"
                      />
                    ))
                    ) : (
                      <div className="text-center py-12">
                         <div className="bg-slate-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-300">
                           <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                         </div>
                         <p className="text-slate-400 text-sm font-bold">Your question basket is empty.</p>
                         <button onClick={() => { setMobileTab('editor'); }} className="mt-2 text-blue-600 text-xs font-bold uppercase hover:underline">Go to Bank</button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
            </div>

            {/* Desktop Right Column: Preview / Selected Tabs */}
            <div className={`
                ${mobileTab === 'preview' ? 'flex w-full absolute inset-0 z-20' : 'hidden'} 
                lg:flex lg:w-[640px] lg:relative lg:z-0
                bg-slate-200 flex-col shrink-0 no-print border-l border-slate-300
            `}>
               <div className="h-16 flex items-center px-6 justify-between border-b border-slate-300 bg-slate-100">
                  <div className="flex gap-4">
                     <button 
                       onClick={() => setDesktopRightTab('preview')}
                       className={`text-[10px] font-black uppercase tracking-widest transition-colors ${desktopRightTab === 'preview' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                     >
                       Preview
                     </button>
                     <button 
                       onClick={() => setDesktopRightTab('selected')}
                       className={`text-[10px] font-black uppercase tracking-widest transition-colors ${desktopRightTab === 'selected' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                     >
                       Selected ({selectedQuestions.length})
                     </button>
                  </div>
                  {desktopRightTab === 'preview' && (
                    <div className="flex bg-slate-200 p-1 rounded-xl">
                      {(['phone', 'tablet', 'desktop'] as const).map(d => (
                         <button key={d} onClick={() => setPreviewDevice(d)} className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase transition-all ${previewDevice === d ? 'bg-white text-blue-600 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>{d}</button>
                      ))}
                    </div>
                  )}
               </div>
               
               <div className="flex-1 overflow-y-auto bg-slate-200/50">
                  {desktopRightTab === 'preview' ? (
                     <div className="p-12 flex justify-center">
                        <div className={`transition-all duration-700 origin-top ${
                          previewDevice === 'phone' ? 'w-[375px] scale-[0.6]' : 
                          previewDevice === 'tablet' ? 'w-[768px] scale-[0.5]' : 
                          'w-[210mm] scale-[0.75] 2xl:scale-[0.85]'
                        }`}>
                           <ExamPreview paper={currentPaper} onEdit={handleInlineEdit} />
                        </div>
                     </div>
                  ) : (
                     <div className="p-6 space-y-4">
                        {selectedQuestions.length > 0 ? (
                           <>
                             <div className="flex justify-end mb-2">
                                <button onClick={moveAllToPaper} className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-xl transition-colors shadow-sm w-full flex items-center justify-center gap-2">
                                   Add All to Exam Paper
                                </button>
                             </div>
                             {selectedQuestions.map((q, idx) => (
                               <QuestionCard 
                                  key={q.id} 
                                  question={q} 
                                  onAdd={moveToPaper}
                                  onRemove={removeFromShortlist}
                                  onUpdate={(id, u) => updateQuestion('selected', id, u)}
                                  variant="selected"
                               />
                             ))}
                           </>
                        ) : (
                           <div className="text-center py-20 text-slate-400">
                              <div className="bg-slate-300 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-500">
                                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                              </div>
                              <p className="text-sm font-bold">Basket is empty.</p>
                              <p className="text-xs mt-1">Select questions from the bank.</p>
                           </div>
                        )}
                     </div>
                  )}
               </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
