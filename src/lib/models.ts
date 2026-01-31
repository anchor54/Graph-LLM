import { streamGeminiResponse, generateGeminiResponse, getModels as getGeminiModels } from './gemini';
import { streamOpenAIResponse, generateOpenAIResponse, getOpenAIModels } from './openai';

export type ModelProvider = 'gemini' | 'openai';

export interface ModelInfo {
    name: string;
    displayName: string;
    provider: ModelProvider;
}

/**
 * Detect provider based on model name
 */
export function detectProvider(modelName: string): ModelProvider {
    // OpenAI models commonly start with 'gpt-' (including fine-tunes like 'ft:gpt-...')
    // or with reasoning families like 'o1', 'o3-mini', etc.
    if (
        modelName.startsWith('gpt-') ||
        modelName.startsWith('ft:gpt-') ||
        /^o\d/.test(modelName) ||
        modelName.startsWith('ft:o')
    ) {
        return 'openai';
    }
    // Everything else is assumed to be Gemini
    return 'gemini';
}

/**
 * Get all available models from both providers (for admin use)
 */
export async function getAllModelsFromProviders(
    geminiApiKey?: string,
    openaiApiKey?: string
): Promise<ModelInfo[]> {
    const models: ModelInfo[] = [];
    
    if (geminiApiKey) {
        try {
            const geminiModels = await getGeminiModels(geminiApiKey);
            models.push(...geminiModels.map(m => ({ ...m, provider: 'gemini' as ModelProvider })));
        } catch (error) {
            console.error('Error fetching Gemini models:', error);
        }
    }
    
    if (openaiApiKey) {
        try {
            const openaiModels = await getOpenAIModels(openaiApiKey);
            models.push(...openaiModels.map(m => ({ ...m, provider: 'openai' as ModelProvider })));
        } catch (error) {
            console.error('Error fetching OpenAI models:', error);
        }
    }
    
    return models;
}

/**
 * Generate a complete response from the appropriate provider (non-streaming)
 */
export async function generateModelResponse(
    prompt: string,
    modelName: string,
    context?: string,
    apiKey?: string
): Promise<string> {
    const provider = detectProvider(modelName);
    
    if (provider === 'openai') {
        return await generateOpenAIResponse(prompt, modelName, context, apiKey);
    } else {
        return await generateGeminiResponse(prompt, modelName, context, apiKey);
    }
}

/**
 * Stream response from the appropriate provider
 */
export async function* streamModelResponse(
    prompt: string,
    modelName: string,
    context?: string,
    apiKey?: string
) {
    const provider = detectProvider(modelName);
    
    if (provider === 'openai') {
        yield* streamOpenAIResponse(prompt, modelName, context, apiKey);
    } else {
        yield* streamGeminiResponse(prompt, modelName, context, apiKey);
    }
}
