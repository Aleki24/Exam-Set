export type Difficulty = 'Easy' | 'Medium' | 'Difficult';
export type BloomsLevel = 'Knowledge' | 'Understanding' | 'Application' | 'Analysis' | 'Evaluation' | 'Creation';
export type TemplateId = 'cambridge' | 'pearson' | 'cbc' | 'modern' | 'minimalist';
export type FontFamily = 'serif' | 'sans' | 'mono';
export type LogoPlacement = 'left' | 'center' | 'right';

// Exam Board Types
export type ExamBoard =
    | 'cambridge'      // Cambridge Assessment International Education (CAIE)
    | 'knec'           // Kenya National Examinations Council
    | 'pearson'        // Pearson Edexcel
    | 'aqa'            // AQA (UK)
    | 'ocr'            // OCR (UK)
    | 'ib'             // International Baccalaureate
    | 'collegeboard'   // College Board (AP)
    | 'custom';        // Custom/Generic

// Exam Board Configuration
export interface ExamBoardConfig {
    id: ExamBoard;
    name: string;
    country: string;
    primaryColor: string;
    accentColor: string;
    description: string;
}

// Pre-defined exam board configurations
export const EXAM_BOARD_CONFIGS: Record<ExamBoard, ExamBoardConfig> = {
    cambridge: {
        id: 'cambridge',
        name: 'Cambridge Assessment (CAIE)',
        country: 'International',
        primaryColor: '#0066B3',
        accentColor: '#AC145A',
        description: 'IGCSE, O Level, A Level'
    },
    knec: {
        id: 'knec',
        name: 'KNEC / CBC',
        country: 'Kenya',
        primaryColor: '#006600',
        accentColor: '#BB0000',
        description: 'KPSEA, KCPE, KCSE'
    },
    pearson: {
        id: 'pearson',
        name: 'Pearson Edexcel',
        country: 'UK / International',
        primaryColor: '#650E51',
        accentColor: '#007FA3',
        description: 'International GCSE, A Level'
    },
    aqa: {
        id: 'aqa',
        name: 'AQA',
        country: 'UK',
        primaryColor: '#461D7C',
        accentColor: '#00A2E8',
        description: 'GCSE, A Level'
    },
    ocr: {
        id: 'ocr',
        name: 'OCR',
        country: 'UK',
        primaryColor: '#1E4D2B',
        accentColor: '#FFD700',
        description: 'GCSE, A Level'
    },
    ib: {
        id: 'ib',
        name: 'International Baccalaureate',
        country: 'International',
        primaryColor: '#003DA5',
        accentColor: '#FFFFFF',
        description: 'PYP, MYP, DP, CP'
    },
    collegeboard: {
        id: 'collegeboard',
        name: 'College Board',
        country: 'USA',
        primaryColor: '#00274C',
        accentColor: '#F0AB00',
        description: 'SAT, AP Exams'
    },
    custom: {
        id: 'custom',
        name: 'Custom',
        country: 'Custom',
        primaryColor: '#0f172a',
        accentColor: '#3b82f6',
        description: 'Create your own style'
    }
};

export interface CustomField {
    id: string;
    label: string;
    value: string;
}

// Question sub-part interface for questions with multiple parts (a, b, c, etc.)
export interface QuestionSubPart {
    id: string;
    label: string;       // "a", "b", "c", etc.
    text: string;        // The sub-part question text (can be HTML/rich text)
    marks: number;       // Marks for this specific part
}

export type QuestionType =
    | 'Multiple Choice'
    | 'True/False'
    | 'Matching'
    | 'Fill-in-the-blank'
    | 'Numeric'
    | 'Structured'
    | 'Short Answer'
    | 'Essay'
    | 'Practical'
    | 'Oral';

export interface Question {
    id: string;
    text: string;
    marks: number;
    difficulty: Difficulty;
    topic: string;
    subtopic?: string;
    subject?: string;
    curriculum?: string;
    term?: string;
    grade?: string;
    answerSchema?: string;
    type: QuestionType;
    options?: string[];
    // For Matching questions
    matchingPairs?: { left: string; right: string }[];
    // For Numeric / Short Answer
    unit?: string;
    expectedLength?: 'lines' | 'words' | 'pages';

    markingScheme?: string;
    graphSvg?: string;
    bloomsLevel?: BloomsLevel;
    // LaTeX Support
    hasLatex?: boolean;
    // Media/Image Support
    imagePath?: string;
    imageCaption?: string;
    // Layout & Spacing
    customSpacing?: string;
    // Tracking for duplication
    usedInExamIds?: string[];
    // Sub-parts for questions with multiple labeled parts (a, b, c, etc.)
    subParts?: QuestionSubPart[];
}

export interface LayoutConfig {
    fontSize: 'text-sm' | 'text-base' | 'text-lg';
    fontFamily: FontFamily;
}

export interface ExamMetadata {
    id: string;
    title: string;
    subject: string;
    code: string;
    timeLimit: string;
    totalMarks: number;
    institution: string;
    instructions: string;
    templateId: TemplateId;
    layoutConfig: LayoutConfig;
    logo?: string;
    logoPlacement: LogoPlacement;
    headerColor?: string;
    footerColor?: string;
    customFields: CustomField[];
    // Exam Board Settings
    examBoard: ExamBoard;
    primaryColor: string;
    accentColor: string;
    // Additional materials (e.g., "Ruler, Calculator")
    additionalMaterials?: string;
    // Version tracking for duplication check
    versionLabel?: string;
    previousVersionId?: string;
    grade?: string;
}

export interface ExamPaper {
    metadata: ExamMetadata;
    questions: Question[];
    updatedAt: number;
}

export type ViewState = 'materials' | 'bank' | 'builder' | 'library';
export type MobileTab = 'editor' | 'preview' | 'selected';

// ============================================================================
// DATABASE TYPES
// ============================================================================

// Term filter type for exams and questions
export type ExamTerm =
    | 'opener'
    | 'mid_term_1'
    | 'end_term_1'
    | 'mid_term_2'
    | 'end_term_2'
    | 'mid_term_3'
    | 'end_term_3';

// Display names for terms
export const EXAM_TERM_LABELS: Record<ExamTerm, string> = {
    opener: 'Opener',
    mid_term_1: 'Mid Term 1',
    end_term_1: 'End of Term 1',
    mid_term_2: 'Mid Term 2',
    end_term_2: 'End of Term 2',
    mid_term_3: 'Mid Term 3',
    end_term_3: 'End of Term 3'
};

// Curriculum from database
export interface DBCurriculum {
    id: string;
    name: string;
    description?: string;
    country?: string;
    created_at: string;
}

// Grade from database
export interface DBGrade {
    id: string;
    curriculum_id: string;
    name: string;
    level_order: number;
    created_at: string;
}

// Subject from database
export interface DBSubject {
    id: string;
    name: string;
    description?: string;
    created_at: string;
}

// Database question type (extends existing Question with DB fields)
export interface DBQuestion extends Question {
    curriculum_id?: string;
    grade_id?: string;
    subject_id?: string;
    is_ai_generated?: boolean;
    ai_quality_score?: number;
    usage_count?: number;
    created_at?: string;
    updated_at?: string;
}

// Stored exam type (for dashboard/search)
export interface StoredExam {
    id: string;
    title: string;
    subject: string;
    code?: string;
    curriculum_id?: string;
    grade_id?: string;
    subject_id?: string;
    term?: ExamTerm;
    total_marks: number;
    time_limit?: string;
    institution?: string;
    exam_board?: string;
    pdf_storage_key?: string;
    pdf_url?: string;
    thumbnail_url?: string;
    question_ids: string[];
    question_count: number;
    is_public: boolean;
    created_by?: string;
    created_at: string;
    updated_at: string;
    // Joined data for display
    curriculum_name?: string;
    grade_name?: string;
    subject_name?: string;
}

// Filters for searching questions
export interface QuestionFilters {
    curriculum_id?: string;
    grade_id?: string;
    subject_id?: string;
    term?: ExamTerm;
    topic?: string;
    difficulty?: Difficulty;
    type?: QuestionType;
    blooms_level?: BloomsLevel;
    search?: string;
    limit?: number;
    offset?: number;
}

// Filters for searching exams
export interface ExamFilters {
    curriculum_id?: string;
    grade_id?: string;
    subject_id?: string;
    term?: ExamTerm;
    search?: string;
    limit?: number;
    offset?: number;
}
