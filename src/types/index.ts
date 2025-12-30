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
    type: 'Multiple Choice' | 'Structured' | 'Essay';
    options?: string[];
    markingScheme?: string;
    graphSvg?: string;
    bloomsLevel?: BloomsLevel;
    // LaTeX Support
    hasLatex?: boolean;
    // Media/Image Support
    imagePath?: string;
    imageCaption?: string;
    // Tracking for duplication
    usedInExamIds?: string[];
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
}

export interface ExamPaper {
    metadata: ExamMetadata;
    questions: Question[];
    updatedAt: number;
}

export type ViewState = 'materials' | 'bank' | 'builder' | 'library';
export type MobileTab = 'editor' | 'preview' | 'selected';
