import OpenAI from 'openai';

export const DEFAULT_OPENAI_MODEL = 'gpt-5-mini';

export const ALLOWED_OPENAI_MODELS = [
    { name: 'gpt-5.2', displayName: 'GPT 5.2' },
    { name: 'gpt-5-mini', displayName: 'GPT 5 Mini' },
    { name: 'gpt-5-nano', displayName: 'GPT 5 Nano' },
];

// Helper to get client with provided key or fallback
const getClient = (apiKey?: string): OpenAI | null => {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) return null;
    return new OpenAI({ apiKey: key });
};

const isReasoningModel = (modelName: string): boolean => /^o\d/.test(modelName) || modelName.startsWith('ft:o');

const prettyModelName = (id: string): string => {
    if (id.startsWith('ft:')) {
        return id;
    }
    const parts = id.split('-');
    const mapped = parts.map((part, idx) => {
        const lower = part.toLowerCase();
        if (idx === 0 && lower === 'gpt') return 'GPT';
        if (idx === 0 && /^o\d/.test(lower)) return lower.toUpperCase(); // o1, o3, etc.
        if (lower === 'mini') return 'Mini';
        if (lower === 'nano') return 'Nano';
        // Preserve things like 5.2 / 4.1 / 4o as-is except leading char casing for words
        return part.length ? part[0].toUpperCase() + part.slice(1) : part;
    });
    return mapped.join(' ');
};

export async function getOpenAIModels(apiKey?: string) {
    const client = getClient(apiKey);
    if (!client) {
        console.error('OPENAI_API_KEY not set');
        return [];
    }

    try {
        // Prefer dynamic listing so newly released models show up automatically (for admin tooling).
        // However, strictly filter to only the allowed list as per requirements.
        const list = await client.models.list();
        const allowedNames = new Set(ALLOWED_OPENAI_MODELS.map(m => m.name));
        
        const ids = list.data
            .map(m => m.id)
            .filter(id => allowedNames.has(id));

        // De-dupe + stable ordering
        const unique = Array.from(new Set(ids)).sort((a, b) => a.localeCompare(b));

        if (unique.length > 0) {
            return unique.map(id => {
                const found = ALLOWED_OPENAI_MODELS.find(m => m.name === id);
                return { name: id, displayName: found?.displayName || prettyModelName(id) };
            });
        }

        // Fallback to allowed models if list is empty or none found
        return ALLOWED_OPENAI_MODELS;
    } catch (error) {
        console.error('Error fetching OpenAI models:', error);
        return ALLOWED_OPENAI_MODELS;
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
        // Reasoning-family models (o*) are best supported via the Responses API.
        if (isReasoningModel(modelName)) {
            const stream = await client.responses.create({
                model: modelName,
                input: prompt,
                ...(context ? { instructions: `Previous Conversation Summary:\n${context}` } : {}),
                stream: true,
            });

            for await (const event of stream) {
                if (event.type === 'response.output_text.delta') {
                    yield event.delta;
                }
            }
            return;
        }

        // Default: chat completions for GPT-family chat models.
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

        if (context) {
            messages.push({
                role: 'system',
                content: `Previous Conversation Summary:\n${context}`,
            });
        }

        messages.push({
            role: 'user',
            content: prompt,
        });

        const stream = await client.chat.completions.create({
            model: modelName,
            messages,
            stream: true,
        });

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) yield content;
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
        if (isReasoningModel(modelName)) {
            const response = await client.responses.create({
                model: modelName,
                input: prompt,
                ...(context ? { instructions: `Previous Conversation Summary:\n${context}` } : {}),
            });

            return response.output_text || "No response generated.";
        }

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

        // Keep title generation on the default GPT model (cheap + fast).
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
