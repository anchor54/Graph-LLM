import { generateGeminiResponse, DEFAULT_MODEL as GEMINI_MODEL } from './gemini';
import { generateOpenAIResponse, DEFAULT_OPENAI_MODEL as OPENAI_MODEL } from './openai';
import { detectProvider } from './models';

interface NodeDisplayData {
    summary: string;
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
    You are an expert conversation analyst. Your goal is to analyze the user-AI exchange and generate metadata about the conversation.
    
    Analyze the following exchange and output a JSON object with exactly these fields:
    
    1. "summary": A specific, outcome-oriented summary of what changed or was decided.
       - STRICT constraints: 6-12 words, verb-led (e.g., "Defines token quotas", "Rejects API key"), no markdown.
       - If it's a question, summarize the intent (e.g., "Asks about rate limits").
       
    2. "topics": An array of up to 3 short keyword strings (1-2 words each) representing themes (e.g., ["security", "auth"]).
    
    3. "classification": One string from this list: "decision", "insight", "open_question", "risk", "follow_up". 
       - Default to "insight" if unsure.
       
    4. "previewBullets": An array of up to 3 short strings (max 10 words each) that explain the "Why" and "Impact" of the outcome.
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
        return {
            summary: userPrompt.split(/\s+/).slice(0, 8).join(' ') + "...",
            topics: [],
            classification: "insight",
            previewBullets: []
        };
    }
}

function sanitizeNodeDisplay(data: any, originalPrompt: string): NodeDisplayData {
    // 1. Summary
    let summary = typeof data.summary === 'string' ? data.summary.trim() : "";
    if (!summary) {
        summary = originalPrompt.split(/\s+/).slice(0, 8).join(' ') + "...";
    }
    // Truncate if too long (approx 12 words)
    const words = summary.split(/\s+/);
    if (words.length > 15) {
        summary = words.slice(0, 12).join(' ') + "...";
    }
    
    // 2. Topics
    let topics: string[] = [];
    if (Array.isArray(data.topics)) {
        topics = data.topics
            .filter((t: any) => typeof t === 'string')
            .map((t: string) => t.slice(0, 20)) // Hard limit char length
            .slice(0, 3);
    }
    
    // 3. Classification
    const validClassifications = ["decision", "insight", "open_question", "risk", "follow_up"];
    let classification = "insight";
    if (validClassifications.includes(data.classification)) {
        classification = data.classification;
    }
    
    // 4. Preview Bullets
    let previewBullets: string[] = [];
    if (Array.isArray(data.previewBullets)) {
        previewBullets = data.previewBullets
            .filter((t: any) => typeof t === 'string')
            .map((t: string) => t.slice(0, 100)) // Hard limit length
            .slice(0, 3);
    }
    
    return { summary, topics, classification, previewBullets };
}
