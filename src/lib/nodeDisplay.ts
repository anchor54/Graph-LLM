import { generateGeminiResponse, DEFAULT_MODEL as GEMINI_MODEL } from './gemini';
import { generateOpenAIResponse, DEFAULT_OPENAI_MODEL as OPENAI_MODEL } from './openai';
import { detectProvider } from './models';

interface NodeDisplayData {
    summary: string;
    nodeTitle: string;
    topics: string[];
    classification: string;
    previewBullets: string[];
}

export async function generateNodeDisplay(
    userPrompt: string,
    aiResponse: string,
    modelName: string = GEMINI_MODEL
): Promise<NodeDisplayData> {
    const provider = detectProvider(modelName);
    
    const systemPrompt = `
    You are a metadata generator for graph-based conversation nodes.

    Analyze the following user-AI exchange and output a JSON object with exactly these fields:

    1. "summary": A specific, outcome-oriented summary of what changed or was decided.
       - STRICT constraints: 6-12 words, verb-led (e.g., "Defines token quotas", "Rejects API key"), no markdown.
       - If it's a question, summarize the intent (e.g., "Asks about rate limits").

    2. "nodeTitle": A short, scannable title for this node in a graph UI.
       - Goal: immediately scannable while staying faithful to the node's actual content.
       - Capture the main topic, task, decision, issue, or proposal.
       - Prefer specific wording over abstract wording.
       - Keep it short: 3 to 7 words preferred, 10 words max.
       - Preserve technical terminology exactly when relevant.
       - Strip conversational wrappers such as "can you help me", "what do you think about", "instead of", "I was also thinking", "currently in the application".
       - Rewrite questions into compact topic/action titles when appropriate.
       - For bug/problem nodes, mention the problem directly.
       - For comparison nodes, use "X vs Y" form when natural.
       - For design/architecture nodes, name the design choice explicitly.
       - Avoid vague words like "thing", "stuff", "discussion", "question", "idea", "issue" unless required for fidelity.
       - No punctuation at the end.
       - Examples:
         - "currently in the application, when the user submits a query, a temp node is created first and later replaced by the real node id" → "Temp node replacement flow"
         - "would separate user query and response nodes be better than keeping both in one node?" → "Single node vs split nodes"
         - "should we summarize the user query into a graph node title by default?" → "Default query title summarization"
         - "would it not confuse the user as to what he actually asked?" → "Summary title user confusion"

    3. "topics": An array of up to 3 short keyword strings (1-2 words each) representing themes (e.g., ["security", "auth"]).

    4. "classification": One string from this list: "decision", "insight", "open_question", "risk", "follow_up".
       - Default to "insight" if unsure.

    5. "previewBullets": An array of up to 3 short strings (max 10 words each) that explain the "Why" and "Impact" of the outcome.
       - Format: "Why: [Reason]" or "Impact: [Consequence]" or just the key point.
       - Example: ["Why: Security risk", "Why: Poor UX", "Impact: Affects free tier"]

    Output JSON only. No markdown fencing.

    Exchange:
    User: ${userPrompt}
    AI: ${aiResponse}
    `;

    let rawResponse = "";
    
    try {
        if (provider === 'openai') {
            rawResponse = await generateOpenAIResponse(systemPrompt, modelName) || "{}";
        } else {
            rawResponse = await generateGeminiResponse(systemPrompt, modelName) || "{}";
        }
        
        // Cleanup response (remove markdown code blocks if present)
        const cleanResponse = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(cleanResponse);
        
        return sanitizeNodeDisplay(data, userPrompt);
    } catch (e) {
        console.error("Error generating node display metadata", e);
        // Fallback
        const fallback = userPrompt.split(/\s+/).slice(0, 8).join(' ') + "...";
        return {
            summary: fallback,
            nodeTitle: userPrompt.split(/\s+/).slice(0, 7).join(' '),
            topics: [],
            classification: "insight",
            previewBullets: []
        };
    }
}

function sanitizeNodeDisplay(data: any, originalPrompt: string): NodeDisplayData {
    // 1. Summary (sidebar chat title — outcome-oriented, verb-led)
    let summary = typeof data.summary === 'string' ? data.summary.trim() : "";
    if (!summary) {
        summary = originalPrompt.split(/\s+/).slice(0, 8).join(' ') + "...";
    }
    const summaryWords = summary.split(/\s+/);
    if (summaryWords.length > 15) {
        summary = summaryWords.slice(0, 12).join(' ') + "...";
    }

    // 2. Node title (graph label — short, scannable, topic-first)
    let nodeTitle = typeof data.nodeTitle === 'string' ? data.nodeTitle.trim() : "";
    if (!nodeTitle) {
        nodeTitle = summary; // fall back to summary if missing
    }
    const titleWords = nodeTitle.split(/\s+/);
    if (titleWords.length > 10) {
        nodeTitle = titleWords.slice(0, 10).join(' ');
    }

    // 3. Topics
    let topics: string[] = [];
    if (Array.isArray(data.topics)) {
        topics = data.topics
            .filter((t: any) => typeof t === 'string')
            .map((t: string) => t.slice(0, 20))
            .slice(0, 3);
    }

    // 4. Classification
    const validClassifications = ["decision", "insight", "open_question", "risk", "follow_up"];
    let classification = "insight";
    if (validClassifications.includes(data.classification)) {
        classification = data.classification;
    }

    // 5. Preview Bullets
    let previewBullets: string[] = [];
    if (Array.isArray(data.previewBullets)) {
        previewBullets = data.previewBullets
            .filter((t: any) => typeof t === 'string')
            .map((t: string) => t.slice(0, 100))
            .slice(0, 3);
    }

    return { summary, nodeTitle, topics, classification, previewBullets };
}
