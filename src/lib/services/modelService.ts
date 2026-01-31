import prisma from '@/lib/prisma';
import { modelCache } from '@/lib/cache';
import type { ModelProvider } from '@/lib/models';

export interface ModelData {
    id: string;
    provider: string;
    name: string;
    displayName: string;
    enabled: boolean;
    isGlobal: boolean;
}

export interface CreateModelData {
    provider: ModelProvider;
    name: string;
    displayName: string;
    enabled?: boolean;
    isGlobal?: boolean;
}

export interface UpdateModelData {
    displayName?: string;
    enabled?: boolean;
    isGlobal?: boolean;
}

/**
 * Get allowed models for a user (with caching)
 * Returns global models + user-specific overrides
 */
export async function getAllowedModels(
    userId?: string, 
    keys?: { gemini?: string; openai?: string }
): Promise<ModelData[]> {
    // Check cache first
    // Note: If keys are provided, we should probably NOT cache or include keys in cache key?
    // Actually, the keys just filter the output, so we can fetch all and filter in memory.
    
    // Fetch from database or cache (ignoring keys for cache retrieval)
    let models: ModelData[];
    const cached = modelCache.getCachedModels(userId);
    
    if (cached) {
        models = cached;
    } else {
        if (userId) {
            // Get global models and user-specific overrides
            const globalModels = await prisma.model.findMany({
                where: {
                    isGlobal: true,
                    enabled: true,
                },
            });

            const userModels = await prisma.userModel.findMany({
                where: {
                    userId,
                },
                include: {
                    model: true,
                },
            });

            // Create a map of user overrides
            const userOverridesMap = new Map(
                userModels.map(um => [um.modelId, um.enabled])
            );

            // Filter global models based on user overrides
            models = globalModels
                .filter(model => {
                    const userOverride = userOverridesMap.get(model.id);
                    // If user has an override, respect it; otherwise include the model
                    return userOverride !== false;
                })
                .map(model => ({
                    id: model.id,
                    provider: model.provider,
                    name: model.name,
                    displayName: model.displayName,
                    enabled: model.enabled,
                    isGlobal: model.isGlobal,
                }));
        } else {
            // Just return global enabled models
            const globalModels = await prisma.model.findMany({
                where: {
                    isGlobal: true,
                    enabled: true,
                },
            });

            models = globalModels.map(model => ({
                id: model.id,
                provider: model.provider,
                name: model.name,
                displayName: model.displayName,
                enabled: model.enabled,
                isGlobal: model.isGlobal,
            }));
        }

        // Cache the result (full set)
        modelCache.setCachedModels(models, userId);
    }

    // Filter based on provided API keys
    // If keys object is provided, we filter. If not provided (undefined), we return all (legacy behavior).
    if (keys) {
        return models.filter(m => {
            if (m.provider === 'gemini') return !!keys.gemini;
            if (m.provider === 'openai') return !!keys.openai;
            return true; // Unknown provider
        });
    }

    return models;
}

/**
 * Get all global models (regardless of enabled status)
 */
export async function getGlobalModels(): Promise<ModelData[]> {
    const models = await prisma.model.findMany({
        where: {
            isGlobal: true,
        },
        orderBy: [
            { provider: 'asc' },
            { name: 'asc' },
        ],
    });

    return models.map(model => ({
        id: model.id,
        provider: model.provider,
        name: model.name,
        displayName: model.displayName,
        enabled: model.enabled,
        isGlobal: model.isGlobal,
    }));
}

/**
 * Get user-specific model overrides
 */
export async function getUserModels(userId: string) {
    return await prisma.userModel.findMany({
        where: {
            userId,
        },
        include: {
            model: true,
        },
    });
}

/**
 * Create a new model (admin)
 */
export async function createModel(data: CreateModelData): Promise<ModelData> {
    const model = await prisma.model.create({
        data: {
            provider: data.provider,
            name: data.name,
            displayName: data.displayName,
            enabled: data.enabled ?? true,
            isGlobal: data.isGlobal ?? true,
        },
    });

    // Invalidate cache
    modelCache.invalidateModelCache();

    return {
        id: model.id,
        provider: model.provider,
        name: model.name,
        displayName: model.displayName,
        enabled: model.enabled,
        isGlobal: model.isGlobal,
    };
}

/**
 * Update a model (admin)
 */
export async function updateModel(id: string, data: UpdateModelData): Promise<ModelData> {
    const model = await prisma.model.update({
        where: { id },
        data: {
            ...(data.displayName !== undefined && { displayName: data.displayName }),
            ...(data.enabled !== undefined && { enabled: data.enabled }),
            ...(data.isGlobal !== undefined && { isGlobal: data.isGlobal }),
        },
    });

    // Invalidate cache
    modelCache.invalidateModelCache();

    return {
        id: model.id,
        provider: model.provider,
        name: model.name,
        displayName: model.displayName,
        enabled: model.enabled,
        isGlobal: model.isGlobal,
    };
}

/**
 * Delete a model (admin)
 */
export async function deleteModel(id: string): Promise<void> {
    await prisma.model.delete({
        where: { id },
    });

    // Invalidate cache
    modelCache.invalidateModelCache();
}

/**
 * Toggle user model access
 */
export async function toggleUserModel(
    userId: string,
    modelId: string,
    enabled: boolean
): Promise<void> {
    // Check if user model override exists
    const existing = await prisma.userModel.findUnique({
        where: {
            userId_modelId: {
                userId,
                modelId,
            },
        },
    });

    if (existing) {
        // Update existing
        await prisma.userModel.update({
            where: {
                userId_modelId: {
                    userId,
                    modelId,
                },
            },
            data: {
                enabled,
            },
        });
    } else {
        // Create new override
        await prisma.userModel.create({
            data: {
                userId,
                modelId,
                enabled,
            },
        });
    }

    // Invalidate user-specific cache
    modelCache.invalidateModelCache(userId);
}

/**
 * Get all models (for admin)
 */
export async function getAllModels(): Promise<ModelData[]> {
    const models = await prisma.model.findMany({
        orderBy: [
            { provider: 'asc' },
            { name: 'asc' },
        ],
    });

    return models.map(model => ({
        id: model.id,
        provider: model.provider,
        name: model.name,
        displayName: model.displayName,
        enabled: model.enabled,
        isGlobal: model.isGlobal,
    }));
}
