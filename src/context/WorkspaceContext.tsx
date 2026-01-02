'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

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
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
    const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
    const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
    const [graphRefreshTrigger, setGraphRefreshTrigger] = useState(0);
    const [folderRefreshTrigger, setFolderRefreshTrigger] = useState(0);
    const [geminiApiKey, setGeminiApiKeyState] = useState<string | null>(null);

    React.useEffect(() => {
        const key = localStorage.getItem('gemini_api_key');
        if (key) {
            setGeminiApiKeyState(key);
        }
    }, []);

    const setGeminiApiKey = (key: string) => {
        localStorage.setItem('gemini_api_key', key);
        setGeminiApiKeyState(key);
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
