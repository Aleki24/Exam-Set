export type Difficulty = 'Easy' | 'Medium' | 'Difficult';
export type BloomsLevel = 'Knowledge' | 'Understanding' | 'Application' | 'Analysis' | 'Evaluation' | 'Creation';
export type TemplateId = 'cbc' | 'modern' | 'minimalist' | 'pearson';
export type FontFamily = 'serif' | 'sans' | 'mono';
export type LogoPlacement = 'left' | 'center' | 'right';

// Exam Board Types
export type ExamBoard = 'knec' | 'custom';

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
    knec: {
        id: 'knec',
        name: 'KNEC / CBC',
        country: 'Kenya',
        primaryColor: '#006600',
        accentColor: '#BB0000',
        description: 'KPSEA, KCPE, KCSE'
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
    // Answer space configuration
    answerLines?: number;
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

export type ViewState = 'bank' | 'builder' | 'library';
export type MobileTab = 'editor' | 'preview';

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

// ============================================================================
// SUBJECT TOPICS (STRANDS) AND PAPER TEMPLATES
// ============================================================================

// Subject topic/strand for categorizing questions
export interface SubjectTopic {
    id: string;
    subject_id: string;
    topic_number: number;
    name: string;
    description?: string;
    parent_topic_id?: string;
    created_at?: string;
    // Joined data
    subject_name?: string;
}

// Question section types for paper templates
export type QuestionSectionType =
    | 'map_analysis'
    | 'spatial_awareness'
    | 'visual_identification'
    | 'conceptual_knowledge'
    | 'skills_drawing'
    | 'true_false'
    | 'matching'
    | 'multiple_choice'
    | 'fill_blanks'
    | 'structured'
    | 'essay'
    | 'practical'
    | 'calculation'
    | 'word_puzzle'
    | 'diagram_labeling'
    | 'comprehension'
    | 'general';

// Display labels for section types
export const SECTION_TYPE_LABELS: Record<QuestionSectionType, string> = {
    map_analysis: 'Map Analysis',
    spatial_awareness: 'Spatial Awareness',
    visual_identification: 'Visual Identification',
    conceptual_knowledge: 'Conceptual Knowledge',
    skills_drawing: 'Skills & Drawing',
    true_false: 'True/False',
    matching: 'Matching',
    multiple_choice: 'Multiple Choice',
    fill_blanks: 'Fill in the Blanks',
    structured: 'Structured',
    essay: 'Essay',
    practical: 'Practical',
    calculation: 'Calculation',
    word_puzzle: 'Word Puzzle',
    diagram_labeling: 'Diagram Labeling',
    comprehension: 'Comprehension',
    general: 'General'
};

// Paper template section configuration
export interface TemplateSectionConfig {
    section_label: string;           // "A", "B", "C", etc.
    name: string;                    // "Map Analysis"
    section_type: QuestionSectionType;
    question_count: number;
    marks_per_question: number;
    topics?: number[];               // Topic numbers to draw from (optional)
    instructions?: string;           // Section-specific instructions
}

// Paper template for generating exams
export interface PaperTemplate {
    id: string;
    name: string;
    description?: string;
    subject_id?: string;
    grade_id?: string;
    total_marks: number;
    time_limit?: string;
    sections: TemplateSectionConfig[];
    shuffle_within_sections: boolean;
    shuffle_sections: boolean;
    is_default: boolean;
    created_by?: string;
    created_at?: string;
    updated_at?: string;
    // Joined data
    subject_name?: string;
    grade_name?: string;
}

// Image bank entry for visual content
export type ImageType = 'map' | 'diagram' | 'photo' | 'puzzle' | 'chart' | 'illustration' | 'general';

export interface ImageBankEntry {
    id: string;
    name: string;
    description?: string;
    subject_id?: string;
    topic_id?: string;
    storage_key: string;
    image_url?: string;
    thumbnail_url?: string;
    image_type: ImageType;
    tags: string[];
    width?: number;
    height?: number;
    file_size?: number;
    mime_type?: string;
    created_by?: string;
    created_at?: string;
    // Joined data
    subject_name?: string;
    topic_name?: string;
}

// Extended question filters with topic support
export interface ExtendedQuestionFilters extends QuestionFilters {
    topic_id?: string;
    section_type?: QuestionSectionType;
    requires_image?: boolean;
}
