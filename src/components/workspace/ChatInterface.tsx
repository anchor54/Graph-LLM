'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useWorkspace } from '@/context/WorkspaceContext';
import { Node } from '@/types';
import { Button } from '@/components/ui/button';
import { Send, User, Bot, Loader2, GitBranch, Quote, MoreHorizontal, Scissors, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Skeleton } from '@/components/ui/skeleton';
import { SelectionMenu } from './SelectionMenu';
import { CitationsDisplay, Citation } from './CitationsDisplay';

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

export function ChatInterface() {
    const { activeNodeId, setActiveNodeId, graphRefreshTrigger, triggerGraphRefresh, triggerFolderRefresh, activeFolderId, geminiApiKey } = useWorkspace();
    const [messages, setMessages] = useState<Node[]>([]);
    const [loading, setLoading] = useState(false);
    const [inputText, setInputText] = useState('');
    const [sending, setSending] = useState(false);
    const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash');
    const [availableModels, setAvailableModels] = useState<{ name: string, displayName: string }[]>([]);
    const [modelsLoading, setModelsLoading] = useState(true);
    const [activeCitations, setActiveCitations] = useState<Citation[]>([]);
    const [streamedResponse, setStreamedResponse] = useState('');
    const [mounted, setMounted] = useState(false);
    const [nodeToDelete, setNodeToDelete] = useState<{ id: string, parentId: string | null } | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    }, [inputText]);

    // Fetch available models on mount
    useEffect(() => {
        if (!geminiApiKey) return;

        const fetchModels = async () => {
            try {
                const res = await fetch('/api/models', {
                    headers: {
                        'x-gemini-api-key': geminiApiKey
                    }
                });
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
    }, [geminiApiKey]);

    // Fetch ancestry when activeNodeId changes
    useEffect(() => {
        if (!activeNodeId) {
            setMessages([]);
            return;
        }

        const fetchHistory = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/graph/${activeNodeId}?direction=ancestors`);
                if (res.ok) {
                    const data: Node[] = await res.json();
                    // Sort by date asc
                    data.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                    setMessages(data);
                }
            } catch (error) {
                console.error('Failed to load chat history', error);
            } finally {
                setLoading(false);
            }
        };

        fetchHistory();
    }, [activeNodeId, graphRefreshTrigger]);

    // Focus textarea on active chat change or when ready
    useEffect(() => {
        if (!loading && textareaRef.current) {
            textareaRef.current.focus();
        }
    }, [activeNodeId, loading]);

    // Scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, streamedResponse]);

    const handleSend = async () => {
        if (!inputText.trim()) return;
        setSending(true);
        setStreamedResponse('');

        const userPrompt = inputText;
        setInputText(''); // Clear input immediately

        // Optimistically add user message to UI
        const optimisticNode: Node = {
            id: 'temp-id', // Temporary ID
            userPrompt: userPrompt,
            aiResponse: '', // Empty initially
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            parentId: messages.length > 0 ? messages[messages.length - 1].id : null,
            folderId: messages.length > 0 ? messages[messages.length - 1].folderId : activeFolderId,
            modelMetadata: { model: selectedModel },
            citations: activeCitations,
            summary: null
        } as any;

        setMessages(prev => [...prev, optimisticNode]);
        setActiveCitations([]); // Clear citations

        try {
            const activeMessage = messages.length > 0 ? messages[messages.length - 1] : null;
            let parentId = activeMessage?.id || null;

            // Ensure we don't use a temporary ID as the parent
            if (parentId === 'temp-id') {
                const validParent = [...messages].reverse().find(m => m.id !== 'temp-id');
                parentId = validParent?.id || null;
            }

            const folderId = activeMessage?.folderId || activeFolderId || null;

            const res = await fetch('/api/nodes', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-gemini-api-key': geminiApiKey || ''
                },
                body: JSON.stringify({
                    userPrompt,
                    parentId,
                    folderId,
                    modelMetadata: { model: selectedModel },
                    citations: optimisticNode.citations
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
            let nodeId = '';

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    const chunk = decoder.decode(value);
                    const lines = chunk.split('\n\n');
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.substring(6));
                                if (data.chunk) {
                                    aiResponse += data.chunk;
                                    setStreamedResponse(aiResponse);
                                    
                                    // Update the optimistic node with streamed content
                                    setMessages(prev => {
                                        const newMessages = [...prev];
                                        const lastMsg = newMessages[newMessages.length - 1];
                                        if (lastMsg.id === 'temp-id' || lastMsg.id === nodeId) {
                                            lastMsg.aiResponse = aiResponse;
                                            if (nodeId) lastMsg.id = nodeId; // Ensure ID is updated if we have it
                                        }
                                        return newMessages;
                                    });
                                }
                                if (data.nodeId) {
                                    nodeId = data.nodeId;
                                    // Update ID in state
                                    setMessages(prev => {
                                        const newMessages = [...prev];
                                        const lastMsg = newMessages[newMessages.length - 1];
                                        if (lastMsg.id === 'temp-id') {
                                            lastMsg.id = nodeId;
                                        }
                                        return newMessages;
                                    });
                                    setActiveNodeId(nodeId);
                                    triggerGraphRefresh(); // Refresh tree to show new chat immediately
                                }
                            } catch (e) {
                                console.error('Error parsing stream chunk', e);
                            }
                        }
                    }
                }
            }

            triggerGraphRefresh();
        } catch (error) {
            console.error('Failed to send message', error);
        } finally {
            setSending(false);
            setStreamedResponse('');
        }
    };

    const handleBranch = (nodeId: string) => {
        setActiveNodeId(nodeId);
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
                // If subtree delete, or if we deleted the active node itself, navigate to parent.
                // If single delete of an ancestor, the active node (descendant) is preserved (reparented), so stay.
                if (mode === 'subtree' || activeNodeId === nodeToDelete.id) {
                    setActiveNodeId(nodeToDelete.parentId);
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

    // Render input even if empty
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

                        return (
                            <div key={node.id} className="space-y-4 group">
                            {/* User Message */}
                            <div className="flex flex-col items-end gap-1" data-message-id={node.id} data-message-source="user">
                                {/* Display Citations if this message used them */}
                                {(node as any).citations && (node as any).citations.length > 0 && (
                                    <div className="mb-1 text-right">
                                        {(node as any).citations.map((c: any, i: number) => (
                                            <div key={i} className="inline-block bg-muted border border-border text-muted-foreground text-[10px] px-2 py-1 rounded-full mr-1 max-w-[200px] truncate" title={c.text}>
                                                <Quote size={8} className="inline mr-1" />
                                                "{c.text}"
                                            </div>
                                        ))}
                                    </div>
                                )}
                                
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
                                            </div>
                                        )}
                                        {node.id !== 'temp-id' && !isGenerating && (
                                            <div className="flex items-center gap-2 mt-2 opacity-0 group-hover/ai:opacity-100 transition-opacity">
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
                {loading && <div className="flex justify-center p-4"><Loader2 className="animate-spin text-muted-foreground" /></div>}
            </div>

            <div className="bg-background p-4 pb-6">
                <div className="max-w-3xl mx-auto w-full space-y-3">
                    <CitationsDisplay citations={activeCitations} onRemove={handleRemoveCitation} />
                    
                    <div className="bg-muted/70 rounded-[28px] p-4 border border-transparent focus-within:border-border transition-colors">
                        <textarea
                            ref={textareaRef}
                            className="w-full bg-transparent border-none focus:outline-none focus:ring-0 resize-none min-h-[48px] max-h-[200px] px-2 py-1 text-foreground placeholder:text-muted-foreground text-base"
                            placeholder="Ask Gemini..."
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                            disabled={sending}
                            rows={1}
                        />
                        
                        <div className="flex justify-between items-center mt-2 px-1">
                            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-muted-foreground hover:bg-background/50 hover:text-foreground bg-background/30">
                                <Plus size={20} />
                            </Button>

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
                                                availableModels.map((model) => (
                                                    <SelectItem key={model.name} value={model.name}>
                                                        {model.displayName}
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
                                    disabled={sending || !inputText.trim()} 
                                    size="icon"
                                    className={cn(
                                        "h-9 w-9 rounded-full transition-all",
                                        inputText.trim() ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20 text-muted-foreground"
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
