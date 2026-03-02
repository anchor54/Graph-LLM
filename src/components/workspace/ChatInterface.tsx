'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/context/WorkspaceContext';
import { Node, ContextItem } from '@/types';
import { Button } from '@/components/ui/button';
import { Send, User, Bot, Loader2, GitBranch, Quote, MoreHorizontal, Scissors, Plus, Trash2, BookmarkCheck, X, Bookmark, Copy, Check, ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Skeleton } from '@/components/ui/skeleton';
import { SelectionMenu } from './SelectionMenu';
import { CitationsDisplay, Citation } from './CitationsDisplay';
import { getAncestryPath, getChildrenCounts } from '@/lib/treeUtils';

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

// Custom code component for syntax highlighting
const CodeBlock = ({ inline, className, children, isDark }: any) => {
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';

    return !inline && language ? (
        <SyntaxHighlighter
            style={isDark ? vscDarkPlus : vs}
            language={language}
            PreTag="div"
            customStyle={{
                margin: '0.5rem 0',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
            }}
        >
            {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
    ) : (
        <code className={className}>
            {children}
        </code>
    );
};

// Collapsible Context Component for Messages
const CollapsibleMessageContext = ({ citations, references, nodesById }: { citations: any[], references: any[], nodesById: Map<string, Node> }) => {
    const [isOpen, setIsOpen] = React.useState(false);

    // Citations can be direct (optimistic) or in modelMetadata (DB)
    const allCitations = citations || [];

    const hasCitations = allCitations.length > 0;
    const hasReferences = references && references.length > 0;

    if (!hasCitations && !hasReferences) return null;

    const summaryParts = [];
    if (hasCitations) summaryParts.push(`${allCitations.length} ${allCitations.length === 1 ? 'Quote' : 'Quotes'}`);
    if (hasReferences) summaryParts.push(`${references.length} ${references.length === 1 ? 'Ref' : 'Refs'}`);

    return (
        <div className="w-full mb-1 flex flex-col items-end">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium text-muted-foreground hover:bg-muted/50 transition-colors uppercase tracking-wider"
            >
                <Layers size={10} className="text-blue-500" />
                <span>Context: {summaryParts.join(', ')}</span>
                {isOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>

            {isOpen && (
                <div className="w-full mt-2 space-y-2 animate-in slide-in-from-top-1 duration-200">
                    {/* Citations */}
                    {hasCitations && (
                        <div className="flex flex-col items-end gap-1">
                            {allCitations.map((c: any, i: number) => (
                                <div key={i} className="bg-muted border border-border text-muted-foreground text-[10px] px-2 py-1 rounded-xl rounded-tr-sm max-w-[200px] block italic" title={c.text}>
                                    <div className="truncate">
                                        <Quote size={8} className="inline mr-1 text-primary" />
                                        "{c.text}"
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* References */}
                    {hasReferences && (
                        <div className="flex flex-wrap justify-end gap-1">
                            {references.map((r: any, i: number) => {
                                // Resolve readable name from nodesById if possible
                                let displayName = r.name || r.type;
                                if (r.type === 'node' && nodesById.has(r.id)) {
                                    const node = nodesById.get(r.id);
                                    if (node) {
                                        displayName = node.summary || node.userPrompt.slice(0, 30) + '...';
                                    }
                                }

                                return (
                                    <div key={i} className="inline-flex items-center gap-1 bg-blue-50/50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-[10px] px-2 py-0.5 rounded-full" title={displayName}>
                                        <BookmarkCheck size={8} />
                                        <span className="max-w-[150px] truncate">{displayName}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

type StreamChunk = {
    key: string;
    text: string;
    animate: boolean;
};

export function ChatInterface() {
    const router = useRouter();
    const {
        activeNodeId,
        switchNode,
        nodesById,
        addNode,
        updateNode,
        triggerGraphRefresh,
        triggerFolderRefresh,
        activeFolderId,
        contextItems,
        toggleContextItem,
        draftInput,
        setDraftInput
    } = useWorkspace();

    const [sending, setSending] = useState(false);
    const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash');
    const [availableModels, setAvailableModels] = useState<{ name: string, displayName: string }[]>([]);
    const [modelsLoading, setModelsLoading] = useState(true);
    const [activeCitations, setActiveCitations] = useState<Citation[]>([]);
    const [mounted, setMounted] = useState(false);
    const [nodeToDelete, setNodeToDelete] = useState<{ id: string, parentId: string | null } | null>(null);
    const [copied, setCopied] = useState<{ id: string; source: 'user' | 'ai' } | null>(null);
    const copyResetTimerRef = useRef<number | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Streaming UI state: store deltas so only the *new* chunk fades in (instead of re-animating the whole message).
    const [streamChunksByNodeId, setStreamChunksByNodeId] = useState<Record<string, StreamChunk[]>>({});
    const streamProgressRef = useRef<{ nodeId: string | null; lastText: string }>({ nodeId: null, lastText: '' });

    const copyToClipboard = async (text: string, id: string, source: 'user' | 'ai') => {
        const value = (text ?? '').toString();
        if (!value.trim()) return;

        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(value);
            } else {
                // Fallback for older browsers / permissions issues
                const el = document.createElement('textarea');
                el.value = value;
                el.setAttribute('readonly', '');
                el.style.position = 'fixed';
                el.style.left = '-9999px';
                document.body.appendChild(el);
                el.select();
                document.execCommand('copy');
                document.body.removeChild(el);
            }

            setCopied({ id, source });
            if (copyResetTimerRef.current) window.clearTimeout(copyResetTimerRef.current);
            copyResetTimerRef.current = window.setTimeout(() => setCopied(null), 1200);
        } catch (e) {
            console.error('Failed to copy to clipboard', e);
        }
    };

    // Compute messages from context
    const messages = useMemo(() => {
        if (!activeNodeId) return [];
        const path = getAncestryPath(nodesById, activeNodeId);
        // Sort by date asc (ancestry path is usually root -> leaf, but let's ensure sort)
        return path.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }, [activeNodeId, nodesById]);

    const childrenCounts = useMemo(() => getChildrenCounts(nodesById), [nodesById]);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        return () => {
            if (copyResetTimerRef.current) window.clearTimeout(copyResetTimerRef.current);
        };
    }, []);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    }, [draftInput]);

    // Fetch available models on mount
    useEffect(() => {
        const fetchModels = async () => {
            try {
                const res = await fetch('/api/models');
                if (res.ok) {
                    const models = await res.json();
                    setAvailableModels(models);
                }
            } catch (error) {
                console.error('Failed to load models', error);
            } finally {
                setModelsLoading(false);
            }
        };
        fetchModels();
    }, []);

    // Focus textarea on active chat change
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.focus();
        }
    }, [activeNodeId]);

    // Scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, sending]); // Re-scroll when messages change or sending state changes

    // When streaming, compute incremental deltas and keep them as separate chunks.
    useEffect(() => {
        if (!sending) {
            // Reset progress (we keep chunks around; completed messages will render markdown normally).
            streamProgressRef.current = { nodeId: null, lastText: '' };
            return;
        }

        const last = messages.length > 0 ? messages[messages.length - 1] : null;
        if (!last) return;

        const id = last.id;
        const newText = last.aiResponse || '';

        // If the streaming target node changed (e.g. temp -> real ID swap), seed chunks with current text (no animation).
        if (streamProgressRef.current.nodeId !== id) {
            streamProgressRef.current = { nodeId: id, lastText: newText };
            setStreamChunksByNodeId(prev => ({
                ...prev,
                [id]: newText
                    ? [{ key: `${id}-seed`, text: newText, animate: false }]
                    : [],
            }));
            return;
        }

        const prevText = streamProgressRef.current.lastText;
        if (newText === prevText) return;

        const delta = newText.startsWith(prevText) ? newText.slice(prevText.length) : newText;
        streamProgressRef.current.lastText = newText;

        if (!delta) return;
        setStreamChunksByNodeId(prev => {
            const existing = prev[id] || [];
            const next: StreamChunk = {
                key: `${id}-${Date.now()}-${existing.length}`,
                text: delta,
                animate: true,
            };
            return { ...prev, [id]: [...existing, next] };
        });
    }, [messages, sending]);

    const handleSend = async () => {
        if (!draftInput.trim()) return;
        setSending(true);

        const userPrompt = draftInput;
        setDraftInput(''); // Clear input immediately

        const activeMessage = messages.length > 0 ? messages[messages.length - 1] : null;
        let parentId = activeMessage?.id || null;

        // Prevent parenting to a temp node if possible, though strict usage shouldn't happen here
        // as we replace temp IDs. But just in case:
        if (parentId?.startsWith('temp-')) {
            // Fallback or wait? For now, assume previous flow finished.
        }

        const tempId = `temp-${Date.now()}`;

        // Optimistically add user message to UI
        const optimisticNode: Node = {
            id: tempId,
            userPrompt: userPrompt,
            aiResponse: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            parentId: parentId,
            folderId: activeMessage?.folderId || activeFolderId,
            modelMetadata: { model: selectedModel },
            citations: activeCitations,
            references: contextItems,
            summary: null
        } as any;

        addNode(optimisticNode);
        switchNode(tempId);
        setActiveCitations([]);

        const requestStartTime = Date.now();

        try {
            // Resolve Context Items to Node IDs
            const referencedNodeIds = new Set<string>();

            for (const item of contextItems) {
                if (item.type === 'folder') {
                    try {
                        const res = await fetch(`/api/nodes?folderId=${item.id}&recursive=true&rootsOnly=true`);
                        if (res.ok) {
                            const nodes = await res.json();
                            nodes.forEach((n: any) => referencedNodeIds.add(n.id));
                        }
                    } catch (e) {
                        console.error("Error resolving folder context", e);
                    }
                } else {
                    referencedNodeIds.add(item.id);
                }
            }

            const res = await fetch('/api/nodes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userPrompt,
                    parentId: parentId, // Use the ID we linked the temp node to
                    folderId: optimisticNode.folderId,
                    modelMetadata: { model: selectedModel },
                    citations: optimisticNode.citations,
                    referencedNodeIds: Array.from(referencedNodeIds),
                    references: contextItems
                }),
            });

            if (!res.ok) {
                const errorText = await res.text();
                console.error('Failed to send message. Status:', res.status, 'Response:', errorText);
                setSending(false);
                return;
            }

            const reader = res.body?.getReader();
            const decoder = new TextDecoder();
            let aiResponse = '';
            let realNodeId = '';
            
            let firstChunkTime = 0;
            let backendProcessingTime = 0;

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    
                    if (!done && firstChunkTime === 0) {
                        firstChunkTime = Date.now();
                    }
                    
                    if (done) break;

                    const chunk = decoder.decode(value);
                    const lines = chunk.split('\n\n');

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.substring(6));
                                
                                if (data.backendProcessingTime) {
                                    backendProcessingTime = data.backendProcessingTime;
                                }
                                
                                if (data.chunk) {
                                    aiResponse += data.chunk;

                                    // Update the optimistic node (tempId)
                                    // AND if we already have the real ID, update that too or switch?
                                    // Actually, let's keep updating the temp node until we are done, 
                                    // OR if we have the real ID, we should swap.

                                    if (realNodeId) {
                                        updateNode(realNodeId, { aiResponse });
                                    } else {
                                        updateNode(tempId, { aiResponse });
                                    }
                                }
                                if (data.nodeId) {
                                    realNodeId = data.nodeId;

                                    // Create the real node, copying state from temp
                                    // We can just add it. The ancestry path will then show BOTH if we aren't careful?
                                    // No, switchNode changes the active path.
                                    // But if we want to seamless swap:
                                    const realNode: Node = {
                                        ...optimisticNode,
                                        id: realNodeId,
                                        aiResponse: aiResponse // Ensure we have latest
                                    };
                                    addNode(realNode);

                                    // Switch to real node
                                    switchNode(realNodeId);

                                    // Note: The temp node remains in nodesById but is no longer in the active path
                                    // because the real node's parent is the same.
                                }
                            } catch (e) {
                                console.error('Error parsing stream chunk', e);
                            }
                        }
                    }
                }
                
                // Metrics Logic
                const streamEndTime = Date.now();
                const clientTtfb = firstChunkTime > 0 ? firstChunkTime - requestStartTime : 0;
                const clientTotalDuration = streamEndTime - requestStartTime;
                const networkLatency = backendProcessingTime > 0 ? Math.max(0, clientTtfb - backendProcessingTime) : 0;
                
                // Log and send
                console.log('[Metrics]', { clientTtfb, clientTotalDuration, networkLatency, backendProcessingTime });
                
                fetch('/api/metrics', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        client_ttfb: clientTtfb,
                        client_total_duration: clientTotalDuration,
                        network_latency: networkLatency
                    })
                }).catch(err => console.error("Metrics send error:", err));
            }

            triggerGraphRefresh(); // Sync fully with DB
        } catch (error) {
            console.error('Failed to send message', error);
        } finally {
            setSending(false);
        }
    };

    const handleBranch = (nodeId: string) => {
        switchNode(nodeId);
    };

    const handleCutToNewChat = async (nodeId: string) => {
        try {
            const res = await fetch('/api/nodes', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: nodeId,
                    parentId: null
                }),
            });

            if (res.ok) {
                triggerFolderRefresh();
                triggerGraphRefresh();
            } else {
                console.error('Failed to cut node');
            }
        } catch (error) {
            console.error('Error cutting node:', error);
        }
    };

    const handleDeleteClick = (nodeId: string, parentId: string | null) => {
        setNodeToDelete({ id: nodeId, parentId });
    };

    const handleConfirmDelete = async (mode: 'single' | 'subtree') => {
        if (!nodeToDelete) return;

        try {
            const res = await fetch(`/api/nodes?id=${nodeToDelete.id}&mode=${mode}`, {
                method: 'DELETE',
            });

            if (res.ok) {
                if (mode === 'subtree' || activeNodeId === nodeToDelete.id) {
                    switchNode(nodeToDelete.parentId);
                }

                triggerGraphRefresh();
                triggerFolderRefresh();
                setNodeToDelete(null);
            } else {
                console.error('Failed to delete node');
            }
        } catch (error) {
            console.error('Error deleting node:', error);
        }
    };

    const handleQuote = (text: string, nodeId: string, source: 'user' | 'ai') => {
        setActiveCitations(prev => [...prev, { text, nodeId, source }]);
    };

    const handleRemoveCitation = (index: number) => {
        setActiveCitations(prev => prev.filter((_, i) => i !== index));
    };

    return (
        <div className="h-full flex flex-col bg-background text-foreground relative">
            <SelectionMenu onQuote={handleQuote} />

            <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
                {!activeNodeId && messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                        <Bot size={48} className="mb-4 opacity-20" />
                        <p>Start a new conversation</p>
                    </div>
                ) : (
                    messages.map((node, index) => {
                        const isLast = index === messages.length - 1;
                        const isGenerating = isLast && sending;

                        // Check children count from map
                        const childCount = childrenCounts.get(node.id) || 0;

                        return (
                            <div key={node.id} className="space-y-4 group">
                                {/* User Message */}
                                <div className="flex flex-col items-end gap-1 group/user" data-message-id={node.id} data-message-source="user">
                                    <CollapsibleMessageContext
                                        citations={node.citations || (node.modelMetadata as any)?.citations || []}
                                        references={(node as any).references}
                                        nodesById={nodesById}
                                    />

                                    <div className="bg-muted text-foreground p-3 rounded-2xl rounded-tr-sm max-w-[80%] shadow-sm">
                                        <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-pre:my-2">
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                components={{
                                                    code: (props) => <CodeBlock {...props} isDark={true} />
                                                }}
                                            >
                                                {node.userPrompt}
                                            </ReactMarkdown>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-end w-full max-w-[80%] opacity-0 group-hover/user:opacity-100 transition-opacity">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className={cn(
                                                "h-7 px-2 text-xs gap-1.5",
                                                copied?.id === node.id && copied?.source === 'user'
                                                    ? "text-green-600 hover:text-green-700"
                                                    : "text-muted-foreground hover:text-foreground"
                                            )}
                                            onClick={() => copyToClipboard(node.userPrompt || '', node.id, 'user')}
                                            title="Copy"
                                            aria-label="Copy"
                                        >
                                            {copied?.id === node.id && copied?.source === 'user' ? (
                                                <>
                                                    <Check size={14} className="text-green-600" />
                                                    Copied
                                                </>
                                            ) : (
                                                <>
                                                    <Copy size={14} />
                                                    Copy
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </div>

                                {/* AI Response */}
                                {(node.aiResponse || isGenerating) && (
                                    <div className="flex justify-center w-full" data-message-id={node.id} data-message-source="ai">
                                        <div className="w-full max-w-3xl relative group/ai pr-8">
                                            {isGenerating && !node.aiResponse ? (
                                                <div className="text-foreground py-2">
                                                    <div className="space-y-2">
                                                        <Skeleton className="h-4 w-[90%] bg-muted-foreground/20" />
                                                        <Skeleton className="h-4 w-[75%] bg-muted-foreground/20" />
                                                        <Skeleton className="h-4 w-[50%] bg-muted-foreground/20" />
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="text-foreground py-2">
                                                    <div className="mb-2 text-xs text-muted-foreground font-semibold uppercase">
                                                        {node.modelMetadata?.model || 'AI'}
                                                    </div>
                                                    {isGenerating ? (
                                                        <div className="text-sm leading-6 whitespace-pre-wrap">
                                                            {(streamChunksByNodeId[node.id] || []).map((c) => (
                                                                <span
                                                                    key={c.key}
                                                                    className={cn(c.animate ? 'animate-in fade-in duration-200' : '')}
                                                                >
                                                                    {c.text}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="prose dark:prose-invert prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-pre:my-2">
                                                            <ReactMarkdown
                                                                remarkPlugins={[remarkGfm]}
                                                                components={{
                                                                    code: (props) => <CodeBlock {...props} isDark={true} />
                                                                }}
                                                            >
                                                                {node.aiResponse || ''}
                                                            </ReactMarkdown>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {!node.id.startsWith('temp-') && !isGenerating && (
                                                <div className="flex items-center gap-2 mt-2 opacity-0 group-hover/ai:opacity-100 transition-opacity">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className={cn(
                                                            "h-7 px-2 text-xs gap-1.5",
                                                            copied?.id === node.id && copied?.source === 'ai'
                                                                ? "text-green-600 hover:text-green-700"
                                                                : "text-muted-foreground hover:text-foreground"
                                                        )}
                                                        onClick={() => copyToClipboard(node.aiResponse || '', node.id, 'ai')}
                                                        title="Copy"
                                                    >
                                                        {copied?.id === node.id && copied?.source === 'ai' ? (
                                                            <>
                                                                <Check size={14} className="text-green-600" />
                                                                Copied
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Copy size={14} />
                                                                Copy
                                                            </>
                                                        )}
                                                    </Button>
                                                    {childCount > 0 && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1.5"
                                                            onClick={() => handleBranch(node.id)}
                                                            title="Branch from here"
                                                        >
                                                            <GitBranch size={14} />
                                                            Branch
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1.5"
                                                        onClick={() => toggleContextItem({ id: node.id, type: 'node', name: (node.summary || node.userPrompt).slice(0, 30) + '...' })}
                                                        title={contextItems.some(i => i.id === node.id) ? "Remove from Context" : "Add to Context"}
                                                    >
                                                        {contextItems.some(i => i.id === node.id) ? (
                                                            <BookmarkCheck size={14} className="text-blue-500" />
                                                        ) : (
                                                            <Bookmark size={14} />
                                                        )}
                                                        Context
                                                    </Button>
                                                    {node.parentId && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1.5"
                                                            onClick={() => handleCutToNewChat(node.id)}
                                                            title="Cut to new chat"
                                                        >
                                                            <Scissors size={14} />
                                                            Cut
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive gap-1.5"
                                                        onClick={() => handleDeleteClick(node.id, node.parentId)}
                                                        title="Delete message"
                                                    >
                                                        <Trash2 size={14} />
                                                        Delete
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            <div className="bg-background p-4 pb-6">
                <div className="max-w-3xl mx-auto w-full space-y-3">
                    <CitationsDisplay citations={activeCitations} onRemove={handleRemoveCitation} />

                    {contextItems.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                            {contextItems.map(item => (
                                <div
                                    key={`${item.type}-${item.id}`}
                                    className="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-full px-2 py-1 text-xs text-blue-700 dark:text-blue-300 shadow-sm animate-in fade-in zoom-in duration-200 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/50"
                                    onClick={() => {
                                        if (item.type === 'node' || item.type === 'chat') {
                                            switchNode(item.id);
                                        }
                                    }}
                                >
                                    <BookmarkCheck size={12} />
                                    <span className="max-w-[150px] truncate font-medium">{item.name || item.type}</span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleContextItem(item);
                                        }}
                                        className="ml-1 hover:text-blue-900 dark:hover:text-blue-100 rounded-full hover:bg-blue-200/50 dark:hover:bg-blue-800/50 p-0.5"
                                        title="Remove reference"
                                    >
                                        <X size={10} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="bg-muted/70 rounded-[28px] p-4 border border-transparent focus-within:border-border transition-colors">
                        <textarea
                            ref={textareaRef}
                            className="w-full bg-transparent border-none focus:outline-none focus:ring-0 resize-none min-h-[48px] max-h-[200px] px-2 py-1 text-foreground placeholder:text-muted-foreground text-base"
                            placeholder="Ask anything"
                            value={draftInput}
                            onChange={(e) => setDraftInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                            disabled={sending}
                            rows={1}
                        />

                        <div className="flex justify-end items-center mt-2 px-1">
                            <div className="flex items-center gap-2">
                                {!mounted ? (
                                    <Skeleton className="h-9 w-24 rounded-full" />
                                ) : (
                                    <Select value={selectedModel} onValueChange={setSelectedModel}>
                                        <SelectTrigger className="h-9 border-none bg-background/30 shadow-none hover:bg-background/50 rounded-full gap-2 px-3 text-xs font-medium text-muted-foreground hover:text-foreground focus:ring-0 w-auto">
                                            <SelectValue placeholder="Model" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {modelsLoading ? (
                                                <SelectItem value="loading" disabled>Loading models...</SelectItem>
                                            ) : availableModels.length > 0 ? (
                                                availableModels.map((model: any) => (
                                                    <SelectItem key={model.name} value={model.name}>
                                                        {model.displayName} {model.provider && `(${model.provider})`}
                                                    </SelectItem>
                                                ))
                                            ) : (
                                                <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash (Fallback)</SelectItem>
                                            )}
                                        </SelectContent>
                                    </Select>
                                )}

                                <Button
                                    onClick={handleSend}
                                    disabled={sending || !draftInput.trim()}
                                    size="icon"
                                    className={cn(
                                        "h-9 w-9 rounded-full transition-all",
                                        draftInput.trim() ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20 text-muted-foreground"
                                    )}
                                >
                                    {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <Dialog open={!!nodeToDelete} onOpenChange={(open) => !open && setNodeToDelete(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Message</DialogTitle>
                        <DialogDescription>
                            How would you like to delete this message?
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="border rounded-md p-4 space-y-2 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => handleConfirmDelete('single')}>
                            <div className="font-medium">Delete this message only</div>
                            <div className="text-sm text-muted-foreground">
                                The message will be removed. Any replies will be moved to the parent message.
                            </div>
                        </div>
                        <div className="border border-destructive/50 rounded-md p-4 space-y-2 hover:bg-destructive/10 transition-colors cursor-pointer" onClick={() => handleConfirmDelete('subtree')}>
                            <div className="font-medium text-destructive">Delete entire conversation from here</div>
                            <div className="text-sm text-muted-foreground">
                                This message and ALL subsequent replies in this thread will be permanently deleted.
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setNodeToDelete(null)}>Cancel</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
