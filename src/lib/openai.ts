import OpenAI from 'openai';

export const DEFAULT_OPENAI_MODEL = 'gpt-4o';

// Helper to get client with provided key or fallback
const getClient = (apiKey?: string): OpenAI | null => {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) return null;
    return new OpenAI({ apiKey: key });
};

export async function getOpenAIModels(apiKey?: string) {
    const client = getClient(apiKey);
    if (!client) {
        console.error('OPENAI_API_KEY not set');
        return [];
    }

    try {
        // OpenAI doesn't have a direct list endpoint for chat models, so return common models
        return [
            { name: 'gpt-4o', displayName: 'GPT-4o' },
            { name: 'gpt-4o-mini', displayName: 'GPT-4o Mini' },
            { name: 'gpt-4-turbo', displayName: 'GPT-4 Turbo' },
            { name: 'gpt-4', displayName: 'GPT-4' },
            { name: 'gpt-3.5-turbo', displayName: 'GPT-3.5 Turbo' },
            { name: 'o1', displayName: 'O1' },
            { name: 'o1-mini', displayName: 'O1 Mini' },
        ];
    } catch (error) {
        console.error('Error fetching OpenAI models:', error);
        return [];
    }
}

export async function* streamOpenAIResponse(
    prompt: string,
    modelName: string = DEFAULT_OPENAI_MODEL,
    context?: string,
    apiKey?: string
) {
    const client = getClient(apiKey);
    if (!client) {
        yield "Error: OPENAI_API_KEY is not set.";
        return;
    }

    try {
        // Build messages array with context
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
        
        if (context) {
            messages.push({
                role: 'system',
                content: `Previous Conversation Summary:\n${context}`
            });
        }
        
        messages.push({
            role: 'user',
            content: prompt
        });

        const stream = await client.chat.completions.create({
            model: modelName,
            messages: messages,
            stream: true,
        });

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
                yield content;
            }
        }
    } catch (error) {
        console.error('Error calling OpenAI API:', error);
        yield `Error calling OpenAI API: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
}

export async function generateOpenAIResponse(
    prompt: string,
    modelName: string = DEFAULT_OPENAI_MODEL,
    context?: string,
    apiKey?: string
) {
    const client = getClient(apiKey);
    if (!client) {
        return "Error: OPENAI_API_KEY is not set.";
    }

    try {
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
        
        if (context) {
            messages.push({
                role: 'system',
                content: `Previous Conversation Summary:\n${context}`
            });
        }
        
        messages.push({
            role: 'user',
            content: prompt
        });

        const response = await client.chat.completions.create({
            model: modelName,
            messages: messages,
        });

        return response.choices[0]?.message?.content || "No response generated.";
    } catch (error) {
        console.error('Error calling OpenAI API:', error);
        return `Error calling OpenAI API: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
}

export async function generateNodeTitle(
    userPrompt: string,
    apiKey?: string
): Promise<string> {
    const client = getClient(apiKey);
    if (!client) {
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

        const response = await client.chat.completions.create({
            model: DEFAULT_OPENAI_MODEL,
            messages: [{ role: 'user', content: prompt }],
        });

        return response.choices[0]?.message?.content?.trim() || userPrompt.split(/\s+/).slice(0, 5).join(' ');
    } catch (error) {
        console.error('Error generating node title:', error);
        return userPrompt.split(/\s+/).slice(0, 5).join(' ');
    }
}
