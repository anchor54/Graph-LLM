import prisma from '@/lib/prisma';
import { Node } from '@prisma/client';
import { ExportScope, SemanticNode, ThoughtEdge, ThoughtGraph, SemanticType } from '@/types';
import { generateModelResponse } from '@/lib/models';
import { SEGMENTATION_PROMPT, SEMANTIC_EXTRACTION_PROMPT, LINKING_PROMPT } from './prompts';

export class DistillationService {
    
    /**
     * Fetch chat nodes based on scope.
     */
    static async getChatNodes(nodeId: string, scope: ExportScope, userId: string): Promise<Node[]> {
        if (scope === 'root_to_current') {
            // Traverse up to find path
            const path: Node[] = [];
            let currentId: string | null = nodeId;
            
            // Safety limit to prevent infinite loops
            let depth = 0;
            const MAX_DEPTH = 100;

            while (currentId && depth < MAX_DEPTH) {
                const fetchedNode: Node | null = await prisma.node.findFirst({
                    where: { id: currentId, userId }
                });
                if (!fetchedNode) break;
                path.unshift(fetchedNode);
                currentId = fetchedNode.parentId;
                depth++;
            }
            return path;
        } else {
            // Subtree: Use recursive CTE to find all descendants
            // Prisma doesn't support recursive queries natively, so we use raw SQL or fetch-all strategy.
            // For robustness with SQLite/Postgres, we'll try a raw query if Postgres, but fallback to fetch-all-in-folder if simpler.
            // Let's assume Postgres (from schema.prisma).
            
            try {
                const descendants = await prisma.$queryRaw<{ id: string }[]>`
                    WITH RECURSIVE tree AS (
                        SELECT id, "parentId" FROM "Node" WHERE id = ${nodeId} AND "userId" = ${userId}
                        UNION ALL
                        SELECT n.id, n."parentId" FROM "Node" n
                        INNER JOIN tree t ON n."parentId" = t.id
                    )
                    SELECT id FROM tree;
                `;
                
                const ids = descendants.map((d: any) => d.id);
                
                const nodes = await prisma.node.findMany({
                    where: { id: { in: ids }, userId },
                    orderBy: { createdAt: 'asc' }
                });
                
                return nodes;
            } catch (e) {
                console.error("Failed to run recursive query, falling back to fetch-all-descendants-in-memory strategy", e);
                // Fallback: This is expensive but works if raw query fails
                const allNodes = await prisma.node.findMany({ where: { userId } });
                const descendants = new Set<string>([nodeId]);
                const result: Node[] = [];
                
                // Build adjacency
                const childrenMap = new Map<string, string[]>();
                allNodes.forEach(n => {
                    if (n.parentId) {
                        if (!childrenMap.has(n.parentId)) childrenMap.set(n.parentId, []);
                        childrenMap.get(n.parentId)!.push(n.id);
                    }
                });

                // Traverse
                const stack = [nodeId];
                while(stack.length) {
                    const curr = stack.pop()!;
                    const n = allNodes.find(x => x.id === curr);
                    if (n) result.push(n);
                    
                    const children = childrenMap.get(curr) || [];
                    children.forEach(c => stack.push(c));
                }
                
                return result.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
            }
        }
    }

    /**
     * Segment chat nodes into logical chunks.
     * For now, we will treat each node as a segment or group small exchanges.
     * To keep it robust, we'll do a simple heuristic: User Prompt + AI Response = 1 Segment.
     */
    static async segmentChat(nodes: Node[]): Promise<any[]> {
        // Simple heuristic grouping
        return nodes.map(node => ({
            id: node.id,
            nodeIds: [node.id],
            content: `User: ${node.userPrompt}\nAI: ${node.aiResponse || ''}`
        }));
    }

    /**
     * Extract semantic nodes from segments using LLM.
     */
    static async extractSemantics(segments: any[], modelName: string = 'gemini-2.5-flash'): Promise<SemanticNode[]> {
        const allSemanticNodes: SemanticNode[] = [];

        for (const segment of segments) {
            const prompt = SEMANTIC_EXTRACTION_PROMPT.replace('{{segment_content}}', segment.content);
            try {
                const response = await generateModelResponse(prompt, modelName);
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (parsed.nodes && Array.isArray(parsed.nodes)) {
                        const nodes = parsed.nodes.map((n: any) => ({
                            ...n,
                            id: crypto.randomUUID(),
                            sourceNodeIds: segment.nodeIds
                        }));
                        allSemanticNodes.push(...nodes);
                    }
                }
            } catch (e) {
                console.error("Error extracting semantics for segment", segment.id, e);
            }
        }
        return allSemanticNodes;
    }

    /**
     * Link semantic nodes using LLM.
     */
    static async linkNodes(nodes: SemanticNode[], modelName: string = 'gemini-2.5-flash'): Promise<ThoughtEdge[]> {
        if (nodes.length < 2) return [];

        const nodesJson = JSON.stringify(nodes.map(n => ({ id: n.id, type: n.type, title: n.title })), null, 2);
        const prompt = LINKING_PROMPT.replace('{{nodes_json}}', nodesJson);
        
        try {
            const response = await generateModelResponse(prompt, modelName);
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.edges && Array.isArray(parsed.edges)) {
                    return parsed.edges;
                }
            }
        } catch (e) {
            console.error("Error linking nodes", e);
        }
        
        return [];
    }

    /**
     * Main pipeline execution.
     */
    static async distill(nodeId: string, scope: ExportScope, userId: string): Promise<ThoughtGraph> {
        const chatNodes = await this.getChatNodes(nodeId, scope, userId);
        const segments = await this.segmentChat(chatNodes);
        const semanticNodes = await this.extractSemantics(segments);
        const edges = await this.linkNodes(semanticNodes);
        
        return {
            id: crypto.randomUUID(),
            nodes: semanticNodes,
            edges: edges
        };
    }
}
