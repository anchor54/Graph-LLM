import { GoogleGenAI, Model } from '@google/genai';

export const DEFAULT_MODEL = 'gemini-2.5-flash-lite';

export const ALLOWED_GEMINI_MODELS = [
    { name: 'gemini-3-pro-preview', displayName: 'Gemini 3 Pro Preview' },
    { name: 'gemini-3-flash-preview', displayName: 'Gemini 3 Flash Preview' },
    { name: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
    { name: 'gemini-2.5-flash-lite', displayName: 'Gemini 2.5 Flash Lite' },
    { name: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' },
];

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
        const allowedNames = new Set(ALLOWED_GEMINI_MODELS.map(m => m.name));

        // Use for-await to iterate through all pages automatically
        for await (const model of modelList) {
            // Filter for models that support generateContent AND are in our allowed list
            const modelName = model.name?.replace('models/', '') || model.name || '';
            
            if (model.supportedActions?.includes('generateContent') && allowedNames.has(modelName)) {
                 const found = ALLOWED_GEMINI_MODELS.find(m => m.name === modelName);
                chatModels.push({
                    name: modelName,
                    displayName: found?.displayName || model.displayName || modelName,
                });
            }
        }

        if (chatModels.length > 0) {
            return chatModels;
        }

        return ALLOWED_GEMINI_MODELS;
    } catch (error) {
        console.error('Error fetching models via SDK:', error);
        return ALLOWED_GEMINI_MODELS;
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
        return response.text || "No response generated.";
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

export async function summarizeInteraction(
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
        Summarize the following conversation interaction concisely.
        Focus on the main topic or question and the key points of the answer.
        This summary will be used as context for future turns.

        User: ${userPrompt}
        AI: ${aiResponse || "No response."}

        Summary:
        `;

        // Use a fast model for summarization
        const response = await ai.models.generateContent({
            model: DEFAULT_MODEL,
            contents: prompt,
        });

        return response.text || "";
    } catch (error) {
        console.error('Error summarizing interaction:', error);
        return ""; // Return empty on failure
    }
}

export async function generateNodeTitle(
    userPrompt: string,
    apiKey?: string
): Promise<string> {
    const ai = getClient(apiKey);
    if (!ai) {
        // Fallback: Use first 4-5 words of the user prompt
        return userPrompt.split(/\s+/).slice(0, 5).join(' ');
    }

    try {
        const prompt = `
        Create a brief topic label (4-5 words max) for this query.
        Write it like a heading or keyword phrase, not a complete sentence.
        Avoid phrases like "asking about" or "the user". Be direct and concise.
        Use lowercase, no quotes, no punctuation at the end.

        Query: ${userPrompt}

        Examples of good titles:
        - "previous query recall"
        - "implementing authentication system"
        - "fixing database connection issue"

        Topic label:
        `;

        const response = await ai.models.generateContent({
            model: DEFAULT_MODEL,
            contents: prompt,
        });

        const title = response.text?.trim() || userPrompt.split(/\s+/).slice(0, 5).join(' ');
        return title;
    } catch (error) {
        console.error('Error generating node title:', error);
        // Fallback: Use first 4-5 words of the user prompt
        return userPrompt.split(/\s+/).slice(0, 5).join(' ');
    }
}
