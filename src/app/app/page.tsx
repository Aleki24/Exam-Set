'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Question, ViewState, ExamMetadata, ExamPaper, TemplateId, CustomField, MobileTab, ExamBoard, EXAM_BOARD_CONFIGS } from '@/types';
import { toast } from 'sonner';
import Sidebar from '@/components/Sidebar';
import QuestionCard from '@/components/QuestionCard';
import ExamPreview from '@/components/ExamPreview';
import MiniPreview from '@/components/MiniPreview';
import QuestionCreator from '@/components/QuestionCreator';
import MarkingSchemePreview from '@/components/MarkingSchemePreview';
import BalanceCharts from '@/components/BalanceCharts';
import AutoGenerateModal from '@/components/AutoGenerateModal';
import DashboardView from '@/components/DashboardView';
import PdfDownloader from '@/components/PdfDownloader';
import QuestionEntryModal from '@/components/QuestionEntryModal';
import DocumentUploadModal from '@/components/DocumentUploadModal';
import ClientQuestionForm from '@/components/ClientQuestionForm';
import SubPartsSelector from '@/components/SubPartsSelector';

import { TemplateEditor } from '@/exam-engine/editor/TemplateEditor';
import { generateQuestionsFromMaterial, generateQuestionsByFilter } from '@/services/aiService';
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
const STATIC_CURRICULUMS = ['CBC', 'IGCSE', 'Pearson', 'Cambridge', 'National', 'IB'];
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

  // Initialize from database (empty until fetched)
  const [questionBank, setQuestionBank] = useState<Question[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(true);

  // Modal states
  const [showQuestionEntryModal, setShowQuestionEntryModal] = useState(false);
  const [showDocumentUploadModal, setShowDocumentUploadModal] = useState(false);
  const [showClientQuestionForm, setShowClientQuestionForm] = useState(false);

  // Lookup data for filters
  const [curriculums, setCurriculums] = useState<DBCurriculum[]>([]);
  const [grades, setGrades] = useState<DBGrade[]>([]);
  const [subjects, setSubjects] = useState<DBSubject[]>([]);

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
    setSelectedQuestions([]);
    setCurrentView('builder');
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
      toast.error("AI Generation failed. Please try again.");
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

  // BANK -> SHORTLIST (SELECTED QUESTIONS TAB)
  const addToShortlist = (q: Question) => {
    if (!selectedQuestions.some(sq => sq.id === q.id) && !examQuestions.some(eq => eq.id === q.id)) {
      // Check if question has sub-parts - show selector modal
      if (q.subParts && q.subParts.length > 0) {
        setSubPartsSelectorQuestion(q);
        setShowSubPartsSelector(true);
      } else {
        setSelectedQuestions(prev => [...prev, q]);
      }
      // Do not remove from bank - keep it permanent
    }
  };

  // Handle adding question with selected sub-parts
  const handleAddWithParts = (question: Question, selectedPartIds: string[]) => {
    if (!question.subParts) return;

    // If all parts selected, add the original question
    if (selectedPartIds.length === question.subParts.length) {
      setSelectedQuestions(prev => [...prev, question]);
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

      setSelectedQuestions(prev => [...prev, modifiedQuestion]);
    }

    setShowSubPartsSelector(false);
    setSubPartsSelectorQuestion(null);
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

  const gradeLabel = (filters.curriculum === 'IGCSE' || filters.curriculum === 'Pearson' || filters.curriculum === 'Cambridge') ? 'Year' : 'Grade';

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
          <header className="px-6 py-5 flex items-center justify-between shrink-0 bg-transparent backdrop-blur-sm z-10">
            <div className="flex items-center gap-4">
              <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden text-muted-foreground hover:text-foreground">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7" /></svg>
              </button>
              <div>
                <h1 className="text-3xl font-black gradient-text tracking-tight">
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
                      <button onClick={() => setShowDocumentUploadModal(true)} className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl text-xs font-bold hover:opacity-90 transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                        Upload Document
                      </button>
                      <button onClick={() => setShowAutoGenerateModal(true)} className="px-4 py-2 bg-gradient-to-r from-primary to-purple-600 text-primary-foreground rounded-xl text-xs font-bold hover:opacity-90 transition-all shadow-lg shadow-primary/20 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                        AI Generate
                      </button>
                      <button onClick={() => setShowClientQuestionForm(true)} className="px-4 py-2 bg-primary/10 text-primary rounded-xl text-xs font-bold hover:bg-primary/20 transition-colors">
                        + Add Question
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
                              onAdd={addToShortlist}
                              onUpdate={(id, u) => updateQuestion('bank', id, u)}
                              variant="bank"
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
                                      onClick={() => addToShortlist(q)}
                                      className="inline-flex items-center justify-center p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                                      title="Add to Shortlist"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
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

        {/* RIGHT: Persistent Panel (Desktop) / Drawer (Mobile) */}
        {currentView !== 'materials' && currentView !== 'builder' && (
          <aside className={`fixed inset-y-0 right-0 w-[350px] glass-sidebar transform transition-transform duration-300 ease-in-out z-30 flex flex-col xl:translate-x-0 ${mobileTab !== 'editor' ? 'translate-x-0' : 'translate-x-full'} xl:relative xl:flex xl:w-[400px]`}>
            {/* Right Panel Header */}
            <div className="px-6 py-5 border-b border-white/20 flex items-center justify-between shrink-0 bg-transparent">
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
            <div className="flex-1 overflow-y-auto p-6 bg-transparent">
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
                          className="p-2.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors hidden md:block"
                          onPdfGenerated={handleExamSave}
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
                        {/* Open Full Editor */}
                        <button
                          onClick={() => setCurrentView('builder')}
                          className="p-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                          title="Open in Editor"
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

      {/* Manual Question Entry Modal */}
      <QuestionEntryModal
        isOpen={showQuestionEntryModal}
        onClose={() => setShowQuestionEntryModal(false)}
        onSave={(question) => {
          setQuestionBank(prev => [question, ...prev]);
          toast.success('Question added to bank!');
        }}
      />

      {/* Document Upload Modal */}
      <DocumentUploadModal
        isOpen={showDocumentUploadModal}
        onClose={() => setShowDocumentUploadModal(false)}
        onSaveQuestions={(questions) => {
          setQuestionBank(prev => [...questions, ...prev]);
          toast.success(`${questions.length} questions added to bank!`);
        }}
        curriculums={curriculums}
        grades={grades}
        subjects={subjects}
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
