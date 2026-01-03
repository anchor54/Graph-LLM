'use client';

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
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
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
    const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
    const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
    const [graphRefreshTrigger, setGraphRefreshTrigger] = useState(0);
    const [folderRefreshTrigger, setFolderRefreshTrigger] = useState(0);
    const [geminiApiKey, setGeminiApiKeyState] = useState<string | null>(null);
    const [contextItems, setContextItems] = useState<ContextItem[]>([]);

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
    }, []);

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
