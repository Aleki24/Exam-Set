'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Question, ViewState, ExamMetadata, ExamPaper, TemplateId, CustomField, MobileTab, ExamBoard, EXAM_BOARD_CONFIGS } from '@/types';
import Sidebar from '@/components/Sidebar';
import QuestionCard from '@/components/QuestionCard';
import ExamPreview from '@/components/ExamPreview';
import QuestionCreator from '@/components/QuestionCreator';
import MarkingSchemePreview from '@/components/MarkingSchemePreview';
import BalanceCharts from '@/components/BalanceCharts';
import AutoGenerateModal from '@/components/AutoGenerateModal';
import DashboardView from '@/components/DashboardView';
import PdfDownloader from '@/components/PdfDownloader';
import { generateQuestionsFromMaterial, generateQuestionsByFilter } from '@/services/aiService';
import { INITIAL_QUESTIONS } from '@/data/mockData';

declare var html2pdf: any;

const DEFAULT_METADATA: ExamMetadata = {
  id: '',
  title: 'Annual Summative Assessment',
  subject: 'General Science',
  code: 'SCI101',
  timeLimit: '2 Hours',
  totalMarks: 0,
  institution: 'Cambridge Primary Progression Test',
  instructions: '1. Answer all questions.\n2. Do not use external materials.',
  templateId: 'cambridge',
  layoutConfig: {
    fontSize: 'text-base',
    fontFamily: 'sans'
  },
  logoPlacement: 'left',
  headerColor: '#0f172a',
  footerColor: '#0f172a',
  customFields: [],
  // New exam board fields
  examBoard: 'cambridge',
  primaryColor: '#0066B3',
  accentColor: '#AC145A',
  additionalMaterials: 'Ruler'
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
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [displayDate, setDisplayDate] = useState('');

  // Initialize with Mock Data
  const [questionBank, setQuestionBank] = useState<Question[]>(INITIAL_QUESTIONS);

  // STAGING STATE (The "Selected" tab)
  const [selectedQuestions, setSelectedQuestions] = useState<Question[]>([]);

  // FINAL EXAM STATE (The actual paper)
  const [examQuestions, setExamQuestions] = useState<Question[]>([]);

  // Manual Creation Mode State
  const [isCreatingManual, setIsCreatingManual] = useState(false);

  const [metadata, setMetadata] = useState<ExamMetadata>({ ...DEFAULT_METADATA, id: '' });
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
  const [rightPanelTab, setRightPanelTab] = useState<'selected' | 'preview'>('selected');
  const [mobileTab, setMobileTab] = useState<MobileTab>('editor');

  // Replenish Loading State
  const [isReplenishing, setIsReplenishing] = useState(false);

  // Download Dropdown
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);
  const [previewZoomed, setPreviewZoomed] = useState(false);

  // Auto Generate Modal
  const [showAutoGenerateModal, setShowAutoGenerateModal] = useState(false);

  useEffect(() => {
    setDisplayDate(new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }));
    // Set the ID client-side to avoid hydration mismatch from Date.now()
    setMetadata(p => ({ ...p, id: Date.now().toString() }));

    const saved = localStorage.getItem('exam_genius_library');
    if (saved) {
      try {
        setLibrary(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse library", e);
      }
    }
    const savedInst = localStorage.getItem('exam_genius_institution');
    if (savedInst) setMetadata(p => ({ ...p, institution: savedInst }));
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
      const newQuestions = await generateQuestionsByFilter(filters, 1);
      if (newQuestions.length > 0) {
        setQuestionBank(prev => [...prev, ...newQuestions]);
      }
    } catch (e) {
      console.error("Auto-replenish failed", e);
    } finally {
      setIsReplenishing(false);
    }
  };

  const downloadPDF = async (type: 'paper' | 'answers') => {
    setIsGeneratingPDF(true);
    try {
      const elementId = type === 'paper' ? 'exam-paper-content' : 'marking-scheme-content';
      const element = document.getElementById(elementId);

      if (!element) {
        alert("Content not found. Please ensure you have added questions.");
        return;
      }

      // Collect styles from the document to ensure PDF matches view
      // We grab all style tags and linked stylesheets
      const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
        .map(node => node.outerHTML)
        .join('');

      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            ${styles}
            <style>
              body { margin: 0; padding: 0; background: white; }
              /* Force Tailwind colors for print */
              * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
              /* Layout fixes */
              .page-break-inside-avoid { page-break-inside: avoid; }
            </style>
          </head>
          <body>
            <div style="width: 210mm; margin: 0 auto;">
              ${element.innerHTML}
            </div>
          </body>
        </html>
      `;

      const response = await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: htmlContent })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.details || 'PDF generation failed on server');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${metadata.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

    } catch (err: any) {
      console.error("PDF generation failed:", err);
      // Show specific error to help debugging
      alert(`Server-side generation failed: ${err.message}. \n\nFalling back to native print.`);
      window.print();
    } finally {
      setIsGeneratingPDF(false);
      setShowDownloadMenu(false);
    }
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
      <div id="print-area" style={{ position: 'fixed', left: '-10000px', top: 0, width: '210mm', zIndex: -50 }}>
        <ExamPreview paper={currentPaper} />
      </div>
      <div id="marking-scheme-print-area" style={{ position: 'fixed', left: '-10000px', top: 0, width: '210mm', zIndex: -50 }}>
        <MarkingSchemePreview paper={currentPaper} />
      </div>

      {/* 3-COLUMN DASHBOARD LAYOUT */}
      <div className="flex h-screen bg-background font-sans overflow-hidden">

        {/* LEFT: Sidebar */}
        <Sidebar
          currentView={currentView}
          setView={setCurrentView}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          brandName={metadata.institution}
          recentExams={library}
        />

        {/* CENTER: Main Content */}
        <main className="flex-1 flex flex-col min-w-0 transition-all duration-300 relative">

          {/* Header */}
          <header className="px-6 py-5 flex items-center justify-between shrink-0 bg-background">
            <div className="flex items-center gap-4">
              <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden text-muted-foreground hover:text-foreground">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7" /></svg>
              </button>
              <div>
                <h1 className="text-2xl font-black text-foreground tracking-tight">
                  {currentView === 'materials' && 'Dashboard'}
                  {currentView === 'bank' && 'Questions'}
                  {currentView === 'builder' && 'Templates'}
                  {currentView === 'library' && 'Library'}
                </h1>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest hidden sm:block">
                  {displayDate}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Search Bar - Stylized */}
              <div className="relative hidden md:block group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Search questions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="block w-64 pl-10 pr-3 py-2.5 bg-card border border-border rounded-2xl leading-5 placeholder-muted-foreground focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary sm:text-sm transition-all shadow-sm group-hover:shadow-md"
                />
              </div>

              <button className="relative p-2.5 bg-card rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-all shadow-sm">
                <span className="absolute top-2 right-2.5 w-2 h-2 bg-destructive rounded-full border-2 border-card"></span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
              </button>

              <div className="flex items-center gap-3 pl-4 border-l border-border">
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-bold text-foreground">Haris Ahmed</p>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Admin</p>
                </div>
                <div className="w-9 h-9 rounded-full bg-secondary border border-border overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all">
                  <img src="https://ui-avatars.com/api/?name=Haris+Ahmed&background=0D8ABC&color=fff" alt="User" />
                </div>
              </div>
            </div>
          </header>

          {/* Scrollable Main Area */}
          <div className="flex-1 overflow-y-auto px-6 pb-20 scroll-smooth">

            {/* View: Materials (Dashboard) */}
            {currentView === 'materials' && (
              <DashboardView
                onNavigate={(view: ViewState) => setCurrentView(view)}
                onMagicGenerate={() => setShowAutoGenerateModal(true)}
                recentExams={library.slice(0, 5)} // Show top 5 recent exams
              />
            )}


            {/* View: Question Bank */}
            {
              currentView === 'bank' && (
                <div className="space-y-8">
                  {/* Filters Bar */}
                  <div className="bg-card p-2 rounded-2xl shadow-sm border border-border flex flex-wrap gap-2 items-center">
                    <select className="bg-transparent text-xs font-bold text-muted-foreground px-3 py-2 outline-none cursor-pointer hover:text-primary" value={filters.subject} onChange={e => setFilters(p => ({ ...p, subject: e.target.value }))}>
                      <option value="All">All Subjects</option>
                      {availableSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <div className="h-4 w-px bg-border"></div>
                    <select className="bg-transparent text-xs font-bold text-muted-foreground px-3 py-2 outline-none cursor-pointer hover:text-primary" value={filters.grade} onChange={e => setFilters(p => ({ ...p, grade: e.target.value }))}>
                      <option value="All">All Grades</option>
                      {[7, 8, 9, 10, 11, 12].map(g => <option key={g} value={'Grade ' + g}>Grade {g}</option>)}
                    </select>
                    {/* Add more filters as needed */}
                    <div className="ml-auto flex items-center gap-2">
                      <button onClick={() => setShowAutoGenerateModal(true)} className="px-4 py-2 bg-gradient-to-r from-primary to-purple-600 text-primary-foreground rounded-xl text-xs font-bold hover:opacity-90 transition-all shadow-lg shadow-primary/20 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                        Magic Generate
                      </button>
                      <button onClick={() => setIsCreatingManual(true)} className="px-4 py-2 bg-primary/10 text-primary rounded-xl text-xs font-bold hover:bg-primary/20 transition-colors">
                        + Manual Question
                      </button>
                    </div>
                  </div>

                  {isCreatingManual ? (
                    <QuestionCreator
                      onSave={handleManualSave}
                      onCancel={() => setIsCreatingManual(false)}
                      initialTopic={filters.topic}
                      grade={filters.grade !== 'All' ? filters.grade : undefined}
                      curriculum={filters.curriculum !== 'All' ? filters.curriculum : undefined}
                    />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-6">
                      {sortedAndFilteredQuestions.map(q => (
                        <QuestionCard
                          key={q.id}
                          question={q}
                          onAdd={addToShortlist}
                          onUpdate={(id, u) => updateQuestion('bank', id, u)}
                          variant="bank"
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            }

            {/* View: Builder (Metadata Config) */}
            {
              currentView === 'builder' && (
                <div className="space-y-8 max-w-5xl mx-auto">
                  {/* Exam Details & Styling */}
                  <div className="bg-card p-6 rounded-3xl border border-border shadow-sm">
                    <h3 className="text-lg font-black text-foreground mb-6 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </div>
                      Exam Configuration
                    </h3>

                    <div className="grid grid-cols-2 gap-8">
                      {/* Left Column */}
                      <div className="space-y-5">
                        {/* Exam Board Selection */}
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">Exam Board</label>
                          <input
                            list="exam-boards"
                            value={metadata.examBoard === 'custom' ? '' : metadata.examBoard}
                            onChange={e => setMetadata(p => ({ ...p, examBoard: e.target.value as any }))}
                            className="w-full p-3 bg-secondary rounded-xl text-sm font-bold border border-border focus:border-primary outline-none"
                            placeholder="Type or select board..."
                          />
                          <datalist id="exam-boards">
                            <option value="cambridge">Cambridge Assessment</option>
                            <option value="knec">KNEC (Kenya)</option>
                            <option value="pearson">Pearson Edexcel</option>
                            <option value="aqa">AQA</option>
                            <option value="ocr">OCR</option>
                            <option value="ib">International Baccalaureate</option>
                          </datalist>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">Institution / School Name</label>
                          <input value={metadata.institution} onChange={e => setMetadata(p => ({ ...p, institution: e.target.value }))} className="w-full p-3 bg-secondary rounded-xl text-sm font-bold border border-border focus:border-primary outline-none" placeholder="e.g. Greenwood High School" />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">Subject</label>
                          <input value={metadata.subject} onChange={e => setMetadata(p => ({ ...p, subject: e.target.value }))} className="w-full p-3 bg-secondary rounded-xl text-sm font-bold border border-border focus:border-primary outline-none" placeholder="e.g. Science" />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">Paper Code</label>
                          <input value={metadata.code} onChange={e => setMetadata(p => ({ ...p, code: e.target.value }))} className="w-full p-3 bg-secondary rounded-xl text-sm font-bold border border-border focus:border-primary outline-none" placeholder="e.g. Paper 2" />
                        </div>
                      </div>

                      {/* Right Column */}
                      <div className="space-y-5">
                        <div className="flex gap-4">
                          <div className="flex-1">
                            <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">Primary Color</label>
                            <div className="flex items-center gap-2 bg-secondary p-1 rounded-xl border border-border">
                              <input
                                type="color"
                                value={metadata.primaryColor}
                                onChange={e => setMetadata(p => ({ ...p, primaryColor: e.target.value }))}
                                className="w-8 h-8 rounded-lg border-none cursor-pointer bg-transparent"
                              />
                              <span className="text-xs font-mono text-muted-foreground">{metadata.primaryColor}</span>
                            </div>
                          </div>
                          <div className="flex-1">
                            <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">Accent Color</label>
                            <div className="flex items-center gap-2 bg-secondary p-1 rounded-xl border border-border">
                              <input
                                type="color"
                                value={metadata.accentColor}
                                onChange={e => setMetadata(p => ({ ...p, accentColor: e.target.value }))}
                                className="w-8 h-8 rounded-lg border-none cursor-pointer bg-transparent"
                              />
                              <span className="text-xs font-mono text-muted-foreground">{metadata.accentColor}</span>
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">Logo</label>
                          <div className="flex items-center gap-3">
                            {metadata.logo ? (
                              <div className="relative group">
                                <img src={metadata.logo} alt="Logo" className="w-12 h-12 object-contain rounded-lg border border-border bg-white" />
                                <button
                                  onClick={() => setMetadata(p => ({ ...p, logo: undefined }))}
                                  className="absolute -top-1 -right-1 bg-destructive text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]"
                                >
                                  ×
                                </button>
                              </div>
                            ) : null}
                            <label className="cursor-pointer bg-secondary hover:bg-secondary/80 text-foreground px-4 py-2 rounded-xl text-xs font-bold transition-colors border border-border">
                              Upload Logo
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onloadend = () => {
                                      setMetadata(p => ({ ...p, logo: reader.result as string }));
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                            </label>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">Title / Stage</label>
                          <input value={metadata.title} onChange={e => setMetadata(p => ({ ...p, title: e.target.value }))} className="w-full p-3 bg-secondary rounded-xl text-sm font-bold border border-border focus:border-primary outline-none" placeholder="e.g. Stage 6" />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">Time Limit</label>
                          <input value={metadata.timeLimit} onChange={e => setMetadata(p => ({ ...p, timeLimit: e.target.value }))} className="w-full p-3 bg-secondary rounded-xl text-sm font-bold border border-border focus:border-primary outline-none" placeholder="e.g. 45 minutes" />
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 pt-5 border-t border-border">
                      <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">Instructions</label>
                      <textarea value={metadata.instructions} onChange={e => setMetadata(p => ({ ...p, instructions: e.target.value }))} rows={3} className="w-full p-3 bg-secondary rounded-xl text-sm border border-border focus:border-primary outline-none resize-none" placeholder="Answer all questions..." />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-black text-foreground">Exam Questions</h3>
                    <span className="bg-secondary text-muted-foreground px-3 py-1 rounded-lg text-xs font-bold">Total: {totalMarks} Marks</span>
                  </div>

                  <div className="space-y-4 pb-20">
                    {examQuestions.map((q, idx) => (
                      <div key={q.id} className="bg-card p-6 rounded-3xl border border-border shadow-sm flex gap-4 group">
                        <span className="w-8 h-8 bg-secondary rounded-full flex items-center justify-center text-xs font-black text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">{idx + 1}</span>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground mb-2">{q.text}</p>
                          <div className="flex gap-3">
                            <span className="text-xs font-bold text-muted-foreground">{q.marks} Marks</span>
                            <span className="text-xs font-bold text-muted-foreground/30">•</span>
                            <span className="text-xs font-bold text-primary">{q.topic}</span>
                          </div>
                        </div>
                        <button onClick={() => removeFromExam(q.id)} className="text-destructive hover:text-destructive/80">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            }

            {
              currentView === 'library' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {library.map(paper => (
                    <div key={paper.metadata.id} className="bg-card p-6 rounded-[2rem] border border-border shadow-sm hover:shadow-md transition-all flex flex-col h-64">
                      <div className="flex-1">
                        <h3 className="font-bold text-lg text-foreground mb-2 line-clamp-2">{paper.metadata.title}</h3>
                        <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">{paper.metadata.subject}</p>
                      </div>
                      <div className="flex gap-2 mt-4">
                        <button onClick={() => loadFromLibrary(paper)} className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:opacity-90 transition-colors">Load</button>
                        <button onClick={() => deleteFromLibrary(paper.metadata.id)} className="px-4 py-3 bg-destructive/10 text-destructive rounded-xl hover:bg-destructive/20 transition-colors">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            }
          </div>
        </main>

        {/* RIGHT: Persistent Panel (Desktop) / Drawer (Mobile) */}
        {currentView !== 'materials' && (
          <aside className={`fixed inset-y-0 right-0 w-[350px] bg-card border-l border-border transform transition-transform duration-300 ease-in-out z-30 flex flex-col xl:translate-x-0 ${mobileTab !== 'editor' ? 'translate-x-0' : 'translate-x-full'} xl:relative xl:flex xl:w-[400px]`}>
            {/* Right Panel Header */}
            <div className="px-6 py-5 border-b border-border flex items-center justify-between shrink-0 bg-card">
              <div className="flex gap-1 bg-secondary p-1 rounded-xl">
                <button
                  onClick={() => setRightPanelTab('selected')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${rightPanelTab === 'selected' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Selection ({selectedQuestions.length})
                </button>
                <button
                  onClick={() => setRightPanelTab('preview')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${rightPanelTab === 'preview' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Preview
                </button>
              </div>

              {/* Mobile Close Button */}
              <button onClick={() => setMobileTab('editor')} className="xl:hidden p-2 text-muted-foreground hover:text-foreground">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Right Panel Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-secondary">
              {rightPanelTab === 'selected' && (
                <div className="space-y-4">
                  {selectedQuestions.length === 0 ? (
                    <div className="text-center py-10 opacity-50">
                      <div className="w-16 h-16 bg-muted rounded-full mx-auto mb-4 flex items-center justify-center text-muted-foreground">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" /></svg>
                      </div>
                      <p className="text-sm font-bold text-muted-foreground">No questions selected</p>
                      <p className="text-xs text-muted-foreground mt-1">Browse the bank and select questions</p>
                    </div>
                  ) : (
                    <>
                      {selectedQuestions.map(q => (
                        <QuestionCard
                          key={q.id}
                          question={q}
                          onRemove={removeFromShortlist}
                          onAdd={moveToPaper}
                          variant="selected"
                        />
                      ))}
                      <button onClick={moveAllToPaper} className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl shadow-lg shadow-primary/20 active:scale-95 transition-all text-xs uppercase tracking-wide">
                        Add All to Exam Paper
                      </button>
                    </>
                  )}
                </div>
              )}

              {
                rightPanelTab === 'preview' && (
                  <div className="space-y-4">
                    {/* Header with Marks + Actions */}
                    <div className="bg-card p-4 rounded-xl border border-border shadow-sm flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Total Marks</p>
                        <p className="text-2xl font-black text-foreground">{totalMarks}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Download Button - Server Side PDF */}
                        <PdfDownloader
                          elementId="exam-paper-content"
                          filename={`${metadata.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`}
                          className="p-2.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-colors hidden md:block"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        </PdfDownloader>
                        {/* Native Print Button (Reliable Fallback) */}
                        <button
                          onClick={() => window.print()}
                          className="p-2.5 bg-secondary text-foreground rounded-lg hover:bg-accent transition-colors border border-border"
                          title="Print / Save as PDF (Recommended for large files)"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                        </button>
                        {/* Fullscreen/Zoom Button */}
                        <button
                          onClick={() => setIsPreviewFullscreen(true)}
                          className="p-2.5 bg-secondary text-foreground rounded-lg hover:bg-accent transition-colors"
                          title="Fullscreen Preview"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                        </button>
                        {/* Save Button */}
                        <button
                          onClick={saveToLibrary}
                          className="p-2.5 bg-accent/20 text-foreground rounded-lg hover:bg-accent/40 transition-colors"
                          title="Save to Library"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                        </button>
                      </div>
                    </div>

                    {/* Preview Container - Click to toggle zoom */}
                    <div
                      onClick={() => setPreviewZoomed(!previewZoomed)}
                      className={`bg-secondary/50 rounded-xl border border-border overflow-auto p-4 custom-scrollbar transition-all duration-300 ${previewZoomed ? 'h-[450px] cursor-zoom-in' : 'h-[550px] cursor-zoom-out'}`}
                    >
                      <div
                        className="inline-block transition-transform duration-300"
                        style={{ transform: previewZoomed ? 'scale(0.35)' : 'scale(0.55)', transformOrigin: 'top left' }}
                      >
                        <ExamPreview paper={currentPaper} />
                      </div>
                    </div>
                  </div>
                )
              }
            </div>
          </aside>
        )}

        {/* Floating Mobile Tabs (Bottom) */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-card/90 backdrop-blur-md border border-border p-1.5 rounded-full shadow-2xl z-50 flex gap-1 xl:hidden">
          <button onClick={() => setMobileTab('editor')} className={`p-3 rounded-full transition-all ${mobileTab === 'editor' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
          </button>
          <button onClick={() => setMobileTab('selected')} className={`p-3 rounded-full transition-all ${mobileTab === 'selected' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}>
            <div className="relative">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
              {selectedQuestions.length > 0 && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-destructive rounded-full border-2 border-card"></span>}
            </div>
          </button>
          <button onClick={() => setMobileTab('preview')} className={`p-3 rounded-full transition-all ${mobileTab === 'preview' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
          </button>
        </div>

      </div>

      {/* Fullscreen Preview Modal - covers everything including sidebars */}
      {isPreviewFullscreen && (
        <div className="fixed inset-0 z-[200] bg-background flex flex-col overflow-hidden">
          {/* Modal Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-foreground">Exam Preview</h2>
              <span className="text-sm text-muted-foreground">• {totalMarks} marks</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => downloadPDF('paper')}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Download PDF
              </button>
              <button
                onClick={() => setIsPreviewFullscreen(false)}
                className="px-4 py-2 bg-secondary text-foreground rounded-lg text-sm font-medium hover:bg-accent transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                Close
              </button>
            </div>
          </div>
          {/* Modal Content - Centered and properly aligned */}
          <div className="flex-1 overflow-auto bg-muted/30">
            <div className="min-h-full flex justify-center py-8 px-4">
              <div className="bg-white shadow-2xl rounded-lg overflow-hidden">
                <ExamPreview paper={currentPaper} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Auto Generate Modal */}
      <AutoGenerateModal
        isOpen={showAutoGenerateModal}
        onClose={() => setShowAutoGenerateModal(false)}
        onGenerated={(questions) => {
          setQuestionBank(prev => [...questions, ...prev]);
          setShowAutoGenerateModal(false);
        }}
        availableTopics={availableTopics}
        availableSubjects={availableSubjects}
      />
    </>
  );
}
