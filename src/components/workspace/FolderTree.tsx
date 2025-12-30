'use client';

import React, { useEffect, useState } from 'react';
import { Folder, Node } from '@/types';
import { ChevronRight, ChevronDown, Folder as FolderIcon, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/context/WorkspaceContext';

export function FolderTree() {
    const [folders, setFolders] = useState<Folder[]>([]);
    const [chats, setChats] = useState<Map<string, Node[]>>(new Map());
    const [loading, setLoading] = useState(true);
    const { setActiveFolderId, setActiveNodeId } = useWorkspace();

    useEffect(() => {
        fetchData();
    }, []);

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
    const [isOpen, setIsOpen] = useState(false);
    const hasChildren = (folder.children && folder.children.length > 0) || (chatsMap.has(folder.id) && chatsMap.get(folder.id)!.length > 0);

    return (
        <div className="pl-2">
            <div
                className={cn(
                    "flex items-center gap-2 p-1.5 rounded hover:bg-slate-100 cursor-pointer text-sm select-none",
                )}
                onClick={() => setIsOpen(!isOpen)}
            >
                {hasChildren ? (
                    isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />
                ) : (
                    <FolderIcon size={16} className="opacity-50" />
                )}
                <span className="truncate">{folder.name}</span>
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
