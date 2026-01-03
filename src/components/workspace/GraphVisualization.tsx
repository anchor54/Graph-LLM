'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
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

// Custom Node Component
const CustomNode = React.memo(({ data, id }: { data: any, id: string }) => {
    const isUser = data.label.startsWith('User:');
    const isReference = data.isReference;
    
    return (
        <div className={`px-4 py-2 shadow-md rounded-md border-2 w-[200px] text-xs ${
            data.isActive 
                ? 'border-primary ring-2 ring-ring' 
                : isReference
                    ? 'border-dashed border-muted-foreground/50 opacity-80 bg-muted/20'
                    : 'border-border bg-card'
        }`}>
            <Handle type="target" position={Position.Top} className={`w-16 ${isReference ? '!bg-muted-foreground/50' : '!bg-muted'}`} />
            <div className={`font-bold mb-1 ${isUser ? 'text-primary' : 'text-muted-foreground'}`}>
                {isUser ? 'User' : 'AI'} {isReference && '(Ref)'}
            </div>
            <div className="truncate text-muted-foreground">
                {data.label.replace(/^(User:|AI:)\s*/, '')}
            </div>
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
    const { activeNodeId, setActiveNodeId, graphRefreshTrigger, contextItems } = useWorkspace();
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    // Helper to find root from active node
    const findRoot = async (nodeId: string) => {
        const res = await fetch(`/api/graph/${nodeId}?direction=ancestors`);
        if (res.ok) {
            const ancestors = await res.json();
            const root = ancestors.find((n: any) => !n.parentId);
            return root ? root.id : nodeId;
        }
        return nodeId;
    };

    const fetchGraph = useCallback(async (currentNodeId: string | null) => {
        let allNodes: Node[] = [];
        let allEdges: Edge[] = [];
        let currentYOffset = 0;
        let activeGraphNodes: any[] = []; // Store raw node data from active graph

        // 1. Fetch Main Active Graph
        if (currentNodeId) {
            const root = await findRoot(currentNodeId);
            const res = await fetch(`/api/graph/${root}`);
            if (res.ok) {
                const treeData = await res.json();
                activeGraphNodes = treeData;
                
                const flowNodes: Node[] = treeData.map((n: any) => ({
                    id: n.id,
                    type: 'custom',
                    position: { x: 0, y: 0 },
                    data: {
                        label: n.userPrompt ? `User: ${n.userPrompt}` : `AI: ${n.aiResponse || '...'}`,
                        isActive: n.id === currentNodeId,
                        references: n.references // Pass references to data
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
                    }));

                const layouted = getLayoutedElements(flowNodes, flowEdges, 'TB', { x: 0, y: 0 });
                allNodes = [...allNodes, ...layouted.nodes];
                allEdges = [...allEdges, ...layouted.edges];
                
                if (layouted.bounds.height > 0) {
                    currentYOffset += layouted.bounds.height + 100; // Spacing
                }
            }
        }

        // 2. Resolve Context Roots from THREE sources:
        //    a) Currently selected context items (UI)
        //    b) References stored in the active node (DB)
        //    c) References stored in any ancestor node in the active graph (DB)
        const contextRoots = new Set<string>();
        const contextSourceMap = new Map<string, Set<string>>(); // Maps contextRootId -> Set<sourceNodeId>

        // Helper to add context root and link it to a source node
        const addContextRoot = async (refId: string, type: string, sourceNodeId?: string) => {
            let rootsToAdd: string[] = [];
            
            if (type === 'folder') {
                try {
                    const res = await fetch(`/api/nodes?folderId=${refId}&recursive=true`);
                    if (res.ok) {
                        const folderNodes = await res.json();
                        folderNodes.forEach((n: any) => {
                             if (!n.parentId) rootsToAdd.push(n.id);
                        });
                    }
                } catch (e) {}
            } else {
                 const root = await findRoot(refId);
                 rootsToAdd.push(root);
            }

            rootsToAdd.forEach(root => {
                contextRoots.add(root);
                if (sourceNodeId) {
                    if (!contextSourceMap.has(root)) contextSourceMap.set(root, new Set());
                    contextSourceMap.get(root)!.add(sourceNodeId);
                }
            });
        };

        // a) UI Context Items (Linked to Active Node implicitly or just floating)
        await Promise.all(contextItems.map(item => addContextRoot(item.id, item.type, currentNodeId || undefined)));

        // b) & c) References in Active Graph History
        // We iterate through all nodes in the active graph to find their references
        await Promise.all(activeGraphNodes.map(async (node) => {
            if (node.references && Array.isArray(node.references)) {
                await Promise.all(node.references.map((ref: any) => 
                    addContextRoot(ref.id, ref.type, node.id)
                ));
            }
        }));

        // Remove active graph root if present to avoid duplication (referencing itself)
        if (currentNodeId) {
             const activeRoot = await findRoot(currentNodeId);
             contextRoots.delete(activeRoot);
        }

        let contextIndex = 0;
        
        // Parallel fetch of all context graphs
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

        // Layout each context graph
        for (const result of contextResults) {
            if (!result) continue;
            const { rootId, treeData } = result;
                    
            const flowNodes: Node[] = treeData.map((n: any) => ({
                id: n.id,
                type: 'custom',
                position: { x: 0, y: 0 },
                data: {
                    label: n.userPrompt ? `User: ${n.userPrompt}` : `AI: ${n.aiResponse || '...'}`,
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

            // Draw connections from source nodes to this context graph
            const sources = contextSourceMap.get(rootId);
            if (sources) {
                sources.forEach(sourceId => {
                    // Verify source exists in current graph (it should)
                    if (allNodes.find(n => n.id === sourceId)) {
                            allEdges.push({
                            id: `ref-conn-${sourceId}-${rootId}`,
                            source: sourceId,
                            target: rootId,
                            type: 'default',
                            animated: true,
                            style: { stroke: '#94a3b8', strokeDasharray: '5,5', opacity: 0.6 },
                            label: 'Ref'
                        });
                    }
                });
            }

            if (layouted.bounds.height > 0) {
                    currentYOffset += layouted.bounds.height + 50;
            }
            contextIndex++;
        }

        setNodes(allNodes);
        setEdges(allEdges);

    }, [graphRefreshTrigger, contextItems, setNodes, setEdges]);

    const prevTrigger = useRef(graphRefreshTrigger);

    useEffect(() => {
        const triggerChanged = prevTrigger.current !== graphRefreshTrigger;
        prevTrigger.current = graphRefreshTrigger;

        let shouldFetch = true;

        // Optimization: If activeNodeId changed but is already in the graph, just update local state
        // Only attempt fast path if trigger did NOT change
        if (activeNodeId && !triggerChanged) {
             const existingNode = nodes.find(n => n.id === activeNodeId);
             if (existingNode) {
                 setNodes(prev => prev.map(n => ({
                     ...n,
                     data: {
                         ...n.data,
                         isActive: n.id === activeNodeId
                     }
                 })));
                 shouldFetch = false;
             }
        }
        
        if (shouldFetch) {
            fetchGraph(activeNodeId);
        }
    }, [fetchGraph, activeNodeId, graphRefreshTrigger]);

    const onNodeClick = (_: React.MouseEvent, node: Node) => {
        setActiveNodeId(node.id);
    };

    if (!activeNodeId && contextItems.length === 0) {
        return (
            <div className="h-full bg-background border-l border-border p-4 flex items-center justify-center text-muted-foreground">
                Select a chat or add contexts to view
            </div>
        );
    }

    return (
        <div className="h-full bg-background border-l border-border w-full">
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
        </div>
    );
}
