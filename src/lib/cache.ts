// In-memory cache for models with TTL support
interface CacheEntry<T> {
    data: T;
    expiresAt: number;
}

class InMemoryCache {
    private cache: Map<string, CacheEntry<any>>;
    private defaultTTL: number;

    constructor(defaultTTL: number = 3600000) { // Default 1 hour
        this.cache = new Map();
        this.defaultTTL = defaultTTL;
        
        // Periodic cleanup of expired entries every 5 minutes
        setInterval(() => this.clearExpiredEntries(), 300000);
    }

    /**
     * Get cached models for a user or global
     */
    getCachedModels(userId?: string): any[] | null {
        const key = userId ? `models:user:${userId}` : 'models:global';
        const entry = this.cache.get(key);

        if (!entry) {
            return null;
        }

        // Check if expired
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }

        return entry.data;
    }

    /**
     * Store models in cache with TTL
     */
    setCachedModels(models: any[], userId?: string, ttl?: number): void {
        const key = userId ? `models:user:${userId}` : 'models:global';
        const expiresAt = Date.now() + (ttl || this.defaultTTL);

        this.cache.set(key, {
            data: models,
            expiresAt,
        });
    }

    /**
     * Invalidate model cache (specific user or all)
     */
    invalidateModelCache(userId?: string): void {
        if (userId) {
            this.cache.delete(`models:user:${userId}`);
        } else {
            // Clear all model-related cache entries
            const keysToDelete: string[] = [];
            for (const key of this.cache.keys()) {
                if (key.startsWith('models:')) {
                    keysToDelete.push(key);
                }
            }
            keysToDelete.forEach(key => this.cache.delete(key));
        }
    }

    /**
     * Clear expired entries from cache
     */
    clearExpiredEntries(): void {
        const now = Date.now();
        const keysToDelete: string[] = [];

        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expiresAt) {
                keysToDelete.push(key);
            }
        }

        keysToDelete.forEach(key => this.cache.delete(key));
    }

    /**
     * Clear all cache entries
     */
    clearAll(): void {
        this.cache.clear();
    }

    /**
     * Get cache size
     */
    size(): number {
        return this.cache.size;
    }
}

// Export singleton instance
export const modelCache = new InMemoryCache();
