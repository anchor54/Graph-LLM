'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useWorkspace } from '@/context/WorkspaceContext';
import { Node } from '@/types';
import { Button } from '@/components/ui/button';
import { Send, User, Bot, Loader2, GitBranch, Quote } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { SelectionMenu } from './SelectionMenu';
import { CitationsDisplay, Citation } from './CitationsDisplay';

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

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
    const { activeNodeId, setActiveNodeId, triggerGraphRefresh, activeFolderId } = useWorkspace();
    const [messages, setMessages] = useState<Node[]>([]);
    const [loading, setLoading] = useState(false);
    const [inputText, setInputText] = useState('');
    const [sending, setSending] = useState(false);
    const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash');
    const [availableModels, setAvailableModels] = useState<{ name: string, displayName: string }[]>([]);
    const [modelsLoading, setModelsLoading] = useState(true);
    const [activeCitations, setActiveCitations] = useState<Citation[]>([]);
    const [streamedResponse, setStreamedResponse] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

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
    }, [activeNodeId]);

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
            const parentId = activeMessage?.id || null;
            const folderId = activeMessage?.folderId || activeFolderId || null;

            const res = await fetch('/api/nodes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userPrompt,
                    parentId,
                    folderId,
                    modelMetadata: { model: selectedModel },
                    citations: optimisticNode.citations
                }),
            });

            if (!res.ok) {
                console.error('Failed to send message');
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

    const handleQuote = (text: string, nodeId: string, source: 'user' | 'ai') => {
        setActiveCitations(prev => [...prev, { text, nodeId, source }]);
    };

    const handleRemoveCitation = (index: number) => {
        setActiveCitations(prev => prev.filter((_, i) => i !== index));
    };

    // Render input even if empty
    return (
        <div className="h-full flex flex-col bg-white text-slate-900 relative">
            <SelectionMenu onQuote={handleQuote} />
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
                {!activeNodeId && messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400">
                        <Bot size={48} className="mb-4 opacity-20" />
                        <p>Start a new conversation</p>
                    </div>
                ) : (
                    messages.map((node) => (
                        <div key={node.id} className="space-y-4 group">
                            {/* User Message */}
                            <div className="flex flex-col items-end gap-1" data-message-id={node.id} data-message-source="user">
                                {/* Display Citations if this message used them */}
                                {(node as any).citations && (node as any).citations.length > 0 && (
                                    <div className="mb-1 text-right">
                                        {(node as any).citations.map((c: any, i: number) => (
                                            <div key={i} className="inline-block bg-slate-100 border border-slate-200 text-slate-500 text-[10px] px-2 py-1 rounded-full mr-1 max-w-[200px] truncate" title={c.text}>
                                                <Quote size={8} className="inline mr-1" />
                                                "{c.text}"
                                            </div>
                                        ))}
                                    </div>
                                )}
                                
                                <div className="bg-blue-600 text-white p-3 rounded-2xl rounded-tr-sm max-w-[80%] shadow-sm">
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
                            {(node.aiResponse || (node.id === 'temp-id' && sending)) && (
                                <div className="flex justify-start items-center gap-2" data-message-id={node.id} data-message-source="ai">
                                    {node.id === 'temp-id' && !node.aiResponse ? (
                                        <div className="flex items-center justify-center p-2 text-slate-400">
                                            <Loader2 className="animate-spin" size={20} />
                                        </div>
                                    ) : (
                                        <div className="bg-slate-100 text-slate-800 p-3 rounded-2xl rounded-tl-sm max-w-[80%] shadow-sm">
                                            <div className="mb-2 text-xs text-slate-400 font-semibold uppercase">
                                                {node.modelMetadata?.model || 'AI'}
                                            </div>
                                            <div className="prose prose-slate prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-pre:my-2">
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
                                    {node.id !== 'temp-id' && (
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-slate-400 hover:text-blue-600"
                                            onClick={() => handleBranch(node.id)}
                                            title="Branch from here"
                                        >
                                            <GitBranch size={16} />
                                        </Button>
                                    )}
                                </div>
                            )}
                        </div>
                    ))
                )}
                {loading && <div className="flex justify-center p-4"><Loader2 className="animate-spin text-slate-400" /></div>}
            </div>

            <div className="border-t bg-slate-50">
                <CitationsDisplay citations={activeCitations} onRemove={handleRemoveCitation} />
                
                <div className="p-4 space-y-2">
                    <div className="flex items-center gap-2">
                        <div className="w-[140px]">
                            <Select value={selectedModel} onValueChange={setSelectedModel}>
                                <SelectTrigger className="h-8">
                                    <SelectValue placeholder="Select Model" />
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
                        </div>
                        <div className="flex-1 text-xs text-slate-400 flex items-center">
                            <User className="mr-1" size={12} /> Current Branch Model
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            className="flex-1 p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Type your message..."
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            disabled={sending}
                        />
                        <Button onClick={handleSend} disabled={sending || !inputText.trim()}>
                            {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
