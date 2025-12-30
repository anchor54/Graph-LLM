'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useWorkspace } from '@/context/WorkspaceContext';
import { Node } from '@/types';
import { Button } from '@/components/ui/button';
import { Send, User, Bot, Loader2, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';

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
    const { activeNodeId, setActiveNodeId, triggerGraphRefresh } = useWorkspace();
    const [messages, setMessages] = useState<Node[]>([]);
    const [loading, setLoading] = useState(false);
    const [inputText, setInputText] = useState('');
    const [sending, setSending] = useState(false);
    const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash');
    const [availableModels, setAvailableModels] = useState<{ name: string, displayName: string }[]>([]);
    const [modelsLoading, setModelsLoading] = useState(true);
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
    }, [messages]);

    const handleSend = async () => {
        if (!inputText.trim()) return;
        setSending(true);

        try {
            const activeMessage = messages[messages.length - 1];
            const parentId = activeMessage?.id || null;
            // If we are starting a new chat (parentId is null), we can optionally assign a folder if one is selected in context (not implemented yet).
            // For now, root chats go to root folder (null) unless we track activeFolderId.
            const folderId = activeMessage?.folderId || null;

            const res = await fetch('/api/nodes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userPrompt: inputText,
                    parentId,
                    folderId,
                    modelMetadata: { model: selectedModel }
                }),
            });

            if (res.ok) {
                const newNode: Node = await res.json();
                setInputText('');
                setActiveNodeId(newNode.id);
                triggerGraphRefresh();
            }
        } catch (error) {
            console.error('Failed to send message', error);
        } finally {
            setSending(false);
        }
    };

    const handleBranch = (nodeId: string) => {
        setActiveNodeId(nodeId);
    };

    // Render input even if empty
    return (
        <div className="h-full flex flex-col bg-white text-slate-900">
            <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
                {!activeNodeId && messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400">
                        <Bot size={48} className="mb-4 opacity-20" />
                        <p>Start a new conversation</p>
                    </div>
                ) : (
                    messages.map((node) => (
                        <div key={node.id} className="space-y-4 group">
                            <div className="flex justify-end items-center gap-2">
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
                            {node.aiResponse && (
                                <div className="flex justify-start items-center gap-2">
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
                                                {node.aiResponse}
                                            </ReactMarkdown>
                                        </div>
                                    </div>
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-slate-400 hover:text-blue-600"
                                        onClick={() => handleBranch(node.id)}
                                        title="Branch from here"
                                    >
                                        <GitBranch size={16} />
                                    </Button>
                                </div>
                            )}
                        </div>
                    ))
                )}
                {loading && <div className="flex justify-center p-4"><Loader2 className="animate-spin text-slate-400" /></div>}
            </div>

            <div className="p-4 border-t bg-slate-50 space-y-2">
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
    );
}
