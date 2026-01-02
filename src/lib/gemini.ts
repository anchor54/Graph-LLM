import { GoogleGenAI, Model } from '@google/genai';

export const DEFAULT_MODEL = 'gemini-2.5-flash-lite';

// Helper to get client with provided key or fallback
const getClient = (apiKey?: string): GoogleGenAI | null => {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) return null;
    return new GoogleGenAI({ apiKey: key });
};

export async function getModels(apiKey?: string) {
    const ai = getClient(apiKey);
    if (!ai) {
        console.error('GEMINI_API_KEY not set');
        return [];
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
    context?: string,
    apiKey?: string
) {
    const ai = getClient(apiKey);
    if (!ai) {
        return "Error: GEMINI_API_KEY is not set.";
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
    context?: string,
    apiKey?: string
) {
    const ai = getClient(apiKey);
    if (!ai) {
        yield "Error: GEMINI_API_KEY is not set.";
        return;
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

export async function generateChatName(
    userPrompt: string,
    aiResponse: string,
    apiKey?: string
): Promise<string> {
    const ai = getClient(apiKey);
    if (!ai) {
        return "New Chat";
    }

    try {
        const prompt = `
        You are a helpful assistant that generates short, descriptive titles for conversations.
        
        User Message:
        ${userPrompt}

        AI Response:
        ${aiResponse}

        Please provide a short (6-12 words) title for this conversation based on the exchange above. The title should capture the main topic or purpose of the conversation.
        Do not use quotes. Return only the title.
        `;

        const response = await ai.models.generateContent({
            model: DEFAULT_MODEL,
            contents: prompt,
        });

        return response.text?.trim() || "New Chat";
    } catch (error) {
        console.error('Error generating chat name:', error);
        return "New Chat";
    }
}

export async function summarizeContext(
    existingSummary: string | null,
    userPrompt: string,
    aiResponse: string | null,
    apiKey?: string
): Promise<string> {
    const ai = getClient(apiKey);
    if (!ai) {
        return "";
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
