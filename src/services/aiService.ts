import { Question, ExamTerm } from "@/types";
import { bulkCreateQuestions, getQuestions } from "./questionService";

const BLOOMS_LEVELS = ["Knowledge", "Understanding", "Application", "Analysis", "Evaluation", "Creation"];

// Helper to clean and extract JSON from AI response
function cleanJson(text: string): string {
    // Log incoming text for debugging (first 500 chars)
    console.log('[cleanJson] Input (first 500 chars):', text.substring(0, 500));

    // 1. Remove Markdown code blocks
    let cleaned = text.replace(/```json\n?|\n?```/g, '');
    cleaned = cleaned.replace(/```\n?/g, ''); // catch generic code blocks too

    // 1.5. Remove any leading text before the JSON object (common with some LLMs)
    // Look for patterns like "Here is the JSON:" or "Sure, here's..." before the actual JSON
    cleaned = cleaned.replace(/^[\s\S]*?(?=\{)/m, '');

    // 2. Find the first '{' and the LAST '}' to extract just the JSON object.
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    } else {
        console.error('[cleanJson] No valid JSON object found. Cleaned text:', cleaned.substring(0, 200));
        // If no braces found, return original cleaned string (might fail, but worth a try)
        return cleaned.trim();
    }

    // 3. Robust Backslash and Newline Handling
    // Many LLMs act weird with backslashes. We need to preserve valid JSON escapes while fixing common errors.

    // A. Protect valid double-escapes from LaTeX (e.g. \\frac becomes \frac in the string value)
    // We expect \\ to be a literal backslash.
    // We expect \" to be a literal quote.
    // We expect \n to be a newline.

    // Common issue: "text": "Solve: 2x + 5 = 10"  <- OK
    // Common issue: "text": "Solve: \(2x + 5 = 10\)" <- LaTeX often outputs \( ... \) without escaping the backslash for JSON string.
    // Logic: If we see a backslash that is NOT followed by ", \, /, b, f, n, r, t, u, then it's likely an error and needs escaping.

    // Use a negative lookahead to escape lonely backslashes? 
    // Regex in JS is tricky with backslashes. 
    // Valid escapes: \" \\ \/ \b \f \n \r \t \uXXXX
    // We want to turn invalid \ into \\

    // Simplest robust fix for LaTeX heavy content:
    // 1. Replace double backslashes \\ with a placeholder
    // 2. Replace valid escapes like \n, \" with placeholders
    // 3. Replace remaining \ with \\
    // 4. Restore placeholders

    const placeholders: { [key: string]: string } = {
        '\\\\': '___DOUBLE_BACKSLASH___',
        '\\"': '___ESCAPED_QUOTE___',
        '\\n': '___ESCAPED_NEWLINE___',
        '\\r': '___ESCAPED_RETURN___',
        '\\t': '___ESCAPED_TAB___',
        '\\b': '___ESCAPED_BACKSPACE___',
        '\\f': '___ESCAPED_FORMFEED___',
        '\\/': '___ESCAPED_FORWARD_SLASH___',
    };

    // Replace valid escapes with placeholders
    let safe = cleaned;
    // Order matters! \\ first to avoid matching parts of others
    safe = safe.split('\\\\').join(placeholders['\\\\']);
    safe = safe.split('\\"').join(placeholders['\\"']);
    safe = safe.split('\\n').join(placeholders['\\n']);
    safe = safe.split('\\r').join(placeholders['\\r']);
    safe = safe.split('\\t').join(placeholders['\\t']);
    safe = safe.split('\\b').join(placeholders['\\b']);
    safe = safe.split('\\f').join(placeholders['\\f']);
    safe = safe.split('\\/').join(placeholders['\\/']);

    // Also protect Unicode escapes \uXXXX
    safe = safe.replace(/\\u[0-9a-fA-F]{4}/g, (match) => `___UNICODE_${match.slice(2)}___`);

    // Now, any remaining backslash is likely an unescaped LaTeX macro or similar error. Escape it.
    safe = safe.replace(/\\/g, '\\\\');

    // Restore placeholders
    safe = safe.replace(/___UNICODE_([0-9a-fA-F]{4})___/g, (_, code) => `\\u${code}`);

    Object.keys(placeholders).forEach(key => {
        safe = safe.split(placeholders[key]).join(key);
    });

    // 4. Sanitize Control Characters
    // Remove non-printable characters that are not valid in JSON strings (0x00-0x1F except \n \r \t)
    // Actually JSON.parse handles \n \r \t if they are escaped literals.
    // If they are literal control chars (byte 10), JSON.parse fails.
    // Replace literal newlines with \n
    safe = safe.replace(/\n/g, '\\n');
    safe = safe.replace(/\r/g, '\\r');
    safe = safe.replace(/\t/g, '\\t');

    // 5. Remove any control characters that might have slipped through
    safe = safe.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

    console.log('[cleanJson] Output (first 500 chars):', safe.substring(0, 500));
    return safe.trim();
}

const PEDAGOGICAL_STANDARDS = `
PEDAGOGICAL QUALITY STANDARDS:
1. VALIDITY: Align questions strictly with the provided curriculum/material. Measure intended learning outcomes, not trivial details.
2. RELIABILITY: Ensure consistent and precise wording. Provide clear, objective marking schemes.
3. FAIRNESS: Avoid cultural, gender, or language bias. Use simple, precise language.
4. COMPREHENSIVENESS: Sample various topics and cognitive levels (Recall, Application, Analysis).
5. DISCRIMINATION: Questions should differentiate between high and low performers (balanced difficulty).
6. CLARITY: Simple instructions, unambiguous items, and clear indication of marks.
7. PRACTICALITY: Questions must be feasible to complete and score within standard exam constraints.

CRITICAL - AVOID VAGUE QUESTIONS:
- NEVER use vague qualifiers like "discuss", "explain briefly", "what do you know about" without specific focus.
- ALWAYS specify WHAT aspect to discuss, HOW MANY points to include, and evaluation criteria.
- Each question MUST have measurable, observable outcomes.
- Include specific context: scenarios, data, diagrams, or examples.
- For "explain" questions: specify what exactly to explain and to what depth.
- For "compare" questions: specify exactly which aspects to compare.
- For calculations: provide all necessary data, no ambiguity in what is being asked.
- Marking schemes MUST have specific point allocations for each expected answer element.

EXAMPLES OF BAD vs GOOD:
❌ BAD: "Discuss photosynthesis." (Too vague, no direction)
✅ GOOD: "Describe the light-dependent reactions of photosynthesis, including: (a) the role of chlorophyll [2 marks], (b) the production of ATP [2 marks], (c) the splitting of water [2 marks]."

❌ BAD: "Explain Newton's laws." (Which law? What aspect?)
✅ GOOD: "A 5kg box is pushed across a floor with a force of 20N. Using Newton's Second Law, calculate the acceleration of the box. Show your working. [3 marks]"
`;

const SUPPORTED_TYPES = [
    'Multiple Choice',
    'True/False',
    'Matching',
    'Fill-in-the-blank',
    'Numeric',
    'Structured',
    'Short Answer',
    'Essay',
    'Practical',
    'Oral'
];

async function fetchPerplexity(messages: any[], model = "sonar") {
    try {
        const response = await fetch('/api/perplexity', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
                temperature: 0.1,
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


export async function fetchUrlContent(url: string): Promise<{ title: string; text: string } | null> {
    try {
        const response = await fetch('/api/fetch-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        if (!response.ok) throw new Error('Failed to fetch URL content');
        return await response.json();
    } catch (error) {
        console.error('fetchUrlContent error:', error);
        return null;
    }
}

export async function generateQuestionsFromMaterial(
    material: string,
    images: { data: string; mimeType: string }[] = [],
    count: number = 20,
    url?: string
): Promise<{ questions: Question[]; suggestedTitle: string }> {

    let contextText = material;

    // If a URL is provided, fetch its content and prepend/append to material
    if (url) {
        const urlData = await fetchUrlContent(url);
        if (urlData) {
            contextText = `SOURCE URL CONTENT (Title: ${urlData.title}):\n${urlData.text}\n\nUSER ADDITIONAL NOTES:\n${material}`;
        }
    }

    const systemPrompt = `You are an expert academic examiner.
    ${PEDAGOGICAL_STANDARDS}

    Analyze the provided curriculum materials and generate ${count} high-quality academic exam questions.
    
    IMPORTANT:
    1. Output VALID JSON only. No markdown formatting.
    2. LaTeX formulas must escape backslashes (e.g., "\\\\frac").
    3. Ensure a mix of cognitive levels (Knowledge to Evaluation).
    4. Support diverse question types.

    JSON Structure:
    {
        "suggestedTitle": "string",
        "questions": [
            {
                "text": "string (HTML allowed for bold/italics)",
                "marks": number,
                "difficulty": "Easy" | "Medium" | "Difficult",
                "topic": "string",
                "type": "${SUPPORTED_TYPES.join('" | "')}",
                "options": ["string"] (if MCQ),
                "matchingPairs": [{ "left": "string", "right": "string" }] (if Matching),
                "unit": "string" (if Numeric),
                "markingScheme": "string",
                "bloomsLevel": "string"
            }
        ]
    }
    `;

    const truncatedMaterial = contextText.length > 20000 ? contextText.substring(0, 20000) + "...(truncated)" : contextText;
    const userMessage = `Generate the exam based on this material:\n\n${truncatedMaterial}`;

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
    filters: {
        curriculum: string;
        subject: string;
        term: string;
        grade: string;
        topic: string;
        blooms?: string;
        // Database IDs for saving
        curriculum_id?: string;
        grade_id?: string;
        subject_id?: string;
    },
    count: number = 20,
    saveToDatabase: boolean = true
): Promise<Question[]> {

    const systemPrompt = `Act as an expert academic examiner creating exam questions for formal assessment.
    ${PEDAGOGICAL_STANDARDS}

    Generate ${count} distinct, HIGH-QUALITY exam questions strictly adhering to these constraints:
    
    TARGET:
    - Curriculum: "${filters.curriculum}"
    - Grade: "${filters.grade}"
    - Subject: "${filters.subject}"
    - Term: "${filters.term}"
    - Topic: "${filters.topic}"
    - Bloom's Level: "${filters.blooms || 'Mixed - vary across Knowledge, Application, Analysis'}"

    QUALITY REQUIREMENTS:
    1. Each question MUST be specific, clear, and unambiguous.
    2. Include mark allocations that match the complexity.
    3. Provide detailed marking schemes with point-by-point breakdown.
    4. For numerical questions: include all necessary data and units.
    5. For essay/structured: specify exactly what aspects to address.
    6. Vary question types and difficulty levels appropriately for the grade.

    Output VALID JSON ONLY (no markdown):
    {
        "suggestedTitle": "string",
        "questions": [
            {
                "text": "string (specific, measurable question text)",
                "marks": number,
                "difficulty": "Easy" | "Medium" | "Difficult",
                "topic": "string",
                "subtopic": "string",
                "type": "${SUPPORTED_TYPES.join('" | "')}",
                "options": ["string"] (if MCQ - exactly 4 options with 1 correct),
                "matchingPairs": [{ "left": "string", "right": "string" }] (if Matching),
                "unit": "string" (if Numeric),
                "markingScheme": "string (detailed point-by-point marking guide)",
                "bloomsLevel": "Knowledge" | "Understanding" | "Application" | "Analysis" | "Evaluation" | "Creation"
            }
        ]
    }
    `;

    try {
        const resultText = await fetchPerplexity([
            { role: "system", content: systemPrompt },
            { role: "user", content: "Generate the questions now. Remember: NO vague questions. Each question must be specific and measurable." }
        ]);

        const parsed = parseResponse(resultText);

        const questions = parsed.questions.map(q => ({
            ...q,
            curriculum: filters.curriculum !== 'All' ? filters.curriculum : undefined,
            subject: filters.subject !== 'All' ? filters.subject : undefined,
            term: filters.term !== 'All' ? filters.term : undefined,
            grade: filters.grade !== 'All' ? filters.grade : undefined,
            topic: filters.topic !== 'All' ? filters.topic : q.topic,
        }));

        // Save to database if requested and IDs are provided
        if (saveToDatabase && (filters.curriculum_id || filters.subject_id)) {
            try {
                // Map term string to ExamTerm enum
                const termMap: Record<string, ExamTerm> = {
                    'Opener': 'opener',
                    'Mid Term 1': 'mid_term_1',
                    'End of Term 1': 'end_term_1',
                    'Mid Term 2': 'mid_term_2',
                    'End of Term 2': 'end_term_2',
                    'Mid Term 3': 'mid_term_3',
                    'End of Term 3': 'end_term_3',
                };

                await bulkCreateQuestions(questions, {
                    curriculum_id: filters.curriculum_id,
                    grade_id: filters.grade_id,
                    subject_id: filters.subject_id,
                    term: termMap[filters.term] || undefined,
                }, true);
                console.log(`Saved ${questions.length} AI-generated questions to database`);
            } catch (dbError) {
                console.error("Failed to save questions to database:", dbError);
                // Don't fail the overall operation if DB save fails
            }
        }

        return questions;

    } catch (error) {
        console.error("Perplexity generation failed:", error);
        return [];
    }
}

export async function getAiSuggestions(draftText: string, type: string, topic?: string, grade?: string, curriculum?: string) {
    const systemPrompt = `You are an expert academic assistant.
    ${PEDAGOGICAL_STANDARDS}

    Refine the user's question draft to be more professional, valid, and reliable.
    
    Context:
    - Type: ${type}
    - Topic: ${topic || 'General'}
    - Grade: ${grade || 'Any'}
    
    Output VALID JSON ONLY:
    {
        "refinedText": "string",
        "options": ["string"] (if MCQ),
        "matchingPairs": [{ "left": "string", "right": "string" }] (if Matching),
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
            options: q.options || [],
            matchingPairs: q.matchingPairs || [],
            // Ensure type matches our enum
            type: SUPPORTED_TYPES.includes(q.type) ? q.type : 'Structured'
        }));
        return { questions, suggestedTitle: data.suggestedTitle || "Untitled Exam" };
    } catch (error) {
        console.error("Failed to parse AI response:", error);
        return { questions: [], suggestedTitle: "Error: Failed to parse AI response" };
    }
}
