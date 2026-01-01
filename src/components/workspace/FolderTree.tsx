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
    const { setActiveFolderId, setActiveNodeId, folderRefreshTrigger, graphRefreshTrigger, triggerFolderRefresh } = useWorkspace();
    const [activeDragItem, setActiveDragItem] = useState<{ type: 'FOLDER' | 'CHAT', id: string, name: string } | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    );

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
                        <DraggableChatItem key={chat.id} node={chat} onSelect={handleSelectChat} />
                    ))}

                    {folders.map(folder => (
                        <FolderItem
                            key={folder.id}
                            folder={folder}
                            chatsMap={chats}
                            onSelectChat={handleSelectChat}
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
        <div ref={setNodeRef} className={cn("h-full", isOver ? "bg-slate-50/50" : "")}>
            {children}
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

    const handleNewChat = () => {
        setActiveFolderId(folder.id);
        setActiveNodeId(null);
        setIsOpen(true);
    };

    if (isDragging) {
        return <div ref={setDraggableRef} className="opacity-50 pl-2 p-1.5 text-sm text-slate-400 border border-dashed border-slate-300 rounded mb-1">{folder.name}</div>
    }

    return (
        <div className="pl-2" ref={setDroppableRef}>
            <div
                ref={setDraggableRef}
                {...listeners}
                {...attributes}
                className={cn(
                    "flex items-center gap-2 p-1.5 rounded hover:bg-slate-100 cursor-pointer text-sm select-none group",
                    isOver && "bg-blue-50 ring-1 ring-blue-300"
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
                    className="cursor-pointer hover:bg-slate-200 rounded p-0.5"
                >
                    {hasChildren ? (
                        isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />
                    ) : (
                        <FolderIcon size={16} className="opacity-50" />
                    )}
                </span>
                
                <span className="truncate flex-1">{folder.name}</span>

                {/* Dropdown menu needs to stop propagation of drag events if necessary, but simpler to just work */}
                <div onPointerDown={(e) => e.stopPropagation()}>
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
            </div>

            {isOpen && (
                <div className="border-l ml-3 pl-1">
                    {chatsMap.get(folder.id)?.map(chat => (
                        <DraggableChatItem key={chat.id} node={chat} onSelect={onSelectChat} />
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

function DraggableChatItem({ node, onSelect }: { node: Node, onSelect: (id: string) => void }) {
    const { activeNodeId } = useWorkspace();
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: node.id,
        data: { type: 'CHAT', id: node.id, name: node.userPrompt, folderId: node.folderId }
    });

    if (isDragging) {
         return <div ref={setNodeRef} className="opacity-50 ml-2 p-1.5 text-sm text-slate-400 border border-dashed border-slate-300 rounded mb-1">{node.userPrompt}</div>
    }

    const isActive = activeNodeId === node.id;

    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            className={cn(
                "flex items-center gap-2 p-1.5 rounded cursor-pointer text-sm ml-2",
                isActive 
                    ? "bg-blue-100 text-blue-900 font-medium" 
                    : "text-slate-700 hover:bg-blue-50"
            )}
            onClick={(e) => {
                // Prevent drag start if just clicking, but dnd-kit handles this well usually. 
                // e.stopPropagation here might block drag.
                // We'll rely on dnd-kit's activation constraints if needed, but default works for now.
                // However, we need to distinguish click from drag. Dnd-kit suppresses click on drag.
                onSelect(node.id);
            }}
        >
            <MessageSquare size={14} className={cn("opacity-70", isActive && "text-blue-700 opacity-100")} />
            <span className="truncate">{node.userPrompt}</span>
        </div>
    );
}
