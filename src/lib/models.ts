import { streamGeminiResponse, getModels as getGeminiModels } from './gemini';
import { streamOpenAIResponse, getOpenAIModels } from './openai';

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
    // OpenAI models start with 'gpt-' or 'o1-' or are just 'o1'
    if (modelName.startsWith('gpt-') || modelName.startsWith('o1-') || modelName === 'o1') {
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
 * Stream response from the appropriate provider
 */
export async function* streamModelResponse(
    prompt: string,
    modelName: string,
    context?: string
) {
    const provider = detectProvider(modelName);
    
    if (provider === 'openai') {
        yield* streamOpenAIResponse(prompt, modelName, context);
    } else {
        yield* streamGeminiResponse(prompt, modelName, context);
    }
}
