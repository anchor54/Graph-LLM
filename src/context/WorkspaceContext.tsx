'use client';

import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ContextItem, Node } from '@/types';
import { normalizeTree, getRoot } from '@/lib/treeUtils';

interface WorkspaceContextType {
    activeFolderId: string | null;
    setActiveFolderId: (id: string | null) => void;
    activeNodeId: string | null;
    setActiveNodeId: (id: string | null) => void; // Deprecated, use switchNode
    switchNode: (id: string | null) => Promise<void>;

    // Tree State
    nodesById: Map<string, Node>;
    addNode: (node: Node) => void;
    updateNode: (id: string, updates: Partial<Node>) => void;
    loadTree: (rootId: string) => Promise<void>;

    // Legacy / Other
    graphRefreshTrigger: number;
    triggerGraphRefresh: () => void;
    folderRefreshTrigger: number;
    triggerFolderRefresh: () => void;
    contextItems: ContextItem[];
    toggleContextItem: (item: ContextItem) => void;
    nodeError: string | null;
    clearNodeError: () => void;
    draftInput: string;
    setDraftInput: (input: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children, nodeId }: { children: ReactNode; nodeId: string | null }) {
    const router = useRouter();
    const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
    const [activeNodeId, setActiveNodeIdState] = useState<string | null>(nodeId);

    // Tree State
    const [nodesById, setNodesById] = useState<Map<string, Node>>(new Map());

    const [graphRefreshTrigger, setGraphRefreshTrigger] = useState(0);
    const [folderRefreshTrigger, setFolderRefreshTrigger] = useState(0);
    const [contextItems, setContextItems] = useState<ContextItem[]>([]);
    const [nodeError, setNodeError] = useState<string | null>(null);
    const [draftInput, setDraftInput] = useState('');
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const draftInputRef = useRef(draftInput);

    // Keep ref in sync
    useLayoutEffect(() => {
        draftInputRef.current = draftInput;
    }, [draftInput]);

    useEffect(() => {
        const storedContext = localStorage.getItem('workspace_context_items');
        if (storedContext) {
            try {
                setContextItems(JSON.parse(storedContext));
            } catch (e) {
                console.error("Failed to parse context items", e);
            }
        }
    }, []);

    // Load initial tree if nodeId is provided
    useEffect(() => {
        if (nodeId) {
            // We need to find the root to load the whole tree
            // But initially we might only have the nodeId.
            // We can fetch the ancestry of the nodeId to find the root, then load the tree.
            // Or simpler: just use the existing validation logic but upgrade it to load the tree.

            const init = async () => {
                try {
                    // Get ancestry to find root
                    const res = await fetch(`/api/graph/${nodeId}?direction=ancestors`);
                    if (res.ok) {
                        const ancestors: Node[] = await res.json();
                        const root = ancestors.find(n => !n.parentId);
                        if (root) {
                            await loadTree(root.id);
                            setActiveNodeIdState(nodeId);
                            setNodeError(null);
                        }
                    } else if (res.status === 404) {
                        setNodeError(`Chat node not found.`);
                        router.replace('/', { scroll: false });
                    } else {
                        setNodeError(`Unable to load chat node.`);
                    }
                } catch (e) {
                    console.error("Failed to initialize tree", e);
                    setNodeError(`Network error.`);
                }
            };

            init();
        }
    }, [nodeId, router]);

    // Update URL when activeNodeId changes (for internal navigation)
    useEffect(() => {
        // Don't update URL on initial mount if nodeId prop is set and matches
        if (nodeId && activeNodeId === nodeId) {
            return;
        }

        if (activeNodeId) {
            window.history.pushState(null, '', `/${activeNodeId}`);
        } else if (activeNodeId === null && nodeId) {
            window.history.pushState(null, '', '/');
        }
    }, [activeNodeId, nodeId]);

    const loadTree = useCallback(async (rootId: string) => {
        try {
            const res = await fetch(`/api/graph/${rootId}`);
            if (res.ok) {
                const nodes: Node[] = await res.json();
                setNodesById(normalizeTree(nodes));
            }
        } catch (e) {
            console.error("Failed to load tree", e);
        }
    }, []);

    const switchNode = useCallback(async (id: string | null) => {
        // If switching to the same node, do nothing
        if (id === activeNodeId) {
            return;
        }

        // Save current draft before switching
        const currentKey = activeNodeId || 'root';
        const currentDraft = draftInputRef.current;
        setDrafts(prev => ({ ...prev, [currentKey]: currentDraft }));

        // Restore draft for the new node
        const nextKey = id || 'root';
        setDraftInput(drafts[nextKey] || '');

        if (!id) {
            setActiveNodeIdState(null);
            return;
        }

        // Check if node exists in memory
        if (nodesById.has(id)) {
            setActiveNodeIdState(id);
            return;
        }

        // If not in memory, we might need to load a different tree.
        // Fetch ancestry to find the root of this new node.
        try {
            const res = await fetch(`/api/graph/${id}?direction=ancestors`);
            if (res.ok) {
                const ancestors: Node[] = await res.json();
                const root = ancestors.find(n => !n.parentId);
                if (root) {
                    await loadTree(root.id);
                    setActiveNodeIdState(id);
                }
            }
        } catch (e) {
            console.error("Failed to switch node", e);
        }
    }, [nodesById, loadTree, activeNodeId, drafts]);

    // Legacy support
    const setActiveNodeId = (id: string | null) => {
        switchNode(id);
    };

    const addNode = useCallback((node: Node) => {
        setNodesById(prev => {
            const newMap = new Map(prev);
            newMap.set(node.id, node);
            return newMap;
        });
    }, []);

    const updateNode = useCallback((id: string, updates: Partial<Node>) => {
        setNodesById(prev => {
            const node = prev.get(id);
            if (!node) return prev;

            const newMap = new Map(prev);
            newMap.set(id, { ...node, ...updates });
            return newMap;
        });
    }, []);

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
        // Also reload tree if active
        if (activeNodeId) {
            const root = getRoot(nodesById, activeNodeId);
            if (root) loadTree(root.id);
        }
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
                switchNode,
                nodesById,
                addNode,
                updateNode,
                loadTree,
                graphRefreshTrigger,
                triggerGraphRefresh,
                folderRefreshTrigger,
                triggerFolderRefresh,
                contextItems,
                toggleContextItem,
                nodeError,
                clearNodeError,
                draftInput,
                setDraftInput,
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
