
export type Difficulty = 'Easy' | 'Medium' | 'Difficult';
export type BloomsLevel = 'Knowledge' | 'Understanding' | 'Application' | 'Analysis' | 'Evaluation' | 'Creation';
export type TemplateId = 'cambridge' | 'pearson' | 'cbc' | 'modern' | 'minimalist';
export type FontFamily = 'serif' | 'sans' | 'mono';
export type LogoPlacement = 'left' | 'center' | 'right';

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
  markingScheme?: string; // Detailed answer key or rubric
  graphSvg?: string; // Optional SVG for graphs/diagrams
  bloomsLevel?: BloomsLevel; // Cognitive level
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
}

export interface ExamPaper {
  metadata: ExamMetadata;
  questions: Question[];
  updatedAt: number;
}

export type ViewState = 'materials' | 'bank' | 'builder' | 'library';
export type MobileTab = 'editor' | 'preview' | 'selected';
