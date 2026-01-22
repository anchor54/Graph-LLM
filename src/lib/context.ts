import prisma from './prisma';
import { getNodeDeltas, getBranchSummary, inferIntent } from './summarization';

// Token budget configuration
const MAX_CONTEXT_TOKENS = 8000; // Conservative limit for context
const TOKENS_PER_CHAR = 0.25; // Rough estimate: 1 token ≈ 4 characters

// Priority weights for context items
const WEIGHTS = {
    USER_PINNED: 10,
    RECENT_DELTAS: 5,
    BRANCH_SUMMARY: 3,
    RAW_MESSAGES: 1,
};

interface ContextItem {
    type: 'branch_summary' | 'node_delta' | 'raw_message' | 'user_pinned';
    content: string;
    priority: number;
    tokenEstimate: number;
}

interface AssembledContext {
    contextText: string;
    metadata: {
        activeIntent: string;
        branchSummariesUsed: string[];
        nodeDeltasUsed: string[];
        rawMessagesCount: number;
        totalTokens: number;
    };
}

/**
 * Estimate token count from text
 */
function estimateTokens(text: string): number {
    return Math.ceil(text.length * TOKENS_PER_CHAR);
}

/**
 * Get the root node of a branch (node with no parent or where branching started)
 */
async function findBranchRoot(nodeId: string): Promise<string> {
    try {
        const node = await prisma.node.findUnique({
            where: { id: nodeId },
            select: { id: true, parentId: true },
        });

        if (!node || !node.parentId) {
            return nodeId;
        }

        // For MVP, we consider the first node in a folder as the branch root
        // In a more sophisticated system, we'd track branch points explicitly
        const parent = await prisma.node.findUnique({
            where: { id: node.parentId },
            select: { id: true, parentId: true },
        });

        if (!parent || !parent.parentId) {
            return node.parentId;
        }

        // Recursively find root
        return findBranchRoot(node.parentId);
    } catch (error) {
        console.error('Error finding branch root:', error);
        return nodeId;
    }
}

/**
 * Fetch ancestor nodes up the tree
 */
async function getAncestors(nodeId: string, userId: string, limit?: number): Promise<any[]> {
    try {
        const result = await prisma.$queryRaw<any[]>`
            WITH RECURSIVE Ancestors AS (
                SELECT id, "parentId", "userPrompt", "aiResponse", summary, "createdAt"
                FROM "Node"
                WHERE id = ${nodeId} AND "userId" = ${userId}
                
                UNION ALL
                
                SELECT n.id, n."parentId", n."userPrompt", n."aiResponse", n.summary, n."createdAt"
                FROM "Node" n
                INNER JOIN Ancestors a ON n.id = a."parentId"
            )
            SELECT * FROM Ancestors ORDER BY "createdAt" ASC
            ${limit ? `LIMIT ${limit}` : ''};
        `;
        return result;
    } catch (error) {
        console.error('Error fetching ancestors:', error);
        return [];
    }
}

/**
 * Main Context Assembly Algorithm (PRD §7.2)
 * 
 * Assembles minimal, relevant, explainable context for a new chat node
 */
export async function assembleContext(
    parentNodeId: string | null,
    userId: string,
    currentUserPrompt: string,
    referencedNodeIds: string[] = [],
    apiKey?: string
): Promise<AssembledContext> {
    const contextItems: ContextItem[] = [];
    const metadata = {
        activeIntent: 'general-discussion',
        branchSummariesUsed: [] as string[],
        nodeDeltasUsed: [] as string[],
        rawMessagesCount: 0,
        totalTokens: 0,
    };

    // Step 1: Identify Active Intent(s)
    let activeIntent = 'general-discussion';
    
    if (parentNodeId) {
        // Check if parent has a node delta with intent
        const parentDelta = await prisma.nodeDelta.findUnique({
            where: { nodeId: parentNodeId },
        });

        if (parentDelta) {
            activeIntent = parentDelta.intent;
        }

        // Optionally infer intent from current prompt (can be expensive, so we skip for MVP)
        // activeIntent = await inferIntent(currentUserPrompt, null, activeIntent, apiKey);
    }

    metadata.activeIntent = activeIntent;

    // Step 2: Collect Context in Priority Order

    // 2a. Recent Node Delta Summaries (walking upward)
    if (parentNodeId) {
        const ancestors = await getAncestors(parentNodeId, userId, 20); // Last 20 ancestors
        const ancestorIds = ancestors.map(a => a.id);
        const nodeDeltas = await getNodeDeltas(ancestorIds);

        // Prioritize recent deltas (reverse order, most recent first)
        const recentDeltas = nodeDeltas.reverse().slice(0, 10);

        for (const delta of recentDeltas) {
            const decisions = delta.newInformation?.decisions || [];
            const constraints = delta.newInformation?.constraints || [];
            const facts = delta.newInformation?.facts || [];

            if (decisions.length === 0 && constraints.length === 0 && facts.length === 0) {
                continue; // Skip empty deltas
            }

            let deltaText = `[Node Delta - ${delta.intent}]\n`;
            if (decisions.length > 0) {
                deltaText += `Decisions: ${decisions.join('; ')}\n`;
            }
            if (constraints.length > 0) {
                deltaText += `Constraints: ${constraints.join('; ')}\n`;
            }
            if (facts.length > 0) {
                deltaText += `Facts: ${facts.join('; ')}\n`;
            }

            contextItems.push({
                type: 'node_delta',
                content: deltaText,
                priority: WEIGHTS.RECENT_DELTAS,
                tokenEstimate: estimateTokens(deltaText),
            });

            metadata.nodeDeltasUsed.push(delta.nodeId);
        }
    }

    // 2b. Branch Intent Summaries
    if (parentNodeId) {
        try {
            const branchRoot = await findBranchRoot(parentNodeId);
            const branchSummary = await getBranchSummary(branchRoot, activeIntent, false, apiKey);

            if (branchSummary && branchSummary.confidence > 0.5) {
                const content = branchSummary.content;
                let summaryText = `[Branch Summary - ${branchSummary.intent}]\n`;
                
                if (content.decisions && content.decisions.length > 0) {
                    summaryText += `Key Decisions:\n${content.decisions.map((d: string) => `- ${d}`).join('\n')}\n`;
                }
                if (content.constraints && content.constraints.length > 0) {
                    summaryText += `Constraints:\n${content.constraints.map((c: string) => `- ${c}`).join('\n')}\n`;
                }
                if (content.rejected_options && content.rejected_options.length > 0) {
                    summaryText += `Rejected Options:\n${content.rejected_options.map((r: string) => `- ${r}`).join('\n')}\n`;
                }

                contextItems.push({
                    type: 'branch_summary',
                    content: summaryText,
                    priority: WEIGHTS.BRANCH_SUMMARY,
                    tokenEstimate: estimateTokens(summaryText),
                });

                metadata.branchSummariesUsed.push(branchSummary.id);
            }
        } catch (error) {
            console.error('Error fetching branch summary:', error);
        }
    }

    // 2c. Referenced Conversations (if any)
    if (referencedNodeIds.length > 0) {
        for (const refId of referencedNodeIds) {
            try {
                const refChain = await getAncestors(refId, userId, 5);
                if (refChain.length > 0) {
                    const chainText = refChain.map(n => 
                        `User: ${n.userPrompt}\nAI: ${n.aiResponse || '(No response)'}`
                    ).join('\n\n');

                    contextItems.push({
                        type: 'raw_message',
                        content: `--- REFERENCED CONVERSATION (${refId}) ---\n${chainText}`,
                        priority: WEIGHTS.USER_PINNED,
                        tokenEstimate: estimateTokens(chainText),
                    });
                }
            } catch (error) {
                console.error('Error fetching referenced conversation:', error);
            }
        }
    }

    // 2d. Raw Messages (fallback for immediate context)
    if (parentNodeId) {
        const recentRaw = await getAncestors(parentNodeId, userId, 5); // Last 5 messages
        const rawText = recentRaw.slice(-3).map(n => // Only last 3 for grounding
            `User: ${n.userPrompt}\nAI: ${n.aiResponse || '(No response)'}`
        ).join('\n\n');

        if (rawText) {
            contextItems.push({
                type: 'raw_message',
                content: `--- RECENT CONVERSATION ---\n${rawText}`,
                priority: WEIGHTS.RAW_MESSAGES,
                tokenEstimate: estimateTokens(rawText),
            });
            metadata.rawMessagesCount = 3;
        }
    }

    // Step 3: Budget Enforcement
    // Sort by priority (descending)
    contextItems.sort((a, b) => b.priority - a.priority);

    const selectedItems: ContextItem[] = [];
    let currentTokens = 0;

    for (const item of contextItems) {
        if (currentTokens + item.tokenEstimate > MAX_CONTEXT_TOKENS) {
            // Check if we can fit it partially or skip
            if (item.type === 'raw_message' && selectedItems.length > 0) {
                break; // Drop raw messages first
            }
            if (currentTokens + item.tokenEstimate * 0.5 <= MAX_CONTEXT_TOKENS) {
                // Include partial content
                selectedItems.push(item);
                currentTokens += Math.floor(item.tokenEstimate * 0.5);
            }
            break;
        }

        selectedItems.push(item);
        currentTokens += item.tokenEstimate;
    }

    metadata.totalTokens = currentTokens;

    // Step 4: Assemble Final Context Text
    const contextParts = selectedItems.map(item => item.content);
    const contextText = contextParts.join('\n\n');

    return {
        contextText,
        metadata,
    };
}

/**
 * Format the assembled context into a prompt structure
 */
export function formatContextForPrompt(
    assembledContext: AssembledContext,
    systemInstructions?: string
): string {
    const parts: string[] = [];

    if (systemInstructions) {
        parts.push(`SYSTEM INSTRUCTIONS:\n${systemInstructions}`);
    }

    if (assembledContext.contextText) {
        parts.push(`CONTEXT:\n${assembledContext.contextText}`);
    }

    return parts.join('\n\n');
}

/**
 * Helper to determine if a node delta has significant content
 * Used to decide whether to invalidate branch summaries
 */
export function hasSignificantContent(newInformation: any): boolean {
    const { decisions = [], constraints = [], facts = [], rejected_options = [] } = newInformation;
    return (
        decisions.length > 0 ||
        constraints.length > 0 ||
        facts.length > 0 ||
        rejected_options.length > 0
    );
}
