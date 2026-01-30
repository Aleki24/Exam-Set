/**
 * Topic Matcher Utility
 * Matches question text against saved topics using keyword matching
 */

export interface Topic {
    id: string;
    name: string;
    topic_number?: number;
    description?: string;
}

export interface TopicMatch {
    topicId: string | null;
    topicName: string;
    confidence: number; // 0-1
}

// Common words to ignore in matching
const STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
    'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'under', 'again', 'further', 'then', 'once', 'here',
    'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few',
    'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
    'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
    'and', 'but', 'if', 'or', 'because', 'until', 'while', 'although',
    'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
    'am', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs',
    'we', 'us', 'our', 'ours', 'you', 'your', 'yours', 'he', 'him',
    'his', 'she', 'her', 'hers', 'i', 'me', 'my', 'mine', 'explain',
    'describe', 'define', 'list', 'state', 'give', 'name', 'identify',
    'calculate', 'find', 'determine', 'solve', 'show', 'prove',
    'marks', 'mark', 'points', 'point', 'answer', 'question',
]);

/**
 * Extract keywords from text
 */
function extractKeywords(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/<[^>]+>/g, '') // Remove HTML tags
        .replace(/[^\w\s]/g, ' ') // Remove punctuation
        .split(/\s+/)
        .filter(word => word.length > 2 && !STOP_WORDS.has(word));
}

/**
 * Calculate word overlap score between two sets of keywords
 */
function calculateOverlapScore(keywords1: string[], keywords2: string[]): number {
    if (keywords1.length === 0 || keywords2.length === 0) return 0;

    const set1 = new Set(keywords1);
    const set2 = new Set(keywords2);

    let matchCount = 0;
    for (const word of set1) {
        if (set2.has(word)) {
            matchCount++;
        }
        // Partial matching for related words (e.g., "photosynthesis" matches "photo")
        for (const word2 of set2) {
            if (word !== word2 && (word.includes(word2) || word2.includes(word))) {
                matchCount += 0.5;
            }
        }
    }

    // Jaccard-like similarity
    const unionSize = new Set([...keywords1, ...keywords2]).size;
    return matchCount / unionSize;
}

/**
 * Find the best matching topic for a question
 */
export function findBestTopic(questionText: string, topics: Topic[]): TopicMatch {
    if (!topics || topics.length === 0) {
        return { topicId: null, topicName: 'General', confidence: 0 };
    }

    const questionKeywords = extractKeywords(questionText);

    let bestMatch: TopicMatch = { topicId: null, topicName: 'General', confidence: 0 };

    for (const topic of topics) {
        // Check if topic name appears directly in question
        const topicNameLower = topic.name.toLowerCase();
        const questionLower = questionText.toLowerCase();

        let score = 0;

        // Direct name match gives high confidence
        if (questionLower.includes(topicNameLower)) {
            score = 0.8;
        } else {
            // Calculate keyword overlap
            const topicKeywords = extractKeywords(topic.name + ' ' + (topic.description || ''));
            score = calculateOverlapScore(questionKeywords, topicKeywords);
        }

        if (score > bestMatch.confidence) {
            bestMatch = {
                topicId: topic.id,
                topicName: topic.name,
                confidence: Math.min(score, 1),
            };
        }
    }

    return bestMatch;
}

/**
 * Match multiple questions to topics
 */
export function matchQuestionsToTopics(
    questions: { text: string;[key: string]: any }[],
    topics: Topic[]
): { question: any; suggestedTopic: TopicMatch }[] {
    return questions.map(question => ({
        question,
        suggestedTopic: findBestTopic(question.text, topics),
    }));
}
