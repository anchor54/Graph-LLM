'use client';

import React, { useEffect, useState } from 'react';
import { Folder, Node } from '@/types';
import { ChevronRight, ChevronDown, Folder as FolderIcon, MessageSquare, MoreHorizontal, FolderPlus, MessageSquarePlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/context/WorkspaceContext';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function FolderTree() {
    const [folders, setFolders] = useState<Folder[]>([]);
    const [chats, setChats] = useState<Map<string, Node[]>>(new Map());
    const [loading, setLoading] = useState(true);
    const { setActiveFolderId, setActiveNodeId, folderRefreshTrigger, graphRefreshTrigger } = useWorkspace();

    useEffect(() => {
        fetchData();
    }, [folderRefreshTrigger, graphRefreshTrigger]);

    const fetchData = async () => {
        try {
            const [foldersRes, nodesRes] = await Promise.all([
                fetch('/api/folders'),
                fetch('/api/nodes?rootsOnly=true')
            ]);

            if (foldersRes.ok && nodesRes.ok) {
                const foldersData = await foldersRes.json();
                const nodesData: Node[] = await nodesRes.json();

                setFolders(buildFolderTree(foldersData));

                // Group chats by folderId
                const chatsMap = new Map<string, Node[]>();
                nodesData.forEach(node => {
                    const fid = node.folderId || 'root';
                    if (!chatsMap.has(fid)) chatsMap.set(fid, []);
                    chatsMap.get(fid)!.push(node);
                });
                setChats(chatsMap);
            }
        } catch (error) {
            console.error('Failed to load data', error);
        } finally {
            setLoading(false);
        }
    };

    const buildFolderTree = (flatFolders: Folder[]): Folder[] => {
        const map = new Map<string, Folder>();
        const roots: Folder[] = [];

        // Initialize map
        flatFolders.forEach(f => {
            map.set(f.id, { ...f, children: [] });
        });

        // Build tree
        flatFolders.forEach(f => {
            const node = map.get(f.id)!;
            if (f.parentId && map.has(f.parentId)) {
                map.get(f.parentId)!.children!.push(node);
            } else {
                roots.push(node);
            }
        });

        return roots;
    };

    const handleSelectChat = (nodeId: string) => {
        setActiveNodeId(nodeId);
        // We could also set activeFolderId here if we wanted context sync, 
        // but activeNodeId is enough for ChatInterface to load the chat.
    };

    if (loading) return <div className="p-2 text-sm text-muted-foreground">Loading...</div>;

    return (
        <div className="space-y-1">
            {/* Root level chats */}
            {chats.get('root')?.map(chat => (
                <ChatItem key={chat.id} node={chat} onSelect={handleSelectChat} />
            ))}

            {folders.map(folder => (
                <FolderItem
                    key={folder.id}
                    folder={folder}
                    chatsMap={chats}
                    onSelectChat={handleSelectChat}
                />
            ))}
        </div>
    );
}

function FolderItem({
    folder,
    chatsMap,
    onSelectChat
}: {
    folder: Folder,
    chatsMap: Map<string, Node[]>,
    onSelectChat: (id: string) => void
}) {
    const { setActiveFolderId, setActiveNodeId, triggerFolderRefresh } = useWorkspace();
    const [isOpen, setIsOpen] = useState(false);
    const [isCreateSubfolderOpen, setIsCreateSubfolderOpen] = useState(false);
    const [subfolderName, setSubfolderName] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    const hasChildren = (folder.children && folder.children.length > 0) || (chatsMap.has(folder.id) && chatsMap.get(folder.id)!.length > 0);

    const handleCreateSubfolder = async () => {
        if (!subfolderName.trim()) return;

        setIsCreating(true);
        try {
            const res = await fetch('/api/folders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: subfolderName, parentId: folder.id }),
            });

            if (res.ok) {
                setSubfolderName('');
                setIsCreateSubfolderOpen(false);
                setIsOpen(true); // Open folder to show new child
                triggerFolderRefresh();
            } else {
                console.error('Failed to create subfolder');
            }
        } catch (error) {
            console.error('Error creating subfolder:', error);
        } finally {
            setIsCreating(false);
        }
    };

    const handleNewChat = () => {
        setActiveFolderId(folder.id);
        setActiveNodeId(null);
        setIsOpen(true);
    };

    return (
        <div className="pl-2">
            <div
                className={cn(
                    "flex items-center gap-2 p-1.5 rounded hover:bg-slate-100 cursor-pointer text-sm select-none group",
                )}
                onClick={() => setIsOpen(!isOpen)}
            >
                {hasChildren ? (
                    isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />
                ) : (
                    <FolderIcon size={16} className="opacity-50" />
                )}
                <span className="truncate flex-1">{folder.name}</span>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 focus:opacity-100" title="Options">
                            <MoreHorizontal size={14} />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setIsCreateSubfolderOpen(true); }}>
                            <FolderPlus className="mr-2 h-4 w-4" />
                            New Folder
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleNewChat(); }}>
                            <MessageSquarePlus className="mr-2 h-4 w-4" />
                            New Chat
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {isOpen && (
                <div className="border-l ml-3 pl-1">
                    {chatsMap.get(folder.id)?.map(chat => (
                        <ChatItem key={chat.id} node={chat} onSelect={onSelectChat} />
                    ))}
                    {folder.children?.map(child => (
                        <FolderItem key={child.id} folder={child} chatsMap={chatsMap} onSelectChat={onSelectChat} />
                    ))}
                </div>
            )}

            <Dialog open={isCreateSubfolderOpen} onOpenChange={setIsCreateSubfolderOpen}>
                <DialogContent onClick={(e) => e.stopPropagation()}>
                    <DialogHeader>
                        <DialogTitle>Create Subfolder in "{folder.name}"</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <Input
                            placeholder="Folder Name"
                            value={subfolderName}
                            onChange={(e) => setSubfolderName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateSubfolder()}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsCreateSubfolderOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateSubfolder} disabled={isCreating || !subfolderName.trim()}>
                            Create
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function ChatItem({ node, onSelect }: { node: Node, onSelect: (id: string) => void }) {
    return (
        <div
            className="flex items-center gap-2 p-1.5 rounded hover:bg-blue-50 cursor-pointer text-sm text-slate-700 ml-2"
            onClick={(e) => {
                e.stopPropagation();
                onSelect(node.id);
            }}
        >
            <MessageSquare size={14} className="opacity-70" />
            <span className="truncate">{node.userPrompt}</span>
        </div>
    );
}
