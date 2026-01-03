'use client';

import React, { useEffect, useState } from 'react';
import { Folder, Node } from '@/types';
import { ChevronRight, ChevronDown, Folder as FolderIcon, MessageSquare, MoreHorizontal, FolderPlus, MessageSquarePlus, Loader2, Edit2, Trash2, Bookmark, BookmarkCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkspace } from '@/context/WorkspaceContext';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    DndContext,
    DragOverlay,
    useDraggable,
    useDroppable,
    DragEndEvent,
    DragStartEvent,
    useSensor,
    useSensors,
    PointerSensor,
} from '@dnd-kit/core';

export function FolderTree() {
    const [folders, setFolders] = useState<Folder[]>([]);
    const [chats, setChats] = useState<Map<string, Node[]>>(new Map());
    const [loading, setLoading] = useState(true);
    const { activeNodeId, setActiveFolderId, setActiveNodeId, folderRefreshTrigger, graphRefreshTrigger, triggerFolderRefresh } = useWorkspace();
    const [activeDragItem, setActiveDragItem] = useState<{ type: 'FOLDER' | 'CHAT', id: string, name: string } | null>(null);
    const [activeRootId, setActiveRootId] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    );

    useEffect(() => {
        if (!activeNodeId) {
            setActiveRootId(null);
            return;
        }

        // Check if activeNodeId is a known root
        let isKnownRoot = false;
        for (const [_, nodes] of chats) {
            if (nodes.some(n => n.id === activeNodeId)) {
                setActiveRootId(activeNodeId);
                isKnownRoot = true;
                break;
            }
        }

        if (isKnownRoot) return;

        // If not a known root, fetch ancestry to find the root
        const findRoot = async () => {
            try {
                const res = await fetch(`/api/graph/${activeNodeId}?direction=ancestors`);
                if (res.ok) {
                    const ancestors = await res.json();
                    const root = ancestors.find((n: any) => !n.parentId);
                    if (root) {
                        setActiveRootId(root.id);
                    }
                }
            } catch (error) {
                console.error('Failed to find root for highlighting', error);
            }
        };

        findRoot();
    }, [activeNodeId, chats]);

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
    };

    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event;
        const { id, type, name } = active.data.current as { type: 'FOLDER' | 'CHAT', id: string, name: string };
        setActiveDragItem({ type, id, name });
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveDragItem(null);

        if (!over) return;

        const activeId = active.id as string;
        const overId = over.id as string;
        const type = active.data.current?.type;

        // Prevent dropping on itself or its own children (for folders) logic is handled server-side or requires more complex check.
        // For now, simple check: don't drop on itself.
        if (activeId === overId) return;

        // Determine target folder ID
        // If overId is 'root-droppable', target is null (root).
        // Otherwise, target is the folder ID.
        let targetFolderId: string | null = overId === 'root-droppable' ? null : overId;

        // Optimistic update could happen here, but triggering refresh is safer.
        
        try {
            let res;
            if (type === 'FOLDER') {
                 res = await fetch('/api/folders', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: activeId, parentId: targetFolderId }),
                });
            } else if (type === 'CHAT') {
                 res = await fetch('/api/nodes', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: activeId, folderId: targetFolderId }),
                });
            }

            if (res && res.ok) {
                triggerFolderRefresh();
            } else {
                console.error("Failed to move item");
            }
        } catch (error) {
             console.error("Error moving item:", error);
        }
    };

    if (loading) return <div className="p-2 text-sm text-muted-foreground">Loading...</div>;

    return (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="space-y-1 min-h-[100px] relative">
                 {/* Root Droppable Area - covers the whole area but sits behind */}
                 <RootDroppable>
                    {/* Root level chats */}
                    {chats.get('root')?.map(chat => (
                        <DraggableChatItem key={chat.id} node={chat} onSelect={handleSelectChat} activeRootId={activeRootId} />
                    ))}

                    {folders.map(folder => (
                        <FolderItem
                            key={folder.id}
                            folder={folder}
                            chatsMap={chats}
                            onSelectChat={handleSelectChat}
                            activeRootId={activeRootId}
                        />
                    ))}
                 </RootDroppable>
            </div>
            <DragOverlay>
                {activeDragItem ? (
                     <div className="bg-white border rounded shadow-lg p-2 opacity-80 flex items-center gap-2 pointer-events-none">
                        {activeDragItem.type === 'FOLDER' ? <FolderIcon size={16} /> : <MessageSquare size={16} />}
                        <span className="text-sm font-medium">{activeDragItem.name}</span>
                     </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}

function RootDroppable({ children }: { children: React.ReactNode }) {
    const { setNodeRef, isOver } = useDroppable({
        id: 'root-droppable',
        data: { type: 'FOLDER', id: 'root' }
    });
    
    return (
        <div ref={setNodeRef} className={cn("h-full", isOver ? "bg-sidebar-accent/50" : "")}>
            {children}
        </div>
    );
}

function isChatInFolder(folder: Folder, chatId: string, chatsMap: Map<string, Node[]>): boolean {
    // Check if chat is in current folder
    const chatsInThisFolder = chatsMap.get(folder.id);
    if (chatsInThisFolder && chatsInThisFolder.some(c => c.id === chatId)) {
        return true;
    }

    // Check subfolders
    if (folder.children) {
        for (const child of folder.children) {
            if (isChatInFolder(child, chatId, chatsMap)) {
                return true;
            }
        }
    }

    return false;
}

function FolderItem({
    folder,
    chatsMap,
    onSelectChat,
    activeRootId
}: {
    folder: Folder,
    chatsMap: Map<string, Node[]>,
    onSelectChat: (id: string) => void,
    activeRootId: string | null
}) {
    const { setActiveFolderId, setActiveNodeId, triggerFolderRefresh, activeNodeId, contextItems, toggleContextItem } = useWorkspace();
    const [isOpen, setIsOpen] = useState(false);
    
    // Check if folder is in context
    const isContextSelected = contextItems.some(i => i.id === folder.id && i.type === 'folder');

    // Create Subfolder State
    const [isCreateSubfolderOpen, setIsCreateSubfolderOpen] = useState(false);
    const [subfolderName, setSubfolderName] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    // Rename State
    const [isRenameOpen, setIsRenameOpen] = useState(false);
    const [newName, setNewName] = useState(folder.name);
    const [isRenaming, setIsRenaming] = useState(false);

    // Delete State
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const hasChildren = (folder.children && folder.children.length > 0) || (chatsMap.has(folder.id) && chatsMap.get(folder.id)!.length > 0);

    // Draggable
    const { attributes, listeners, setNodeRef: setDraggableRef, isDragging } = useDraggable({
        id: folder.id,
        data: { type: 'FOLDER', id: folder.id, name: folder.name, parentId: folder.parentId }
    });

    // Droppable
    const { setNodeRef: setDroppableRef, isOver } = useDroppable({
        id: folder.id,
        data: { type: 'FOLDER', id: folder.id }
    });

    // Auto-expand folder on hover while dragging
    useEffect(() => {
        let timeout: NodeJS.Timeout;
        if (isOver && !isOpen) {
            timeout = setTimeout(() => {
                setIsOpen(true);
            }, 1000);
        }
        return () => clearTimeout(timeout);
    }, [isOver, isOpen]);

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

    const handleRename = async () => {
        if (!newName.trim() || newName === folder.name) return;
        setIsRenaming(true);
        try {
            const res = await fetch('/api/folders', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: folder.id, name: newName }),
            });
            if (res.ok) {
                setIsRenameOpen(false);
                triggerFolderRefresh();
            }
        } catch (error) {
            console.error("Rename failed", error);
        } finally {
            setIsRenaming(false);
        }
    };

    const handleDelete = async () => {
        setIsDeleting(true);
        // Check if the active chat is within this folder or its subfolders
        const isActiveChatInFolder = activeNodeId ? isChatInFolder(folder, activeNodeId, chatsMap) : false;

        try {
            const res = await fetch(`/api/folders?id=${folder.id}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                setIsDeleteOpen(false);
                triggerFolderRefresh();
                
                // If the deleted folder contained the active chat, reset it
                if (isActiveChatInFolder) {
                    setActiveNodeId(null);
                }
                
                // If this was the active folder for creation, reset it
                setActiveFolderId(null);
            }
        } catch (error) {
            console.error("Delete failed", error);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleNewChat = () => {
        setActiveFolderId(folder.id);
        setActiveNodeId(null);
        setIsOpen(true);
    };

    if (isDragging) {
        return <div ref={setDraggableRef} className="opacity-50 pl-2 p-1.5 text-sm text-muted-foreground border border-dashed border-sidebar-border rounded mb-1">{folder.name}</div>
    }

    return (
        <div className="pl-2" ref={setDroppableRef}>
            <div
                ref={setDraggableRef}
                {...listeners}
                {...attributes}
                className={cn(
                    "flex items-center gap-2 p-1.5 rounded hover:bg-sidebar-accent cursor-pointer text-sm select-none group",
                    isOver && "bg-sidebar-accent ring-1 ring-sidebar-ring"
                )}
                onClick={() => setIsOpen(!isOpen)}
            >
                {/* Arrow Toggle */}
                <span
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsOpen(!isOpen);
                    }}
                    className="cursor-pointer hover:bg-sidebar-accent/80 rounded p-0.5"
                >
                    {hasChildren ? (
                        isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />
                    ) : (
                        <FolderIcon size={16} className="opacity-50" />
                    )}
                </span>
                
                <span className="truncate flex-1 flex items-center gap-2">
                    {folder.name}
                    {isContextSelected && <BookmarkCheck size={14} className="text-blue-500" />}
                </span>

                {/* Dropdown menu */}
                <div onPointerDown={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 focus:opacity-100" title="Options">
                                <MoreHorizontal size={14} />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-48">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); toggleContextItem({ id: folder.id, type: 'folder', name: folder.name }); }}>
                                <Bookmark className="mr-2 h-4 w-4" />
                                {isContextSelected ? "Remove from Context" : "Add to Context"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setIsCreateSubfolderOpen(true); }}>
                                <FolderPlus className="mr-2 h-4 w-4" />
                                New Folder
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleNewChat(); }}>
                                <MessageSquarePlus className="mr-2 h-4 w-4" />
                                New Chat
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setNewName(folder.name); setIsRenameOpen(true); }}>
                                <Edit2 className="mr-2 h-4 w-4" />
                                Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setIsDeleteOpen(true); }} className="text-destructive focus:text-destructive">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {isOpen && (
                <div className="border-l ml-3 pl-1">
                    {chatsMap.get(folder.id)?.map(chat => (
                        <DraggableChatItem key={chat.id} node={chat} onSelect={onSelectChat} activeRootId={activeRootId} />
                    ))}
                    {folder.children?.map(child => (
                        <FolderItem key={child.id} folder={child} chatsMap={chatsMap} onSelectChat={onSelectChat} activeRootId={activeRootId} />
                    ))}
                </div>
            )}

            {/* Create Subfolder Dialog */}
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

            {/* Rename Dialog */}
            <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
                <DialogContent onClick={(e) => e.stopPropagation()}>
                    <DialogHeader>
                        <DialogTitle>Rename Folder</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <Input
                            placeholder="Folder Name"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsRenameOpen(false)}>Cancel</Button>
                        <Button onClick={handleRename} disabled={isRenaming || !newName.trim()}>
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                <DialogContent onClick={(e) => e.stopPropagation()}>
                    <DialogHeader>
                        <DialogTitle>Delete Folder?</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete "{folder.name}"? This will recursively delete all subfolders and chats inside it. This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsDeleteOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function DraggableChatItem({ node, onSelect, activeRootId }: { node: Node, onSelect: (id: string) => void, activeRootId: string | null }) {
    const { activeNodeId, triggerFolderRefresh, setActiveNodeId, contextItems, toggleContextItem } = useWorkspace();
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: node.id,
        data: { type: 'CHAT', id: node.id, name: node.summary || node.userPrompt, folderId: node.folderId }
    });

    const isContextSelected = contextItems.some(i => i.id === node.id && i.type === 'chat');

    const [isRenameOpen, setIsRenameOpen] = useState(false);
    const [newName, setNewName] = useState(node.summary || "New Chat");
    const [isRenaming, setIsRenaming] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleRename = async () => {
        if (!newName.trim()) return;
        setIsRenaming(true);
        try {
            const res = await fetch('/api/nodes', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: node.id, summary: newName }),
            });
            if (res.ok) {
                setIsRenameOpen(false);
                triggerFolderRefresh();
            }
        } catch (error) {
            console.error("Rename chat failed", error);
        } finally {
            setIsRenaming(false);
        }
    };

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/nodes?id=${node.id}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                setIsDeleteOpen(false);
                if (activeNodeId === node.id) {
                    setActiveNodeId(null);
                }
                triggerFolderRefresh();
            }
        } catch (error) {
            console.error("Delete chat failed", error);
        } finally {
            setIsDeleting(false);
        }
    };

    if (isDragging) {
         return <div ref={setNodeRef} className="opacity-50 ml-2 p-1.5 text-sm text-muted-foreground border border-dashed border-sidebar-border rounded mb-1">{node.summary || "New Chat"}</div>
    }

    const isActive = activeNodeId === node.id || activeRootId === node.id;

    return (
        <>
            <div
                ref={setNodeRef}
                {...listeners}
                {...attributes}
                className={cn(
                    "flex items-center gap-2 p-1.5 rounded cursor-pointer text-sm ml-2 group",
                    isActive 
                        ? "bg-blue-100 text-blue-900 font-medium dark:bg-blue-900/40 dark:text-blue-100" 
                        : "text-sidebar-foreground hover:bg-sidebar-accent"
                )}
                onClick={(e) => {
                    onSelect(node.id);
                }}
            >
                {node.summary ? (
                    <>
                        <MessageSquare size={14} className={cn("opacity-70 flex-shrink-0", isActive && "text-blue-700 dark:text-blue-300 opacity-100")} />
                        <span className="truncate flex-1 flex items-center gap-2">
                            {node.summary}
                            {isContextSelected && <BookmarkCheck size={14} className="text-blue-500" />}
                        </span>
                        
                        <div onPointerDown={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                    <Button variant="ghost" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 focus:opacity-100" title="Options">
                                        <MoreHorizontal size={14} />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-48">
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); toggleContextItem({ id: node.id, type: 'chat', name: node.summary || "Chat" }); }}>
                                        <Bookmark className="mr-2 h-4 w-4" />
                                        {isContextSelected ? "Remove from Context" : "Add to Context"}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setNewName(node.summary || "New Chat"); setIsRenameOpen(true); }}>
                                        <Edit2 className="mr-2 h-4 w-4" />
                                        Rename
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setIsDeleteOpen(true); }} className="text-destructive focus:text-destructive">
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </>
                ) : (
                    <div className="flex items-center gap-2 w-full">
                        <Loader2 size={14} className="animate-spin text-muted-foreground flex-shrink-0" />
                        <Skeleton className="h-4 w-24 bg-sidebar-accent" />
                    </div>
                )}
            </div>

             {/* Rename Chat Dialog */}
             <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
                <DialogContent onClick={(e) => e.stopPropagation()}>
                    <DialogHeader>
                        <DialogTitle>Rename Chat</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <Input
                            placeholder="Chat Name"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsRenameOpen(false)}>Cancel</Button>
                        <Button onClick={handleRename} disabled={isRenaming || !newName.trim()}>
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Chat Dialog */}
            <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                <DialogContent onClick={(e) => e.stopPropagation()}>
                    <DialogHeader>
                        <DialogTitle>Delete Chat?</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete this chat? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsDeleteOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
