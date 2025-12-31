import { GoogleGenAI, Model } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;
export const DEFAULT_MODEL = 'gemini-2.5-flash-lite';

let ai: GoogleGenAI | null = null;
if (apiKey) {
    ai = new GoogleGenAI({ apiKey });
}

export async function getModels() {
    if (!ai) {
        if (!process.env.GEMINI_API_KEY) {
            console.error('GEMINI_API_KEY not set');
            return [];
        }
        ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }

    try {
        // Use SDK to list models with async iteration
        const modelList = await ai.models.list();
        const chatModels: Array<{ name: string, displayName: string }> = [];

        // Use for-await to iterate through all pages automatically
        for await (const model of modelList) {
            // Filter for models that support generateContent
            if (model.supportedActions?.includes('generateContent')) {
                chatModels.push({
                    name: model.name?.replace('models/', '') || model.name || '',
                    displayName: model.displayName || model.name?.replace('models/', '') || '',
                });
            }
        }

        return chatModels;
    } catch (error) {
        console.error('Error fetching models via SDK:', error);
        return [];
    }
}

export async function generateGeminiResponse(
    prompt: string,
    modelName: string = DEFAULT_MODEL,
    context?: string
) {
    if (!ai) {
        if (!process.env.GEMINI_API_KEY) {
            return "Error: GEMINI_API_KEY is not set in environment variables.";
        }
        ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }

    try {
        // If context is provided, we can prepend it to the prompt or use system instructions if the model supports it.
        // For simplicity and compatibility, we will prepend it.
        let fullPrompt = prompt;
        if (context) {
            fullPrompt = `Previous Conversation Summary:\n${context}\n\nUser Message:\n${prompt}`;
        }

        const response = await ai.models.generateContent({
            model: modelName,
            contents: fullPrompt,
        });
        return response.text;
    } catch (error) {
        console.error('Error calling Gemini API:', error);
        return `Error calling Gemini API: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
}

export async function* streamGeminiResponse(
    prompt: string,
    modelName: string = DEFAULT_MODEL,
    context?: string
) {
    if (!ai) {
        if (!process.env.GEMINI_API_KEY) {
            yield "Error: GEMINI_API_KEY is not set in environment variables.";
            return;
        }
        ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }

    try {
        let fullPrompt = prompt;
        if (context) {
            fullPrompt = `Previous Conversation Summary:\n${context}\n\nUser Message:\n${prompt}`;
        }

        const stream = await ai.models.generateContentStream({
            model: modelName,
            contents: fullPrompt,
        });

        for await (const chunk of stream) {
            if (chunk.text) {
                yield chunk.text;
            }
        }
    } catch (error) {
        console.error('Error calling Gemini API:', error);
        yield `Error calling Gemini API: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
}

export async function summarizeContext(
    existingSummary: string | null,
    userPrompt: string,
    aiResponse: string | null
): Promise<string> {
    if (!ai) {
        if (!process.env.GEMINI_API_KEY) {
            return "";
        }
        ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }

    try {
        const prompt = `
        You are a helpful assistant that summarizes conversation history.
        
        Current Summary:
        ${existingSummary || "No previous summary."}

        New Exchange:
        User: ${userPrompt}
        AI: ${aiResponse || "No response yet."}

        Please provide a concise updated summary of the entire conversation up to this point, incorporating the new exchange. 
        Keep it brief but preserve key details and context.
        `;

        // Use a fast model for summarization
        const response = await ai.models.generateContent({
            model: DEFAULT_MODEL,
            contents: prompt,
        });

        return response.text || "";
    } catch (error) {
        console.error('Error summarizing context:', error);
        return existingSummary || ""; // Return old summary on failure
    }
}
