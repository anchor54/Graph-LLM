import { Node } from '@/types';

/**
 * Normalizes an array of nodes into a Map for O(1) access by ID.
 */
export function normalizeTree(nodes: Node[]): Map<string, Node> {
    const map = new Map<string, Node>();
    nodes.forEach(node => {
        map.set(node.id, node);
    });
    return map;
}

/**
 * Returns the path from the root to the target node (inclusive).
 * Traverses up using parentId.
 */
export function getAncestryPath(nodesById: Map<string, Node>, targetNodeId: string): Node[] {
    const path: Node[] = [];
    let currentId: string | null = targetNodeId;

    while (currentId) {
        const node = nodesById.get(currentId);
        if (!node) break;
        path.unshift(node);
        currentId = node.parentId;
    }

    return path;
}

/**
 * Returns the root node of the tree containing the target node.
 */
export function getRoot(nodesById: Map<string, Node>, targetNodeId: string): Node | null {
    let currentId: string | null = targetNodeId;
    let lastNode: Node | null = null;

    while (currentId) {
        const node = nodesById.get(currentId);
        if (!node) break;
        lastNode = node;
        currentId = node.parentId;
    }

    return lastNode;
}

/**
 * Computes children counts for all nodes in the map.
 * Returns a Map<nodeId, count>.
 */
export function getChildrenCounts(nodesById: Map<string, Node>): Map<string, number> {
    const counts = new Map<string, number>();
    
    nodesById.forEach(node => {
        if (node.parentId) {
            const currentCount = counts.get(node.parentId) || 0;
            counts.set(node.parentId, currentCount + 1);
        }
    });
    
    return counts;
}

/**
 * Returns all direct children of a given node.
 */
export function getChildren(nodesById: Map<string, Node>, parentId: string): Node[] {
    const children: Node[] = [];
    nodesById.forEach(node => {
        if (node.parentId === parentId) {
            children.push(node);
        }
    });
    return children;
}
