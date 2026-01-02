'use client';

import React, { useEffect, useState, useCallback } from 'react';
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
const CustomNode = ({ data, id }: { data: any, id: string }) => {
    const isUser = data.label.startsWith('User:');
    return (
        <div className={`px-4 py-2 shadow-md rounded-md border-2 w-[200px] text-xs ${data.isActive ? 'border-primary ring-2 ring-ring' : 'border-border bg-card'}`}>
            <Handle type="target" position={Position.Top} className="w-16 !bg-muted" />
            <div className={`font-bold mb-1 ${isUser ? 'text-primary' : 'text-muted-foreground'}`}>
                {isUser ? 'User' : 'AI'}
            </div>
            <div className="truncate text-muted-foreground">
                {data.label.replace(/^(User:|AI:)\s*/, '')}
            </div>
            <Handle type="source" position={Position.Bottom} className="w-16 !bg-muted" />
        </div>
    );
};

const nodeTypes = {
    custom: CustomNode,
};

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
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

    nodes.forEach((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        node.targetPosition = Position.Top;
        node.sourcePosition = Position.Bottom;

        // We are shifting the dagre node position (anchor=center center) to the top left
        // so it matches the React Flow node anchor point (top left).
        node.position = {
            x: nodeWithPosition.x - nodeWidth / 2,
            y: nodeWithPosition.y - nodeHeight / 2,
        };

        return node;
    });

    return { nodes, edges };
};

export function GraphVisualization() {
    const { activeNodeId, setActiveNodeId, graphRefreshTrigger } = useWorkspace();
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [rootId, setRootId] = useState<string | null>(null);

    // Helper to find root from active node (could be improved with API)
    const findRoot = async (nodeId: string) => {
        // For now, let's fetch ancestors and take the first one
        const res = await fetch(`/api/graph/${nodeId}?direction=ancestors`);
        if (res.ok) {
            const ancestors = await res.json();
            const root = ancestors.find((n: any) => !n.parentId);
            return root ? root.id : nodeId;
        }
        return nodeId;
    };

    const fetchGraph = useCallback(async () => {
        if (!activeNodeId) {
            setNodes([]);
            setEdges([]);
            return;
        }

        // 1. Find root
        const root = await findRoot(activeNodeId);
        setRootId(root);

        // 2. Fetch tree
        const res = await fetch(`/api/graph/${root}`); // default direction is descendants (tree)
        if (res.ok) {
            const treeData = await res.json();

            // Transform to React Flow
            const flowNodes: Node[] = treeData.map((n: any) => ({
                id: n.id,
                type: 'custom',
                position: { x: 0, y: 0 }, // layout will fix this
                data: {
                    label: n.userPrompt ? `User: ${n.userPrompt}` : `AI: ${n.aiResponse || '...'}`,
                    isActive: n.id === activeNodeId
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

            const layouted = getLayoutedElements(flowNodes, flowEdges);
            setNodes(layouted.nodes);
            setEdges(layouted.edges);
        }
    }, [activeNodeId, graphRefreshTrigger, setNodes, setEdges]); // Added dependencies

    useEffect(() => {
        fetchGraph();
    }, [fetchGraph]);

    const onNodeClick = (_: React.MouseEvent, node: Node) => {
        setActiveNodeId(node.id);
    };

    if (!activeNodeId) {
        return (
            <div className="h-full bg-background border-l border-border p-4 flex items-center justify-center text-muted-foreground">
                Graph View
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
                <Controls />
                <MiniMap />
            </ReactFlow>
        </div>
    );
}
