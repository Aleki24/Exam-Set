'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Question, ViewState, ExamMetadata, ExamPaper, TemplateId, MobileTab, ExamBoard, EXAM_BOARD_CONFIGS } from '@/types';
import { toast } from 'sonner';
import Sidebar from '@/components/Sidebar';
import QuestionCard from '@/components/QuestionCard';
import ExamPreview from '@/components/ExamPreview';
import MiniPreview from '@/components/MiniPreview';
import QuestionCreator from '@/components/QuestionCreator';
import MarkingSchemePreview from '@/components/MarkingSchemePreview';
import BalanceCharts from '@/components/BalanceCharts';

import PdfDownloader from '@/components/PdfDownloader';
import QuestionEntryModal from '@/components/QuestionEntryModal';
import ClientQuestionForm from '@/components/ClientQuestionForm';
import SubPartsSelector from '@/components/SubPartsSelector';

import { TemplateEditor } from '@/exam-engine/editor/TemplateEditor';
import { getCurriculums, getGrades, getSubjects } from '@/services/questionService';
import { DBCurriculum, DBGrade, DBSubject } from '@/types';
import { createClient } from '@/utils/supabase/client';

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
  templateId: 'cbc',
  layoutConfig: {
    fontSize: 'text-base',
    fontFamily: 'sans'
  },
  logoPlacement: 'left',
  headerColor: '#0f172a',
  footerColor: '#0f172a',
  customFields: [],
  // New exam board fields
  examBoard: 'knec',
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
const STATIC_CURRICULUMS = ['CBC'];
const STATIC_SUBJECTS = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'Integrated Science', 'English', 'History', 'Geography', 'Computer Science'];
const STATIC_TERMS = ['Opener', 'Mid Term 1', 'End of Term 1', 'Mid Term 2', 'End of Term 2', 'Mid Term 3', 'End of Term 3'];
const BLOOMS_LEVELS = ['Knowledge', 'Understanding', 'Application', 'Analysis', 'Evaluation', 'Creation'];

export default function Home() {
  const [currentView, setCurrentView] = useState<ViewState>('bank');

  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [displayDate, setDisplayDate] = useState('');

  // Initialize from database (empty until fetched)
  const [questionBank, setQuestionBank] = useState<Question[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(true);

  // Modal states
  const [showQuestionEntryModal, setShowQuestionEntryModal] = useState(false);
  const [showClientQuestionForm, setShowClientQuestionForm] = useState(false);

  // Lookup data for filters
  const [curriculums, setCurriculums] = useState<DBCurriculum[]>([]);
  const [grades, setGrades] = useState<DBGrade[]>([]);
  const [subjects, setSubjects] = useState<DBSubject[]>([]);



  // FINAL EXAM STATE (The actual paper)
  const [examQuestions, setExamQuestions] = useState<Question[]>([]);

  // Manual Creation Mode State
  const [isCreatingManual, setIsCreatingManual] = useState(false);

  const [metadata, setMetadata] = useState<ExamMetadata>({ ...DEFAULT_METADATA, id: '' });
  const [library, setLibrary] = useState<ExamPaper[]>([]);

  // Advanced Filters
  const [filters, setFilters] = useState<FilterState>({
    curriculum: 'CBC',
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
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // View State for Right Sidebar (Desktop) and Mobile Tabs
  const [rightPanelTab, setRightPanelTab] = useState<'preview'>('preview');
  const [mobileTab, setMobileTab] = useState<MobileTab>('editor');



  // Dropdown States
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [showPreviewActions, setShowPreviewActions] = useState(false);
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);
  const [previewZoomed, setPreviewZoomed] = useState(false);



  // Sub-parts selector modal state
  const [showSubPartsSelector, setShowSubPartsSelector] = useState(false);
  const [subPartsSelectorQuestion, setSubPartsSelectorQuestion] = useState<Question | null>(null);

  // User auth state
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);

  // Computed user display values
  const displayName = userName || userEmail?.split('@')[0] || 'User';
  const userInitials = displayName
    .split(' ')
    .slice(0, 2)
    .map(n => n[0]?.toUpperCase())
    .join('');

  // Exam Engine Modal


  // Fetch lookup data
  const loadLookupData = useCallback(async () => {
    try {
      const [currData, gradeData, subData] = await Promise.all([
        getCurriculums(),
        getGrades(),
        getSubjects()
      ]);
      setCurriculums(currData);
      setGrades(gradeData);
      setSubjects(subData);
    } catch (error) {
      console.error('Failed to load lookup data:', error);
    }
  }, []);

  // Fetch questions from database with server-side filtering
  const fetchQuestions = useCallback(async () => {
    setIsLoadingQuestions(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '100'); // Fetch up to 100 matching questions

      if (filters.curriculum && filters.curriculum !== 'All') {
        const c = curriculums.find(c => c.name === filters.curriculum);
        if (c) params.set('curriculum_id', c.id);
      }

      if (filters.subject && filters.subject !== 'All') {
        const s = subjects.find(sub => sub.name === filters.subject);
        if (s) params.set('subject_id', s.id);
      }

      if (filters.grade && filters.grade !== 'All') {
        const g = grades.find(gr => gr.name === filters.grade);
        if (g) params.set('grade_id', g.id);
      }

      if (filters.topic && filters.topic !== 'All') params.set('topic', filters.topic);
      if (filters.term && filters.term !== 'All') params.set('term', filters.term);
      if (filters.blooms && filters.blooms !== 'All') params.set('blooms_level', filters.blooms);

      if (searchQuery) params.set('search', searchQuery);

      const response = await fetch(`/api/questions?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setQuestionBank(data.questions || []);
      }
    } catch (error) {
      console.error('Failed to load questions:', error);
    } finally {
      setIsLoadingQuestions(false);
    }
  }, [filters, searchQuery, curriculums, grades, subjects]);

  // Initial Data Load
  useEffect(() => {
    loadLookupData();
  }, [loadLookupData]);

  // Fetch questions when filters or lookups change
  useEffect(() => {
    const timer = setTimeout(() => {
      // Only fetch if we have lookups ready (to map IDs), UNLESS it's the very first load and we accept potentially unmapped filters?
      // Actually, if lookups aren't ready, we can't map 'CBC' to an ID, so the API might ignore it or we send nothing.
      // Better to wait for lookups.
      if (curriculums.length > 0) {
        fetchQuestions();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [fetchQuestions, curriculums.length]);

  // User & LocalStorage Init
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserEmail(user.email || null);
          setUserName(user.user_metadata?.full_name || user.user_metadata?.name || null);
          setUserAvatar(user.user_metadata?.avatar_url || null);
        }
      } catch (error) {
        console.error('Failed to fetch user:', error);
      }
    };
    fetchUser();

    setDisplayDate(new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }));
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

  // Save new question from ClientQuestionForm
  const handleSaveNewQuestion = async (formData: any) => {
    const payload = {
      ...formData,
      options: formData.type === 'Multiple Choice' ? formData.options?.filter((o: string) => o.trim()) : [],
      matching_pairs: formData.type === 'Matching' ? formData.matching_pairs?.filter((p: any) => p.left.trim() && p.right.trim()) : [],
    };

    const res = await fetch('/api/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error('Failed to save question');
    }

    // Refresh question bank
    const response = await fetch('/api/questions?limit=100');
    if (response.ok) {
      const data = await response.json();
      setQuestionBank(data.questions || []);
    }

    toast.success('Question created successfully!');
  };

  const saveToLibrary = () => {
    const paper: ExamPaper = {
      metadata: { ...metadata, totalMarks: totalMarks },
      questions: examQuestions,
      updatedAt: Date.now()
    };
    const updatedLibrary = [paper, ...library.filter(p => p.metadata.id !== metadata.id)];
    setLibrary(updatedLibrary);
    localStorage.setItem('exam_genius_library', JSON.stringify(updatedLibrary));
    toast.success("Exam successfully saved to library!");
  };



  const loadFromLibrary = (paper: ExamPaper) => {
    setMetadata(paper.metadata);
    setExamQuestions(paper.questions);
    setCurrentView('bank');
    toast.success("Exam loaded");
  };

  const deleteFromLibrary = (id: string) => {
    toast("Are you sure you want to delete this exam paper?", {
      action: {
        label: "Delete",
        onClick: () => {
          const updated = library.filter(p => p.metadata.id !== id);
          setLibrary(updated);
          localStorage.setItem('exam_genius_library', JSON.stringify(updated));
          toast.success("Exam paper deleted");
        },
      },
      cancel: {
        label: "Cancel",
        onClick: () => { },
      },
    });
  };



  const downloadPDF = async (type: 'paper' | 'answers') => {
    setIsGeneratingPDF(true);
    try {
      const elementId = type === 'paper' ? 'exam-paper-content' : 'marking-scheme-content';
      const element = document.getElementById(elementId);

      if (!element) {
        toast.error("Content not found. Please ensure you have added questions.");
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
      toast.error(`Server-side generation failed: ${err.message}. \n\nFalling back to native print.`);
      window.print();
    } finally {
      setIsGeneratingPDF(false);
      setShowDownloadMenu(false);
    }
  };

  // BANK -> EXAM (DIRECT ADD)
  const addToExam = (q: Question) => {
    if (!examQuestions.some(eq => eq.id === q.id)) {
      // Check if question has sub-parts - show selector modal
      if (q.subParts && q.subParts.length > 0) {
        setSubPartsSelectorQuestion(q);
        setShowSubPartsSelector(true);
      } else {
        setExamQuestions(prev => [...prev, q]);
        toast.success("Added to exam");
      }
    }
  };

  // Handle adding question with selected sub-parts
  const handleAddWithParts = (question: Question, selectedPartIds: string[]) => {
    if (!question.subParts) return;

    // If all parts selected, add the original question
    if (selectedPartIds.length === question.subParts.length) {
      setExamQuestions(prev => [...prev, question]);
    } else {
      // Create a modified question with only selected parts
      const selectedParts = question.subParts.filter(p => selectedPartIds.includes(p.id));
      const newMarks = selectedParts.reduce((sum, p) => sum + p.marks, 0);

      const modifiedQuestion: Question = {
        ...question,
        id: `${question.id}-partial-${Date.now()}`, // New ID for partial question
        subParts: selectedParts,
        marks: newMarks,
      };

      setExamQuestions(prev => [...prev, modifiedQuestion]);
    }

    setShowSubPartsSelector(false);
    setSubPartsSelectorQuestion(null);
    toast.success("Added to exam");
  };

  const handleManualSave = (q: Question) => {
    setExamQuestions(prev => [q, ...prev]);
    setIsCreatingManual(false);
    toast.success("Question created and added to exam");
  };



  // REMOVE FROM EXAM
  const removeFromExam = (id: string) => {
    setExamQuestions(prev => prev.filter(q => q.id !== id));
  };

  const updateQuestion = (source: 'bank' | 'selected' | 'exam', id: string, updates: Partial<Question>) => {
    if (source === 'bank') setQuestionBank(prev => prev.map(q => q.id === id ? { ...q, ...updates } : q));
    if (source === 'exam') setExamQuestions(prev => prev.map(q => q.id === id ? { ...q, ...updates } : q));
  };

  const handleInlineEdit = (type: 'metadata' | 'question', id: string, key: string, value: string) => {
    if (type === 'metadata') {
      setMetadata(prev => ({ ...prev, [key as keyof ExamMetadata]: value }));
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

  // Client-side sorting on the returned dataset
  const sortedAndFilteredQuestions = useMemo(() => {
    // filtering is now handled server-side
    let result = questionBank;

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

  const gradeLabel = 'Grade';

  const currentPaper: ExamPaper = { metadata: { ...metadata, totalMarks }, questions: examQuestions, updatedAt: 0 };

  const handleExamSave = async (pdfBlob: Blob) => {
    try {
      const formData = new FormData();
      formData.append('pdf', pdfBlob, 'exam.pdf');

      const examData = {
        title: metadata.title,
        subject: metadata.subject,
        code: metadata.code,
        term: filters.term !== 'All' ? filters.term : undefined, // Try to use filter term or undefined
        total_marks: totalMarks,
        time_limit: metadata.timeLimit,
        institution: metadata.institution,
        exam_board: metadata.examBoard,
        question_ids: examQuestions.map(q => q.id),
      };

      formData.append('examData', JSON.stringify(examData));

      const response = await fetch('/api/exams', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to save exam');
      }

      const result = await response.json();
      console.log('Exam saved successfully:', result);

      // Optionally notify user or refresh dashboard list if needed
      // For now, we just log it as the user will see it in "Recent Exams" on next load
    } catch (error) {
      console.error('Error saving exam:', error);
    }
  };

  return (
    <>
      <div id="print-area" style={{ position: 'fixed', left: '-10000px', top: 0, width: '210mm', zIndex: -50 }}>
        <ExamPreview paper={currentPaper} />
      </div>
      <div id="marking-scheme-print-area" style={{ position: 'fixed', left: '-10000px', top: 0, width: '210mm', zIndex: -50 }}>
        <MarkingSchemePreview paper={currentPaper} />
      </div>



      {/* 3-COLUMN DASHBOARD LAYOUT */}
      <div className="flex h-screen bg-transparent font-sans overflow-hidden">

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
          <header className="px-8 py-6 flex items-center justify-between shrink-0 bg-white/40 backdrop-blur-xl border-b border-white/20 z-20 sticky top-0 shadow-sm transition-all">
            <div className="flex items-center gap-4">
              <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden text-muted-foreground hover:text-foreground">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7" /></svg>
              </button>
              <div>
                <h1 className="text-3xl font-black gradient-text tracking-tight">
                  {currentView === 'bank' && 'Question Bank'}
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
                  <p className="text-xs font-bold text-foreground">{displayName}</p>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{userEmail ? 'User' : ''}</p>
                </div>
                <div className="w-9 h-9 rounded-full bg-primary border border-border overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all flex items-center justify-center text-primary-foreground text-xs font-bold">
                  {userAvatar ? <img src={userAvatar} alt="User" className="w-full h-full object-cover" /> : userInitials}
                </div>
              </div>
            </div>
          </header>

          {/* Scrollable Main Area */}
          <div className="flex-1 overflow-y-auto px-6 pb-20 scroll-smooth">




            {/* View: Question Bank */}
            {
              currentView === 'bank' && (
                <div className="space-y-8">
                  {/* Filters Bar */}
                  <div className="glass-card p-3 flex flex-wrap gap-2 items-center sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    <select className="bg-transparent text-xs font-bold text-muted-foreground px-3 py-2 outline-none cursor-pointer hover:text-primary" value={filters.curriculum} onChange={e => setFilters(p => ({ ...p, curriculum: e.target.value }))}>
                      <option value="All">All Curriculums</option>
                      {availableCurriculums.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <div className="h-4 w-px bg-border"></div>
                    <select className="bg-transparent text-xs font-bold text-muted-foreground px-3 py-2 outline-none cursor-pointer hover:text-primary" value={filters.subject} onChange={e => setFilters(p => ({ ...p, subject: e.target.value }))}>
                      <option value="All">All Subjects</option>
                      {availableSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <div className="h-4 w-px bg-border"></div>
                    <select className="bg-transparent text-xs font-bold text-muted-foreground px-3 py-2 outline-none cursor-pointer hover:text-primary" value={filters.grade} onChange={e => setFilters(p => ({ ...p, grade: e.target.value }))}>
                      <option value="All">All Grades</option>
                      {[7, 8, 9, 10, 11, 12].map(g => <option key={g} value={'Grade ' + g}>Grade {g}</option>)}
                    </select>

                    {/* View Toggle */}
                    <div className="h-4 w-px bg-border mx-2"></div>
                    <div className="flex bg-muted/50 rounded-lg p-1">
                      <button
                        onClick={() => setViewMode('grid')}
                        className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-gray-700 shadow-sm text-primary' : 'text-muted-foreground hover:text-primary'}`}
                        title="Grid View"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                      </button>
                      <button
                        onClick={() => setViewMode('list')}
                        className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white dark:bg-gray-700 shadow-sm text-primary' : 'text-muted-foreground hover:text-primary'}`}
                        title="List View"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
                      </button>
                    </div>

                    <div className="ml-auto flex items-center gap-2">
                      {/* Actions Buttons */}
                      <button onClick={() => setShowClientQuestionForm(true)} className="px-4 py-2 bg-gradient-to-r from-primary to-purple-600 text-primary-foreground rounded-xl text-xs font-bold hover:opacity-90 transition-all shadow-lg shadow-primary/20 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                        Add Question
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
                    <>
                      {viewMode === 'grid' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-6">
                          {sortedAndFilteredQuestions.map(q => (
                            <QuestionCard
                              key={q.id}
                              question={q}
                              onAdd={addToExam}
                              onUpdate={(id, u) => updateQuestion('bank', id, u)}
                              variant="bank"
                              addedToExam={examQuestions.some(eq => eq.id === q.id)}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                          <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 font-medium border-b border-gray-200 dark:border-gray-700">
                              <tr>
                                <th className="px-6 py-4">Question</th>
                                <th className="px-6 py-4">Type</th>
                                <th className="px-6 py-4">Topic</th>
                                <th className="px-6 py-4">Difficulty</th>
                                <th className="px-6 py-4">Marks</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                              {sortedAndFilteredQuestions.map(q => (
                                <tr key={q.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                  <td className="px-6 py-4 max-w-lg">
                                    <div
                                      className="line-clamp-2 prose prose-sm dark:prose-invert max-w-none text-gray-900 dark:text-white"
                                      dangerouslySetInnerHTML={{ __html: q.text }}
                                    />
                                    <div className="text-xs text-muted-foreground mt-1 flex gap-2">
                                      {q.curriculum && <span>{q.curriculum}</span>}
                                      {q.grade && <span>• {q.grade}</span>}
                                      {q.subject && <span>• {q.subject}</span>}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 text-gray-700 dark:text-gray-300">{q.type}</td>
                                  <td className="px-6 py-4 text-gray-700 dark:text-gray-300">{q.topic}</td>
                                  <td className="px-6 py-4">
                                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${q.difficulty === 'Easy' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                      q.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                        'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                      }`}>
                                      {q.difficulty}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 font-medium">{q.marks}</td>
                                  <td className="px-6 py-4 text-right">
                                    <button
                                      onClick={() => addToExam(q)}
                                      disabled={examQuestions.some(eq => eq.id === q.id)}
                                      className={`inline-flex items-center justify-center p-2 rounded-lg transition-colors ${examQuestions.some(eq => eq.id === q.id) ? 'bg-green-500/10 text-green-600 cursor-default' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}
                                      title={examQuestions.some(eq => eq.id === q.id) ? "Added to exam" : "Add to exam"}
                                    >
                                      {examQuestions.some(eq => eq.id === q.id) ? (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                                      ) : (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                                      )}
                                    </button>
                                  </td>
                                </tr>
                              ))}
                              {sortedAndFilteredQuestions.length === 0 && (
                                <tr>
                                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                                    No questions found matching your filters.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            }

            {/* View: Builder (Template Editor) */}
            {
              currentView === 'builder' ? (
                <div className="h-full w-full">
                  <TemplateEditor
                    initialData={{
                      cover: {
                        examTitle: metadata.title,
                        subject: metadata.subject,
                        level: metadata.grade || 'Grade 10', // Or map from custom
                        duration: metadata.timeLimit,
                        totalMarks: metadata.totalMarks,
                        instructions: metadata.instructions ? metadata.instructions.split('\n') : [],
                        schoolName: metadata.institution
                      },
                      questions: examQuestions.map((q: any, i: number) => ({
                        id: q.id,
                        number: i + 1,
                        text: q.text,
                        marks: q.marks,
                        type: q.type || 'Structured',
                        options: q.options,
                        image: q.imagePath,
                        customSpacing: q.customSpacing,
                        // Map subParts to subQuestions for rendering
                        subQuestions: q.subParts?.map((part: any, partIndex: number) => ({
                          number: part.label,
                          text: part.text,
                          marks: part.marks,
                          type: 'Structured',
                        })),
                      }))
                    }}
                    onUpdate={(data) => {
                      // Sync back to metadata
                      setMetadata(prev => ({
                        ...prev,
                        title: data.cover.examTitle,
                        subject: data.cover.subject,
                        timeLimit: data.cover.duration,
                        institution: data.cover.schoolName,
                        instructions: data.cover.instructions.join('\n')
                      }));
                      // Sync back questions
                      // Note: TemplateEditor handles reordering, so we just trust the new order
                      setExamQuestions(data.questions.map((q: any) => {
                        // Find original to keep extra fields
                        const original = examQuestions.find((eq: any) => eq.id === q.id);
                        return {
                          ...original,
                          // Updates
                          text: q.text,
                          marks: q.marks,
                          type: q.type,
                          options: q.options,
                          imagePath: q.image,
                          customSpacing: q.customSpacing,
                          // ensure ID is kept
                          id: q.id || original?.id || `q-fallback`
                        } as Question;
                      }));
                    }}
                  />
                </div>
              ) : null
            }

            {
              currentView === 'library' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {library.map(paper => (
                    <div key={paper.metadata.id} className="glass-card p-6 hover:shadow-xl transition-all flex flex-col h-64 hover:scale-[1.02] duration-300">
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

        {currentView !== 'builder' && (
          <aside className={`fixed inset-y-0 right-0 w-[350px] glass-sidebar transform transition-transform duration-300 ease-in-out z-30 flex flex-col xl:translate-x-0 ${mobileTab !== 'editor' ? 'translate-x-0' : 'translate-x-full'} xl:relative xl:flex xl:w-[400px]`}>
            {/* Right Panel Header */}
            <div className="px-6 py-5 border-b border-white/20 flex items-center justify-between shrink-0 bg-transparent">
              <div className="flex gap-1 bg-secondary p-1 rounded-xl">

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
            <div className="flex-1 overflow-y-auto p-6 bg-transparent">


              {
                rightPanelTab === 'preview' && (
                  <div className="space-y-4">
                    {/* Header with Marks + Actions */}
                    <div className="bg-card p-4 rounded-xl border border-border shadow-sm flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Total Marks</p>
                        <p className="text-2xl font-black text-foreground">{totalMarks}</p>
                      </div>
                      <div className="relative">
                        <button
                          onClick={() => setShowPreviewActions(!showPreviewActions)}
                          className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:opacity-90 transition-all shadow-md shadow-primary/20"
                        >
                          Actions
                          <svg className={`w-4 h-4 transition-transform ${showPreviewActions ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                        </button>

                        {showPreviewActions && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setShowPreviewActions(false)}></div>
                            <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border rounded-xl shadow-xl z-20 overflow-hidden py-1 animate-in fade-in zoom-in-95 duration-200">
                              {/* Download PDF */}
                              <PdfDownloader
                                elementId="exam-paper-content"
                                filename={`${metadata.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`}
                                className="w-full text-left px-4 py-2.5 text-xs font-medium text-foreground hover:bg-accent transition-colors flex items-center gap-2"
                                onPdfGenerated={handleExamSave}
                              >
                                <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                Download PDF
                              </PdfDownloader>

                              {/* Print */}
                              <button
                                onClick={() => { window.print(); setShowPreviewActions(false); }}
                                className="w-full text-left px-4 py-2.5 text-xs font-medium text-foreground hover:bg-accent transition-colors flex items-center gap-2"
                              >
                                <svg className="w-4 h-4 text-secondary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                                Print Paper
                              </button>

                              <div className="h-px bg-border my-1"></div>

                              {/* Open Editor */}
                              <button
                                onClick={() => { setCurrentView('builder'); setShowPreviewActions(false); }}
                                className="w-full text-left px-4 py-2.5 text-xs font-medium text-foreground hover:bg-accent transition-colors flex items-center gap-2"
                              >
                                <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                Open Editor
                              </button>

                              {/* Save to Library */}
                              <button
                                onClick={() => { saveToLibrary(); setShowPreviewActions(false); }}
                                className="w-full text-left px-4 py-2.5 text-xs font-medium text-foreground hover:bg-accent transition-colors flex items-center gap-2"
                              >
                                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                                Save to Library
                              </button>
                            </div>
                          </>
                        )}
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
                        <MiniPreview paper={currentPaper} />
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



      {/* Manual Question Entry Modal */}
      <QuestionEntryModal
        isOpen={showQuestionEntryModal}
        onClose={() => setShowQuestionEntryModal(false)}
        onSave={(question) => {
          setQuestionBank(prev => [question, ...prev]);
          toast.success('Question added to bank!');
        }}
      />


      {/* Client Question Form (Admin-style) */}
      <ClientQuestionForm
        isOpen={showClientQuestionForm}
        onClose={() => setShowClientQuestionForm(false)}
        onSave={handleSaveNewQuestion}
        curriculums={curriculums}
        subjects={subjects}
      />

      {/* Sub-parts Selector Modal */}
      {subPartsSelectorQuestion && (
        <SubPartsSelector
          isOpen={showSubPartsSelector}
          question={subPartsSelectorQuestion}
          onClose={() => {
            setShowSubPartsSelector(false);
            setSubPartsSelectorQuestion(null);
          }}
          onAddWithParts={handleAddWithParts}
        />
      )}
    </>
  );
}
