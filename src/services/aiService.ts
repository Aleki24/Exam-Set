import { Question } from "@/types";

const BLOOMS_LEVELS = ["Knowledge", "Understanding", "Application", "Analysis", "Evaluation", "Creation"];

// Helper to clean Markdown json blocks if present
function cleanJson(text: string): string {
    return text.replace(/```json\n?|\n?```/g, '').trim();
}

async function fetchPerplexity(messages: any[], model = "sonar") {
    try {
        // Call our local API route to avoid CORS issues
        const response = await fetch('/api/perplexity', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
                temperature: 0.2,
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error("Perplexity API Error Detail:", errorData);
            throw new Error(`Perplexity API Error: ${response.status} - ${JSON.stringify(errorData)}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error: any) {
        console.error("Fetch Perplexity Error:", error);
        throw error;
    }
}


export async function generateQuestionsFromMaterial(
    material: string,
    images: { data: string; mimeType: string }[] = [],
    count: number = 20
): Promise<{ questions: Question[]; suggestedTitle: string }> {

    // Note: Perplexity API (Llama 3 based) might not support inline images in the same way as Gemini or might require specific format.
    // The current sonar models are text-focused. If images are strictly required, we might need a different approach or skip image content for now.
    // For now, I will include image info in text if possible or just warn. 
    // Assuming text-only for 'sonar' models unless using 'sonar-vision' (if available, but standard is text).
    // The user didn't specify vision support, so I will handle text.

    const systemPrompt = `You are an expert academic examiner.
    Analyze the provided curriculum materials and generate ${count} high-quality academic exam questions.
    
    Output JSON ONLY in the following format:
    {
        "suggestedTitle": "string",
        "questions": [
            {
                "text": "string",
                "marks": number,
                "difficulty": "Easy" | "Medium" | "Difficult",
                "topic": "string",
                "type": "Multiple Choice" | "Structured" | "Essay",
                "options": ["string"] (if MCQ),
                "markingScheme": "string",
                "bloomsLevel": "string"
            }
        ]
    }
    `;

    const userMessage = `Generate the exam based on this material:\n\n${material}`;

    try {
        const resultText = await fetchPerplexity([
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage }
        ]);

        return parseResponse(resultText);
    } catch (error) {
        console.error("Perplexity generation failed:", error);
        return { questions: [], suggestedTitle: "Error Generating Exam" };
    }
}

export async function generateQuestionsByFilter(
    filters: { curriculum: string; subject: string; term: string; grade: string; topic: string; blooms?: string },
    count: number = 20
): Promise<Question[]> {

    const systemPrompt = `Act as an expert academic examiner.
    Generate ${count} distinct exam questions strictly adhering to the following constraints:
    
    TARGET:
    - Curriculum: "${filters.curriculum}"
    - Grade: "${filters.grade}"
    - Subject: "${filters.subject}"
    - Term: "${filters.term}"
    - Topic: "${filters.topic}"
    - Bloom's: "${filters.blooms || 'Mixed'}"

    Output JSON ONLY in the following format:
    {
        "suggestedTitle": "string",
        "questions": [
           {
                "text": "string",
                "marks": number,
                "difficulty": "Easy" | "Medium" | "Difficult",
                "topic": "string",
                "type": "Multiple Choice" | "Structured" | "Essay",
                "options": ["string"] (if MCQ),
                "markingScheme": "string",
                "bloomsLevel": "string"
            }
        ]
    }
    `;

    try {
        const resultText = await fetchPerplexity([
            { role: "system", content: systemPrompt },
            { role: "user", content: "Generate the questions now." }
        ]);

        const parsed = parseResponse(resultText);

        // Map back filters
        return parsed.questions.map(q => ({
            ...q,
            curriculum: filters.curriculum !== 'All' ? filters.curriculum : undefined,
            subject: filters.subject !== 'All' ? filters.subject : undefined,
            term: filters.term !== 'All' ? filters.term : undefined,
            grade: filters.grade !== 'All' ? filters.grade : undefined,
            topic: filters.topic !== 'All' ? filters.topic : q.topic,
        }));

    } catch (error) {
        console.error("Perplexity generation failed:", error);
        return [];
    }
}

export async function getAiSuggestions(draftText: string, type: string, topic?: string, grade?: string, curriculum?: string) {
    const systemPrompt = `You are an expert academic assistant.
    Refine the user's question draft to be more professional and academic.
    
    Context:
    - Type: ${type}
    - Topic: ${topic || 'General'}
    - Grade: ${grade || 'Any'}
    
    Output JSON ONLY:
    {
        "refinedText": "string",
        "options": ["string"] (4 options if MCQ),
        "suggestedMarks": number,
        "suggestedTopic": "string",
        "markingScheme": "string",
        "bloomsLevel": "string"
    }
    `;

    const userMessage = `Draft: "${draftText}"`;

    try {
        const resultText = await fetchPerplexity([
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage }
        ]);

        const cleaned = cleanJson(resultText);
        return JSON.parse(cleaned);
    } catch (e) {
        console.error("Error parsing AI suggestion", e);
        return null;
    }
}

function parseResponse(text: string): { questions: Question[]; suggestedTitle: string } {
    try {
        const cleaned = cleanJson(text);
        const data = JSON.parse(cleaned);
        const questions = (data.questions || []).map((q: any) => ({
            ...q,
            id: `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            options: q.options || []
        }));
        return { questions, suggestedTitle: data.suggestedTitle || "Untitled Exam" };
    } catch (error) {
        console.error("Failed to parse AI response:", error);
        console.log("Raw Text:", text);
        return { questions: [], suggestedTitle: "Untitled Exam" };
    }
}
