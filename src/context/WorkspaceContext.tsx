'use client';

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ContextItem } from '@/types';

interface WorkspaceContextType {
    activeFolderId: string | null;
    setActiveFolderId: (id: string | null) => void;
    activeNodeId: string | null;
    setActiveNodeId: (id: string | null) => void;
    graphRefreshTrigger: number;
    triggerGraphRefresh: () => void;
    folderRefreshTrigger: number;
    triggerFolderRefresh: () => void;
    geminiApiKey: string | null;
    setGeminiApiKey: (key: string) => void;
    contextItems: ContextItem[];
    toggleContextItem: (item: ContextItem) => void;
    nodeError: string | null;
    clearNodeError: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children, nodeId }: { children: ReactNode; nodeId: string | null }) {
    const router = useRouter();
    const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
    const [activeNodeId, setActiveNodeIdState] = useState<string | null>(nodeId);
    const [graphRefreshTrigger, setGraphRefreshTrigger] = useState(0);
    const [folderRefreshTrigger, setFolderRefreshTrigger] = useState(0);
    const [geminiApiKey, setGeminiApiKeyState] = useState<string | null>(null);
    const [contextItems, setContextItems] = useState<ContextItem[]>([]);
    const [nodeError, setNodeError] = useState<string | null>(null);

    useEffect(() => {
        const key = localStorage.getItem('gemini_api_key');
        if (key) {
            setGeminiApiKeyState(key);
        }

        const storedContext = localStorage.getItem('workspace_context_items');
        if (storedContext) {
            try {
                setContextItems(JSON.parse(storedContext));
            } catch (e) {
                console.error("Failed to parse context items", e);
            }
        }

        // Validate nodeId from route parameter if provided
        if (nodeId) {
            fetch(`/api/graph/${nodeId}`)
                .then(res => {
                    if (res.ok) {
                        setActiveNodeIdState(nodeId);
                        setNodeError(null); // Clear any previous errors
                    } else if (res.status === 404) {
                        setNodeError(`Chat node not found. The link may be invalid or you don't have access to it.`);
                        console.error(`Node ${nodeId} not found or access denied`);
                        // Redirect to home on invalid node
                        router.replace('/', { scroll: false });
                    } else if (res.status === 401) {
                        setNodeError(`Please log in to view this chat node.`);
                        router.replace('/', { scroll: false });
                    } else {
                        setNodeError(`Unable to load chat node. Please try again.`);
                        router.replace('/', { scroll: false });
                    }
                })
                .catch(err => {
                    console.error('Error validating node:', err);
                    setNodeError(`Network error while loading chat node.`);
                    router.replace('/', { scroll: false });
                });
        }
    }, [nodeId, router]);

    // Update URL when activeNodeId changes (for internal navigation)
    useEffect(() => {
        // Don't update URL on initial mount if nodeId prop is set
        if (nodeId && activeNodeId === nodeId) {
            return;
        }

        // Navigate to the appropriate URL based on activeNodeId
        if (activeNodeId) {
            router.push(`/${activeNodeId}`, { scroll: false });
        } else if (activeNodeId === null && nodeId) {
            // If we're clearing the active node while on a node route, go home
            router.push('/', { scroll: false });
        }
    }, [activeNodeId, nodeId, router]);

    const setActiveNodeId = (id: string | null) => {
        setActiveNodeIdState(id);
    };

    const setGeminiApiKey = (key: string) => {
        localStorage.setItem('gemini_api_key', key);
        setGeminiApiKeyState(key);
    };

    const toggleContextItem = (item: ContextItem) => {
        setContextItems(prev => {
            const exists = prev.some(i => i.id === item.id && i.type === item.type);
            let newItems;
            if (exists) {
                newItems = prev.filter(i => !(i.id === item.id && i.type === item.type));
            } else {
                newItems = [...prev, item];
            }
            localStorage.setItem('workspace_context_items', JSON.stringify(newItems));
            return newItems;
        });
    };

    const triggerGraphRefresh = () => {
        setGraphRefreshTrigger(prev => prev + 1);
    };

    const triggerFolderRefresh = () => {
        setFolderRefreshTrigger(prev => prev + 1);
    };

    const clearNodeError = () => {
        setNodeError(null);
    };

    return (
        <WorkspaceContext.Provider
            value={{
                activeFolderId,
                setActiveFolderId,
                activeNodeId,
                setActiveNodeId,
                graphRefreshTrigger,
                triggerGraphRefresh,
                folderRefreshTrigger,
                triggerFolderRefresh,
                geminiApiKey,
                setGeminiApiKey,
                contextItems,
                toggleContextItem,
                nodeError,
                clearNodeError,
            }}
        >
            {children}
        </WorkspaceContext.Provider>
    );
}

export function useWorkspace() {
    const context = useContext(WorkspaceContext);
    if (context === undefined) {
        throw new Error('useWorkspace must be used within a WorkspaceProvider');
    }
    return context;
}
