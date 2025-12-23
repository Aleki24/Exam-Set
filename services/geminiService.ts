
import { GoogleGenAI, Type } from "@google/genai";
import { Question } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const BLOOMS_LEVELS = ["Knowledge", "Understanding", "Application", "Analysis", "Evaluation", "Creation"];

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    suggestedTitle: { type: Type.STRING },
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          marks: { type: Type.NUMBER },
          difficulty: { type: Type.STRING, enum: ["Easy", "Medium", "Difficult"] },
          topic: { type: Type.STRING },
          type: { type: Type.STRING, enum: ["Multiple Choice", "Structured", "Essay"] },
          options: { type: Type.ARRAY, items: { type: Type.STRING } },
          markingScheme: { type: Type.STRING, description: "Detailed answer key. For MCQs, state the correct option. For essays, list bullet points for marks." },
          graphSvg: { type: Type.STRING, description: "Optional SVG string if a graph or diagram is needed." },
          bloomsLevel: { type: Type.STRING, enum: BLOOMS_LEVELS, description: "Bloom's Taxonomy Cognitive Level" }
        },
        required: ["text", "marks", "difficulty", "topic", "type", "markingScheme", "bloomsLevel"]
      }
    }
  },
  required: ["suggestedTitle", "questions"]
};

// New Schema for single question improvement
const SUGGESTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    refinedText: { type: Type.STRING, description: "A more academic and professional version of the user's input" },
    options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "4 plausible options including the correct answer if Multiple Choice" },
    suggestedMarks: { type: Type.NUMBER },
    suggestedTopic: { type: Type.STRING },
    markingScheme: { type: Type.STRING, description: "Suggested answer key or rubric." },
    graphSvg: { type: Type.STRING, description: "Optional SVG string if the context implies a graph." },
    bloomsLevel: { type: Type.STRING, enum: BLOOMS_LEVELS }
  },
  required: ["refinedText", "suggestedMarks"]
};

export async function generateQuestionsFromMaterial(
  material: string, 
  images: { data: string; mimeType: string }[] = [],
  count: number = 20
): Promise<{ questions: Question[]; suggestedTitle: string }> {
  
  const parts: any[] = [
    { text: `Analyze the following curriculum materials and generate ${count} high-quality academic exam questions. 
    Also, suggest a professional, concise title for this exam.
    Ensure questions vary in difficulty, type, and Bloom's Taxonomy levels (Knowledge to Creation).
    For each question, provide a detailed 'markingScheme' that explains the answer or rubric.
    Classify each question with a 'bloomsLevel'.
    If a question requires a visual diagram or graph (e.g. geometry, plotting), provide a simple SVG string in 'graphSvg'.` }
  ];

  if (material) parts.push({ text: `--- TEXT MATERIAL ---\n${material}` });
  
  images.forEach(img => {
    parts.push({
      inlineData: {
        data: img.data.split(',')[1],
        mimeType: img.mimeType
      }
    });
  });

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ parts }],
    config: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA
    }
  });

  return parseResponse(response);
}

export async function generateQuestionsByFilter(
  filters: { curriculum: string; subject: string; term: string; grade: string; topic: string; blooms?: string },
  count: number = 20,
  contextQuestions: Question[] = [] // To avoid duplicates if needed
): Promise<Question[]> {
  
  const prompt = `Generate ${count} distinct academic exam questions based on the following criteria:
  - Curriculum: ${filters.curriculum}
  - Subject: ${filters.subject}
  - Grade/Year: ${filters.grade}
  - Term: ${filters.term}
  - Topic: ${filters.topic === 'All' ? 'General coverage of the subject' : filters.topic}
  ${filters.blooms && filters.blooms !== 'All' ? `- Target Bloom's Level: ${filters.blooms}` : '- Ensure a mix of Bloom\'s Taxonomy levels'}
  
  ${contextQuestions.length > 0 ? 'Ensure the new questions are different from existing ones.' : ''}
  
  Include a detailed marking scheme and Bloom's classification for each.
  If relevant (math/physics), include an SVG graph string.
  
  Return the output in JSON format.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA
    }
  });

  const result = parseResponse(response);
  // Tag the questions with the filter data for better filtering later
  return result.questions.map(q => ({
    ...q,
    curriculum: filters.curriculum !== 'All' ? filters.curriculum : undefined,
    subject: filters.subject !== 'All' ? filters.subject : undefined,
    term: filters.term !== 'All' ? filters.term : undefined,
    grade: filters.grade !== 'All' ? filters.grade : undefined,
    topic: filters.topic !== 'All' ? filters.topic : q.topic,
  }));
}

export async function getAiSuggestions(draftText: string, type: string, topic?: string) {
  const prompt = `The user is writing an exam question manually. 
  Current Draft: "${draftText}"
  Question Type: "${type}"
  Topic Context: "${topic || 'General'}"
  
  Task:
  1. Refine the question text to be more academic, clear, and professional.
  2. If the type is 'Multiple Choice', provide 4 distinct options (1 correct, 3 distractors).
  3. Suggest appropriate marks.
  4. Suggest a specific sub-topic.
  5. Generate a marking scheme/answer key.
  6. Classify the Bloom's Taxonomy level.
  7. If the question implies a visual (graph, triangle, circuit), generate an SVG string.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: SUGGESTION_SCHEMA
    }
  });

  try {
    return JSON.parse(response.text || "{}");
  } catch (e) {
    console.error("Error parsing AI suggestion", e);
    return null;
  }
}

function parseResponse(response: any): { questions: Question[]; suggestedTitle: string } {
  try {
    const data = JSON.parse(response.text || "{}");
    const questions = (data.questions || []).map((q: any, index: number) => ({
      ...q,
      id: `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      options: q.options || []
    }));
    return { questions, suggestedTitle: data.suggestedTitle || "Untitled Exam" };
  } catch (error) {
    console.error("Failed to parse AI response:", error);
    return { questions: [], suggestedTitle: "Untitled Exam" };
  }
}
