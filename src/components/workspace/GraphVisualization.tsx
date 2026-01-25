'use client';

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import ReactFlow, {
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    Node,
    Edge,
    Handle,
    Position,
    MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import { useWorkspace } from '@/context/WorkspaceContext';
import { GitBranch, Bookmark, BookmarkCheck, Scissors, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { getChildrenCounts } from '@/lib/treeUtils';

// Custom Node Component
const CustomNode = React.memo(({ data, id }: { data: any, id: string }) => {
    const isReference = data.isReference;
    
    // Clean label: if it starts with "User:" or "AI:", remove it since titles are now descriptive
    const cleanLabel = data.label.replace(/^(User:|AI:)\s*/, '');
    
    return (
        <div className={`group/node relative px-4 py-2 shadow-md rounded-md border-2 w-[200px] text-xs ${
            data.isActive 
                ? 'border-primary ring-2 ring-ring' 
                : isReference
                    ? 'border-dashed border-muted-foreground/50 opacity-80 bg-muted/20'
                    : 'border-border bg-card'
        }`}>
            <Handle type="target" position={Position.Top} className={`w-16 ${isReference ? '!bg-muted-foreground/50' : '!bg-muted'}`} />
            <div className="text-foreground font-medium leading-tight line-clamp-3 mb-1">
                {cleanLabel}
            </div>
            {isReference && (
                <div className="mt-1 text-[10px] text-muted-foreground italic">Referenced</div>
            )}

            {/* Action Buttons */}
            {!isReference && (
                <div className="flex items-center gap-1 mt-2 opacity-0 group-hover/node:opacity-100 transition-opacity justify-center bg-background/95 backdrop-blur-sm rounded-md py-1 px-2 absolute -bottom-10 left-1/2 -translate-x-1/2 border border-border z-50 shadow-lg whitespace-nowrap">
                    {data.childrenCount > 0 && (
                        <Button 
                            variant="ghost" 
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            onClick={(e) => { e.stopPropagation(); data.onBranch(id); }}
                            title="Branch"
                        >
                            <GitBranch size={12} />
                        </Button>
                    )}
                    <Button 
                        variant="ghost" 
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            data.onToggleContext({ id, type: 'node', name: cleanLabel.slice(0, 30) + '...' }); 
                        }}
                        title={data.isContext ? "Remove from Context" : "Add to Context"}
                    >
                        {data.isContext ? (
                            <BookmarkCheck size={12} className="text-blue-500" />
                        ) : (
                            <Bookmark size={12} />
                        )}
                    </Button>
                     {data.parentId && (
                        <Button 
                            variant="ghost" 
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            onClick={(e) => { e.stopPropagation(); data.onCut(id); }}
                            title="Cut to new chat"
                        >
                            <Scissors size={12} />
                        </Button>
                    )}
                    <Button 
                        variant="ghost" 
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); data.onDelete(id, data.parentId); }}
                        title="Delete"
                    >
                        <Trash2 size={12} />
                    </Button>
                </div>
            )}

            <Handle type="source" position={Position.Bottom} className={`w-16 ${isReference ? '!bg-muted-foreground/50' : '!bg-muted'}`} />
        </div>
    );
});

const nodeTypes = {
    custom: CustomNode,
};

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB', offset = { x: 0, y: 0 }) => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    const nodeWidth = 200;
    const nodeHeight = 60;

    dagreGraph.setGraph({ rankdir: direction });

    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    // Calculate dimensions of this graph
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    const layoutedNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        node.targetPosition = Position.Top;
        node.sourcePosition = Position.Bottom;

        // Position relative to the graph's origin, plus the global offset
        const x = nodeWithPosition.x - nodeWidth / 2 + offset.x;
        const y = nodeWithPosition.y - nodeHeight / 2 + offset.y;

        node.position = { x, y };

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + nodeWidth);
        maxY = Math.max(maxY, y + nodeHeight);

        return node;
    });

    return { 
        nodes: layoutedNodes, 
        edges,
        bounds: { width: maxX - minX, height: maxY - minY, minX, minY, maxX, maxY }
    };
};

export function GraphVisualization() {
    const { 
        activeNodeId, 
        switchNode, 
        nodesById,
        triggerGraphRefresh,
        triggerFolderRefresh,
        contextItems, 
        toggleContextItem 
    } = useWorkspace();
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [nodeToDelete, setNodeToDelete] = useState<{ id: string, parentId: string | null } | null>(null);

    // Action Handlers
    const handleBranch = useCallback((nodeId: string) => {
        switchNode(nodeId);
    }, [switchNode]);

    const handleCutToNewChat = useCallback(async (nodeId: string) => {
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
    }, [triggerFolderRefresh, triggerGraphRefresh]);

    const handleDeleteClick = useCallback((nodeId: string, parentId: string | null) => {
        setNodeToDelete({ id: nodeId, parentId });
    }, []);

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

    const buildGraph = useCallback(async () => {
        let allNodes: Node[] = [];
        let allEdges: Edge[] = [];
        let currentYOffset = 0;
        
        // 1. Build Main Active Graph from Memory
        const activeGraphNodes = Array.from(nodesById.values());
        
        if (activeGraphNodes.length > 0) {
            const childrenCounts = getChildrenCounts(nodesById);
            
            const flowNodes: Node[] = activeGraphNodes.map((n: any) => ({
                id: n.id,
                type: 'custom',
                position: { x: 0, y: 0 },
                data: {
                    label: n.summary || (n.userPrompt ? `User: ${n.userPrompt}` : `AI: ${n.aiResponse || '...'}`),
                    isActive: n.id === activeNodeId,
                    references: n.references,
                    parentId: n.parentId,
                    childrenCount: childrenCounts.get(n.id) || 0,
                    isContext: contextItems.some(i => i.id === n.id),
                    onBranch: handleBranch,
                    onToggleContext: toggleContextItem,
                    onCut: handleCutToNewChat,
                    onDelete: handleDeleteClick
                },
            }));

            const flowEdges: Edge[] = activeGraphNodes
                .filter((n: any) => n.parentId)
                .map((n: any) => ({
                    id: `${n.parentId}-${n.id}`,
                    source: n.parentId,
                    target: n.id,
                    type: 'smoothstep',
                    markerEnd: { type: MarkerType.ArrowClosed },
                }));

            const layouted = getLayoutedElements(flowNodes, flowEdges, 'TB', { x: 0, y: 0 });
            allNodes = [...allNodes, ...layouted.nodes];
            allEdges = [...allEdges, ...layouted.edges];
            
            if (layouted.bounds.height > 0) {
                currentYOffset += layouted.bounds.height + 100; // Spacing
            }
        }

        // 2. Resolve Referenced Nodes
        const contextRoots = new Set<string>(); // Full trees from folder context
        const referencedNodeIds = new Set<string>(); // Individual nodes from references
        const referenceEdges: Array<{ sourceId: string, targetId: string }> = []; // Track reference edges

        const addReference = async (refId: string, type: string, sourceNodeId?: string) => {
            if (type === 'folder') {
                try {
                    const res = await fetch(`/api/nodes?folderId=${refId}&recursive=true`);
                    if (res.ok) {
                        const folderNodes = await res.json();
                        folderNodes.forEach((n: any) => {
                             if (!n.parentId) {
                                 contextRoots.add(n.id);
                             }
                        });
                    }
                } catch (e) {}
            } else {
                const isInActiveGraph = nodesById.has(refId);
                if (!isInActiveGraph) {
                    referencedNodeIds.add(refId);
                }
                if (sourceNodeId) {
                    referenceEdges.push({ sourceId: sourceNodeId, targetId: refId });
                }
            }
        };

        // a) UI Context Items
        await Promise.all(contextItems.map(item => addReference(item.id, item.type, activeNodeId || undefined)));

        // b) & c) References in Active Graph History
        await Promise.all(activeGraphNodes.map(async (node) => {
            if (node.references && Array.isArray(node.references)) {
                await Promise.all(node.references.map((ref: any) => 
                    addReference(ref.id, ref.type, node.id)
                ));
            }
        }));

        // Fetch and layout full context trees
        const contextGraphPromises = Array.from(contextRoots).map(async (rootId) => {
             try {
                 const res = await fetch(`/api/graph/${rootId}`);
                 if (res.ok) {
                     return { rootId, treeData: await res.json() };
                 }
             } catch (e) {
                 console.error(`Error fetching context graph ${rootId}`, e);
             }
             return null;
        });

        const contextResults = await Promise.all(contextGraphPromises);

        for (const result of contextResults) {
            if (!result) continue;
            const { rootId, treeData } = result;
                    
            const flowNodes: Node[] = treeData.map((n: any) => ({
                id: n.id,
                type: 'custom',
                position: { x: 0, y: 0 },
                data: {
                    label: n.summary || (n.userPrompt ? `User: ${n.userPrompt}` : `AI: ${n.aiResponse || '...'}`),
                    isActive: false,
                    isReference: true
                },
            }));

            const flowEdges: Edge[] = treeData
                .filter((n: any) => n.parentId)
                .map((n: any) => ({
                    id: `${n.parentId}-${n.id}`,
                    source: n.parentId,
                    target: n.id,
                    type: 'smoothstep',
                    markerEnd: { type: MarkerType.ArrowClosed },
                    animated: true,
                    style: { strokeDasharray: '5,5', opacity: 0.5 }
                }));

            const layouted = getLayoutedElements(flowNodes, flowEdges, 'TB', { x: 0, y: currentYOffset });
            allNodes = [...allNodes, ...layouted.nodes];
            allEdges = [...allEdges, ...layouted.edges];

            if (layouted.bounds.height > 0) {
                    currentYOffset += layouted.bounds.height + 50;
            }
        }

        // Fetch and add individual referenced nodes
        const referencedNodesPromises = Array.from(referencedNodeIds).map(async (nodeId) => {
            try {
                const res = await fetch(`/api/graph/${nodeId}`);
                if (res.ok) {
                    const treeData = await res.json();
                    return treeData.find((n: any) => n.id === nodeId);
                }
            } catch (e) {
                console.error(`Error fetching referenced node ${nodeId}`, e);
            }
            return null;
        });

        const referencedNodesData = await Promise.all(referencedNodesPromises);

        referencedNodesData.forEach((nodeData, index) => {
            if (!nodeData) return;
            
            const xPosition = index * 250;
            
            allNodes.push({
                id: nodeData.id,
                type: 'custom',
                position: { x: xPosition, y: currentYOffset },
                data: {
                    label: nodeData.summary || (nodeData.userPrompt ? `User: ${nodeData.userPrompt}` : `AI: ${nodeData.aiResponse || '...'}`),
                    isActive: false,
                    isReference: true
                },
            });
        });
        
        if (referencedNodeIds.size > 0) {
            currentYOffset += 100;
        }

        referenceEdges.forEach(({ sourceId, targetId }) => {
            const sourceExists = allNodes.find(n => n.id === sourceId);
            const targetExists = allNodes.find(n => n.id === targetId);
            
            if (sourceExists && targetExists) {
                allEdges.push({
                    id: `ref-${sourceId}-${targetId}`,
                    source: sourceId,
                    target: targetId,
                    type: 'default',
                    animated: true,
                    style: { stroke: '#94a3b8', strokeDasharray: '5,5', opacity: 0.6 },
                    label: 'Ref'
                });
            }
        });

        setNodes(allNodes);
        setEdges(allEdges);

    }, [nodesById, activeNodeId, contextItems, handleBranch, toggleContextItem, handleCutToNewChat, handleDeleteClick, setNodes, setEdges]);

    // Rebuild graph when dependencies change
    useEffect(() => {
        buildGraph();
    }, [buildGraph]);

    const onNodeClick = (_: React.MouseEvent, node: Node) => {
        switchNode(node.id);
    };

    if (!activeNodeId && contextItems.length === 0) {
        return (
            <div className="h-full bg-background border-l border-border p-4 flex items-center justify-center text-muted-foreground">
                Select a chat or add contexts to view
            </div>
        );
    }

    return (
        <div className="h-full bg-background border-l border-border w-full relative">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={onNodeClick}
                nodeTypes={nodeTypes}
                fitView
            >
                <Background />
            </ReactFlow>

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
