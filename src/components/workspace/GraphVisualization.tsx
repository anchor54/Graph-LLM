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
    Connection,
    useViewport,
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import { useWorkspace } from '@/context/WorkspaceContext';
import {
    GitBranch, Bookmark, BookmarkCheck, Scissors, Trash2,
    CheckCircle, Lightbulb, HelpCircle, AlertTriangle, ArrowRightCircle,
    Link as LinkIcon, Minimize2, Maximize2, ChevronRight, Plus, Quote
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { getChildrenCounts, getDescendants } from '@/lib/treeUtils';

// Classification Icons
const StateIcon = ({ type }: { type?: string }) => {
    if (!type) return null;
    switch (type) {
        case 'decision': return <CheckCircle size={14} className="text-green-500" />;
        case 'insight': return <Lightbulb size={14} className="text-yellow-500" />;
        case 'open_question': return <HelpCircle size={14} className="text-blue-500" />;
        case 'risk': return <AlertTriangle size={14} className="text-red-500" />;
        case 'follow_up': return <ArrowRightCircle size={14} className="text-purple-500" />;
        default: return null;
    }
};

// Custom Node Component
const CustomNode = React.memo(({ data, id }: { data: any, id: string }) => {
    const { zoom } = useViewport();

    // Handle Collapsed Placeholder
    if (data.isCollapsedPlaceholder) {
        return (
            <div
                className="group/node relative px-3 py-2 shadow-sm rounded-md border border-dashed border-primary/50 bg-primary/5 w-[180px] text-xs flex items-center gap-2 cursor-pointer hover:bg-primary/10 transition-colors"
                onClick={(e) => { e.stopPropagation(); data.onExpand(); }}
            >
                <Handle type="target" position={Position.Top} className="!bg-primary/20 w-8" />
                <ChevronRight size={14} className="text-primary" />
                <span className="font-medium text-primary">{data.label}</span>
            </div>
        );
    }

    // Handle Draft Node
    if (data.isDraft) {
        return (
            <div className="group/node relative px-4 py-2 shadow-sm rounded-md border-2 border-dashed border-muted-foreground/30 w-[220px] bg-muted/10 flex items-center justify-center h-[80px] hover:bg-muted/20 transition-colors">
                <Handle type="target" position={Position.Top} className="!bg-muted-foreground/30 w-16" />
                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                        <Plus size={14} />
                        <span className="text-xs font-medium uppercase tracking-wider">New Message</span>
                    </div>
                    {data.draftText ? (
                        <span className="text-[10px] italic opacity-90 line-clamp-2 px-2 text-center text-foreground">{data.draftText}</span>
                    ) : (
                        <span className="text-[10px] italic opacity-70">Drag here to reference</span>
                    )}
                </div>
            </div>
        );
    }

    const isReference = data.isReference;
    const isHovered = data.isHovered;
    const isActive = data.isActive;
    const isCollapsed = data.isCollapsed;

    const showReference = isHovered && isActive && (isReference || (data.references && data.references.length > 0));

    // Clean label
    const cleanLabel = data.label.replace(/^(User:|AI:)\s*/, '');

    return (
        <div className={`group/node relative px-4 py-2 shadow-md rounded-md border-2 w-[220px] bg-card transition-all duration-200 ${isActive
            ? 'border-primary ring-2 ring-ring z-20'
            : isReference
                ? 'border-dashed border-muted-foreground/50 opacity-80 bg-muted/20'
                : 'border-border hover:border-primary/50 z-10'
            }`}>
            <Handle type="target" position={Position.Top} className={`w-16 ${isReference ? '!bg-muted-foreground/50' : '!bg-muted'}`} />

            {/* Header: Classification + Label */}
            <div className="flex items-start gap-2">
                {(data.classification) && (
                    <div className="mt-0.5 shrink-0" title={data.classification}>
                        <StateIcon type={data.classification} />
                    </div>
                )}
                <div className={`text-foreground font-medium leading-tight ${isHovered ? '' : 'line-clamp-2'} text-xs`}>
                    {cleanLabel}
                </div>
            </div>

            {/* Popover Side Box */}
            {isHovered && ((data.topics?.length > 0) || (data.previewBullets?.length > 0)) && (
                <div className="absolute left-[105%] top-[-2px] w-[200px] bg-popover text-popover-foreground p-3 rounded-md shadow-xl border border-border z-50 pointer-events-none animate-in fade-in zoom-in-95 duration-200">
                    {/* Topics */}
                    {data.topics && data.topics.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                            {data.topics.map((t: string, i: number) => (
                                <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-secondary text-secondary-foreground">
                                    {t}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Bullets */}
                    {data.previewBullets && data.previewBullets.length > 0 && (
                        <div className="space-y-1 mb-2">
                            {data.previewBullets.map((b: string, i: number) => (
                                <div key={i} className="text-[10px] text-muted-foreground flex items-start gap-1">
                                    <span className="mt-1 block h-1 w-1 rounded-full bg-muted-foreground/50 shrink-0" />
                                    <span>{b}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Quotes/Citations */}
                    {data.modelMetadata?.citations && data.modelMetadata.citations.length > 0 && (
                        <div className="space-y-1 border-t border-border pt-2">
                            {data.modelMetadata.citations.map((c: any, i: number) => (
                                <div key={i} className="text-[10px] text-muted-foreground flex items-start gap-1 italic">
                                    <Quote size={8} className="mt-0.5 shrink-0 text-primary" />
                                    <span className="line-clamp-3">"{c.text}"</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Reference Indicator */}
            {showReference && (
                <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground italic">
                    <LinkIcon size={10} />
                    {isReference ? 'Referenced Node' : `${data.references.length} Refs`}
                </div>
            )}

            {/* Action Buttons */}
            {!isReference && (
                <div className="flex items-center gap-1 mt-2 opacity-0 group-hover/node:opacity-100 transition-opacity justify-center bg-background/95 backdrop-blur-sm rounded-md py-1 px-2 absolute -bottom-10 left-1/2 -translate-x-1/2 border border-border z-50 shadow-lg whitespace-nowrap pointer-events-auto">
                    {/* Collapse Toggle */}
                    {data.childrenCount > 0 && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            onClick={(e) => { e.stopPropagation(); data.onToggleCollapse(id); }}
                            title={isCollapsed ? "Expand" : "Collapse Branch"}
                        >
                            {isCollapsed ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
                        </Button>
                    )}

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

    const nodeWidth = 220;
    const nodeHeight = 80;

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
        toggleContextItem,
        draftInput
    } = useWorkspace();
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [nodeToDelete, setNodeToDelete] = useState<{ id: string, parentId: string | null } | null>(null);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());

    // Load collapse state
    useEffect(() => {
        try {
            const stored = localStorage.getItem('collapsed_nodes');
            if (stored) {
                setCollapsedNodeIds(new Set(JSON.parse(stored)));
            }
        } catch (e) { }
    }, []);

    // Action Handlers
    const toggleCollapse = useCallback((nodeId: string) => {
        setCollapsedNodeIds(prev => {
            const next = new Set(prev);
            if (next.has(nodeId)) {
                next.delete(nodeId);
            } else {
                next.add(nodeId);
            }
            localStorage.setItem('collapsed_nodes', JSON.stringify(Array.from(next)));
            return next;
        });
    }, []);

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

    const onConnect = useCallback((params: Connection) => {
        if (params.target === 'draft-node') {
            // Add params.source to context
            const sourceNode = nodesById.get(params.source || '') || nodes.find(n => n.id === params.source)?.data;

            // If not in nodesById, might be a context node provided in 'nodes' array but we need its details
            // Actually, context items are already references, but if user drags from a context tree node to draft node...

            if (sourceNode) {
                // Check if it's a real node
                toggleContextItem({
                    id: params.source || '',
                    type: 'node',
                    name: (sourceNode.summary || sourceNode.userPrompt || 'Reference').slice(0, 30) + '...'
                });
            } else {
                // Try to find in nodes array (e.g. context tree nodes)
                const nodeInGraph = nodes.find(n => n.id === params.source);
                if (nodeInGraph) {
                    toggleContextItem({
                        id: params.source || '',
                        type: 'node',
                        name: (nodeInGraph.data.label || 'Reference').slice(0, 30) + '...'
                    });
                }
            }
        }
    }, [nodesById, nodes, toggleContextItem]);

    const buildGraph = useCallback(async () => {
        let allNodes: Node[] = [];
        let allEdges: Edge[] = [];
        let currentYOffset = 0;

        // 1. Build Main Active Graph from Memory
        const activeGraphNodes = activeNodeId ? Array.from(nodesById.values()) : [];

        if (activeGraphNodes.length > 0) {
            const childrenCounts = getChildrenCounts(nodesById);

            // --- Subtree Collapsing Logic ---
            const hiddenNodeIds = new Set<string>();
            const collapsedPlaceholders: Node[] = [];

            activeGraphNodes.forEach(node => {
                if (collapsedNodeIds.has(node.id)) {
                    // If node is already hidden, we don't process it (it's inside another collapsed tree)
                    if (hiddenNodeIds.has(node.id)) return;

                    const descendants = getDescendants(nodesById, node.id);
                    descendants.forEach(id => hiddenNodeIds.add(id));

                    // Add placeholder
                    if (descendants.size > 0) {
                        collapsedPlaceholders.push({
                            id: `collapsed-${node.id}`,
                            type: 'custom',
                            position: { x: 0, y: 0 },
                            data: {
                                label: `${descendants.size} turns`, // Short label for placeholder
                                isCollapsedPlaceholder: true,
                                parentId: node.id,
                                onExpand: () => toggleCollapse(node.id),
                            }
                        });
                    }
                }
            });

            const visibleNodes = activeGraphNodes.filter(n => !hiddenNodeIds.has(n.id));

            const flowNodes: Node[] = [
                ...visibleNodes.map((n: any) => ({
                    id: n.id,
                    type: 'custom',
                    position: { x: 0, y: 0 },
                    data: {
                        label: n.nodeTitle || n.summary || (n.userPrompt ? `User: ${n.userPrompt}` : `AI: ${n.aiResponse || '...'}`),
                        isActive: n.id === activeNodeId,
                        isHovered: false,
                        isCollapsed: collapsedNodeIds.has(n.id),
                        topics: n.topics,
                        classification: n.classification,
                        previewBullets: n.previewBullets,
                        references: n.references,
                        parentId: n.parentId,
                        childrenCount: childrenCounts.get(n.id) || 0,
                        isContext: contextItems.some(i => i.id === n.id),
                        onBranch: handleBranch,
                        onToggleContext: toggleContextItem,
                        onCut: handleCutToNewChat,
                        onDelete: handleDeleteClick,
                        onToggleCollapse: toggleCollapse,
                        modelMetadata: n.modelMetadata
                    },
                })),
                ...collapsedPlaceholders.map(p => ({
                    ...p,
                    data: {
                        ...p.data,
                        // Ensure required handlers for safety, though placeholder doesn't use them all
                        isActive: false, isHovered: false,
                        onExpand: p.data.onExpand
                    }
                }))
            ];

            // Add Draft Node if active node exists and is visible OR we have draft text
            if ((activeNodeId && !hiddenNodeIds.has(activeNodeId)) || draftInput) {
                flowNodes.push({
                    id: 'draft-node',
                    type: 'custom',
                    position: { x: 0, y: 0 },
                    data: {
                        isDraft: true,
                        parentId: activeNodeId,
                        draftText: draftInput
                    }
                });
            }

            const flowEdges: Edge[] = [
                // Standard Edges
                ...visibleNodes
                    .filter((n: any) => n.parentId && !hiddenNodeIds.has(n.parentId)) // Ensure parent is also visible
                    .map((n: any) => ({
                        id: `${n.parentId}-${n.id}`,
                        source: n.parentId,
                        target: n.id,
                        type: 'smoothstep',
                        markerEnd: { type: MarkerType.ArrowClosed },
                    })),
                // Placeholder Edges
                ...collapsedPlaceholders.map(p => ({
                    id: `${p.data.parentId}-${p.id}`,
                    source: p.data.parentId,
                    target: p.id,
                    type: 'smoothstep',
                    markerEnd: { type: MarkerType.ArrowClosed },
                    style: { strokeDasharray: '4,4' } // Dashed for placeholder
                }))
            ];

            // Edge to Draft Node
            if (activeNodeId && !hiddenNodeIds.has(activeNodeId)) {
                flowEdges.push({
                    id: `draft-edge-${activeNodeId}`,
                    source: activeNodeId,
                    target: 'draft-node',
                    type: 'smoothstep',
                    markerEnd: { type: MarkerType.ArrowClosed },
                    style: { strokeDasharray: '5,5', opacity: 0.3 }
                });
            }

            const layouted = getLayoutedElements(flowNodes, flowEdges, 'TB', { x: 0, y: 0 });
            allNodes = [...allNodes, ...layouted.nodes];
            allEdges = [...allEdges, ...layouted.edges];

            if (layouted.bounds.height > 0) {
                currentYOffset += layouted.bounds.height + 100; // Spacing
            }
        } else if (draftInput) {
            const draftFlowNodes: Node[] = [{
                id: 'draft-node',
                type: 'custom',
                position: { x: 0, y: 0 },
                data: { isDraft: true, parentId: null, draftText: draftInput }
            }];
            const layouted = getLayoutedElements(draftFlowNodes, [], 'TB', { x: 0, y: currentYOffset });
            allNodes = [...allNodes, ...layouted.nodes];
            allEdges = [...allEdges, ...layouted.edges];
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
                } catch (e) { }
            } else {
                const isInActiveGraph = nodesById.has(refId);
                // Even if it IS in the active graph, if it's a context item, we want to treat it as a reference source?
                // But logic below adds it to referencedNodeIds ONLY if NOT in active graph.

                // If it IS in the active graph, we don't need to fetch it (referencedNodeIds), 
                // BUT we still need to draw the edge if sourceNodeId is provided.

                if (!isInActiveGraph) {
                    referencedNodeIds.add(refId);
                }

                if (sourceNodeId) {
                    referenceEdges.push({ sourceId: sourceNodeId, targetId: refId });
                }
            }
        };

        // a) UI Context Items
        // We only want to ensure these nodes are loaded and visible, but NOT draw an edge from the active node to them yet.
        // The edge should go from the Draft Node to these items.
        await Promise.all(contextItems.map(item => addReference(item.id, item.type, undefined)));

        // b) & c) References in Active Graph History
        await Promise.all(activeGraphNodes.map(async (node) => {
            // Context references
            if (node.references && Array.isArray(node.references)) {
                await Promise.all(node.references.map((ref: any) =>
                    addReference(ref.id, ref.type, node.id)
                ));
            }

            // Citation references (Quotes)
            if (node.modelMetadata?.citations && Array.isArray(node.modelMetadata.citations)) {
                await Promise.all(node.modelMetadata.citations.map((cite: any) => {
                    if (cite.nodeId) {
                        return addReference(cite.nodeId, 'node', node.id);
                    }
                }));
            }
        }));

        // Also add references for the draft node
        contextItems.forEach(item => {
            // Link context items to the draft node (Context -> Draft)
            // This matches the "drag to" visual and information flow
            referenceEdges.push({ sourceId: item.id, targetId: 'draft-node' });
        });

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

            // Collapsing logic for context trees? 
            // For now, let's keep them fully expanded as they are usually references.
            // Or apply same logic? Since we use global `collapsedNodeIds`, it applies everywhere.

            // TODO: Apply collapse to context trees (Same logic as above)
            // For brevity, skipping collapse in context trees for now to avoid duplication complexity

            const flowNodes: Node[] = treeData.map((n: any) => ({
                id: n.id,
                type: 'custom',
                position: { x: 0, y: 0 },
                data: {
                    label: n.nodeTitle || n.summary || (n.userPrompt ? `User: ${n.userPrompt}` : `AI: ${n.aiResponse || '...'}`),
                    isActive: false,
                    isHovered: false,
                    isReference: true,
                    topics: n.topics,
                    classification: n.classification,
                    modelMetadata: n.modelMetadata,
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
                    label: nodeData.nodeTitle || nodeData.summary || (nodeData.userPrompt ? `User: ${nodeData.userPrompt}` : `AI: ${nodeData.aiResponse || '...'}`),
                    isActive: false,
                    isReference: true,
                    topics: nodeData.topics,
                    classification: nodeData.classification,
                    modelMetadata: nodeData.modelMetadata,
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
                const isDraftEdge = sourceId === 'draft-node' || targetId === 'draft-node';

                allEdges.push({
                    id: `ref-${sourceId}-${targetId}`,
                    source: sourceId,
                    target: targetId,
                    type: 'default',
                    animated: true,
                    hidden: !isDraftEdge,
                    style: { stroke: '#94a3b8', strokeDasharray: '5,5', opacity: 0.6 },
                    label: 'Ref'
                });
            }
        });

        setNodes(allNodes);
        setEdges(allEdges);

    }, [nodesById, activeNodeId, contextItems, handleBranch, toggleContextItem, handleCutToNewChat, handleDeleteClick, setNodes, setEdges, collapsedNodeIds, toggleCollapse, draftInput]);

    // Rebuild graph when dependencies change
    useEffect(() => {
        buildGraph();
    }, [buildGraph]);

    // Update edge visibility and node hover state
    useEffect(() => {
        setEdges(prevEdges => prevEdges.map(edge => {
            if (edge.id.startsWith('ref-')) {
                const isDraftEdge = edge.source === 'draft-node' || edge.target === 'draft-node';
                const isRelevant =
                    edge.source === hoveredNodeId ||
                    edge.target === hoveredNodeId ||
                    edge.source === activeNodeId ||
                    edge.target === activeNodeId ||
                    isDraftEdge;

                if (edge.hidden === !isRelevant) return edge;
                return { ...edge, hidden: !isRelevant };
            }
            return edge;
        }));

        setNodes(prevNodes => {
            return prevNodes.map(node => {
                const isHovered = node.id === hoveredNodeId;

                if (node.data.isHovered === isHovered) return node;

                return {
                    ...node,
                    data: {
                        ...node.data,
                        isHovered,
                    }
                };
            });
        });
    }, [hoveredNodeId, activeNodeId, setEdges, setNodes]);

    const onNodeClick = (_: React.MouseEvent, node: Node) => {
        if (!node.data.isCollapsedPlaceholder) {
            switchNode(node.id);
        }
    };

    return (
        <div className="h-full bg-background border-l border-border w-full relative">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={onNodeClick}
                onNodeMouseEnter={(_, node) => setHoveredNodeId(node.id)}
                onNodeMouseLeave={() => setHoveredNodeId(null)}
                onConnect={onConnect}
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
