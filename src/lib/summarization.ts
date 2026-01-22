import { GoogleGenAI } from '@google/genai';
import prisma from './prisma';

const DEFAULT_INTENT_THRESHOLD = 0.7;
const DEFAULT_CONFIDENCE = 0.8;

// Helper to get Gemini client
const getClient = (apiKey?: string): GoogleGenAI | null => {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) return null;
    return new GoogleGenAI({ apiKey: key });
};

/**
 * Infer the intent of a conversation based on recent messages
 * Returns a short intent label (e.g., "authentication-design", "database-optimization")
 */
export async function inferIntent(
    userPrompt: string,
    aiResponse: string | null,
    parentIntent?: string,
    apiKey?: string
): Promise<string> {
    const ai = getClient(apiKey);
    if (!ai) {
        return 'general-discussion';
    }

    try {
        const prompt = `
You are analyzing a conversation to identify the user's intent or goal.

User Message: ${userPrompt}
AI Response: ${aiResponse || '(No response yet)'}
${parentIntent ? `Previous Intent: ${parentIntent}` : ''}

Identify the primary intent or goal being pursued. Return a short, hyphenated label (3-4 words max).
Examples: "authentication-design", "database-optimization", "ui-implementation", "bug-investigation", "feature-planning"

If the conversation is continuing the same topic as the parent, return the same intent.
Only change intent if there's a clear shift in focus.

Intent:`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash-lite',
            contents: prompt,
        });

        const intent = response.text?.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || 'general-discussion';
        return intent;
    } catch (error) {
        console.error('Error inferring intent:', error);
        return parentIntent || 'general-discussion';
    }
}

/**
 * Generate a Node Delta Summary
 * This captures what new information was introduced at this specific node
 */
export async function generateNodeDelta(
    nodeId: string,
    userPrompt: string,
    aiResponse: string | null,
    intent: string,
    parentNodeIds: string[] = [],
    apiKey?: string
): Promise<{
    intent: string;
    newInformation: {
        decisions: string[];
        constraints: string[];
        facts: string[];
        rejected_options: string[];
    };
    openQuestions: string[];
    confidence: number;
}> {
    const ai = getClient(apiKey);
    if (!ai) {
        return {
            intent,
            newInformation: { decisions: [], constraints: [], facts: [], rejected_options: [] },
            openQuestions: [],
            confidence: 0.5,
        };
    }

    try {
        const prompt = `
You are analyzing a conversation turn to extract structured information.

Intent: ${intent}

User Message:
${userPrompt}

AI Response:
${aiResponse || '(No response)'}

Extract the following information from this exchange:
1. **Decisions**: Concrete choices or commitments made
2. **Constraints**: Limitations, requirements, or boundaries established
3. **Facts**: New factual information or data points
4. **Rejected Options**: Alternatives that were explicitly dismissed
5. **Open Questions**: Unresolved questions or uncertainties

Return ONLY valid JSON in this exact format:
{
  "decisions": ["decision 1", "decision 2"],
  "constraints": ["constraint 1"],
  "facts": ["fact 1", "fact 2"],
  "rejected_options": ["rejected option 1"],
  "open_questions": ["question 1"],
  "confidence": 0.85
}

Rules:
- Be concise but complete
- Only include items that are clearly present
- Empty arrays are fine
- Confidence: 0.0-1.0 based on clarity and certainty
- Return ONLY the JSON, no explanation`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash-lite',
            contents: prompt,
        });

        const text = response.text?.trim() || '{}';
        // Remove markdown code blocks if present
        const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(jsonText);

        return {
            intent,
            newInformation: {
                decisions: parsed.decisions || [],
                constraints: parsed.constraints || [],
                facts: parsed.facts || [],
                rejected_options: parsed.rejected_options || [],
            },
            openQuestions: parsed.open_questions || [],
            confidence: parsed.confidence || DEFAULT_CONFIDENCE,
        };
    } catch (error) {
        console.error('Error generating node delta:', error);
        return {
            intent,
            newInformation: { decisions: [], constraints: [], facts: [], rejected_options: [] },
            openQuestions: [],
            confidence: 0.5,
        };
    }
}

/**
 * Store a Node Delta Summary in the database
 */
export async function storeNodeDelta(
    nodeId: string,
    intent: string,
    newInformation: any,
    openQuestions: string[],
    confidence: number,
    derivedFrom: string[]
): Promise<void> {
    try {
        await prisma.nodeDelta.upsert({
            where: { nodeId },
            create: {
                nodeId,
                intent,
                newInformation,
                openQuestions,
                confidence,
                derivedFrom,
            },
            update: {
                intent,
                newInformation,
                openQuestions,
                confidence,
                derivedFrom,
            },
        });
    } catch (error) {
        console.error('Error storing node delta:', error);
        throw error;
    }
}

/**
 * Fetch Node Delta Summaries for a list of nodes
 */
export async function getNodeDeltas(nodeIds: string[]) {
    return await prisma.nodeDelta.findMany({
        where: { nodeId: { in: nodeIds } },
        include: { node: true },
    });
}

/**
 * Generate a Branch Intent Summary by aggregating node deltas
 */
export async function generateBranchSummary(
    rootNodeId: string,
    intent: string,
    nodeDeltas: any[],
    apiKey?: string
): Promise<{
    content: {
        decisions: string[];
        constraints: string[];
        rejected_options: string[];
        open_questions: string[];
    };
    confidence: number;
    coveredNodes: string[];
}> {
    const ai = getClient(apiKey);
    if (!ai) {
        return {
            content: { decisions: [], constraints: [], rejected_options: [], open_questions: [] },
            confidence: 0.5,
            coveredNodes: nodeDeltas.map(nd => nd.nodeId),
        };
    }

    try {
        // Filter node deltas by intent similarity (simple exact match for MVP)
        const relevantDeltas = nodeDeltas.filter(nd => nd.intent === intent);

        if (relevantDeltas.length === 0) {
            return {
                content: { decisions: [], constraints: [], rejected_options: [], open_questions: [] },
                confidence: 0.0,
                coveredNodes: [],
            };
        }

        // Aggregate all information from relevant deltas
        const allDecisions = relevantDeltas.flatMap(nd => nd.newInformation.decisions || []);
        const allConstraints = relevantDeltas.flatMap(nd => nd.newInformation.constraints || []);
        const allRejectedOptions = relevantDeltas.flatMap(nd => nd.newInformation.rejected_options || []);
        const allOpenQuestions = relevantDeltas.flatMap(nd => nd.openQuestions || []);

        const prompt = `
You are creating a consolidated summary of a conversation branch about: ${intent}

Raw extracted information from individual messages:

DECISIONS:
${allDecisions.map((d, i) => `${i + 1}. ${d}`).join('\n') || '(none)'}

CONSTRAINTS:
${allConstraints.map((c, i) => `${i + 1}. ${c}`).join('\n') || '(none)'}

REJECTED OPTIONS:
${allRejectedOptions.map((r, i) => `${i + 1}. ${r}`).join('\n') || '(none)'}

OPEN QUESTIONS:
${allOpenQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n') || '(none)'}

Consolidate this into a coherent branch summary. Remove duplicates, merge related items, and keep only the most important/relevant ones.

Return ONLY valid JSON in this exact format:
{
  "decisions": ["consolidated decision 1", "decision 2"],
  "constraints": ["consolidated constraint 1"],
  "rejected_options": ["rejected 1"],
  "open_questions": ["question 1"],
  "confidence": 0.90
}

Rules:
- Deduplicate similar items
- Keep it concise but complete
- Confidence should reflect how well the branch summary captures the intent
- Return ONLY the JSON, no explanation`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash-lite',
            contents: prompt,
        });

        const text = response.text?.trim() || '{}';
        const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(jsonText);

        return {
            content: {
                decisions: parsed.decisions || [],
                constraints: parsed.constraints || [],
                rejected_options: parsed.rejected_options || [],
                open_questions: parsed.open_questions || [],
            },
            confidence: parsed.confidence || DEFAULT_CONFIDENCE,
            coveredNodes: relevantDeltas.map(nd => nd.nodeId),
        };
    } catch (error) {
        console.error('Error generating branch summary:', error);
        return {
            content: { decisions: [], constraints: [], rejected_options: [], open_questions: [] },
            confidence: 0.3,
            coveredNodes: nodeDeltas.map(nd => nd.nodeId),
        };
    }
}

/**
 * Store or update a Branch Summary in the database
 */
export async function storeBranchSummary(
    rootNodeId: string,
    intent: string,
    content: any,
    confidence: number,
    coveredNodes: string[],
    isStale: boolean = false
): Promise<void> {
    try {
        const existing = await prisma.branchSummary.findUnique({
            where: { rootNodeId_intent: { rootNodeId, intent } },
        });

        if (existing) {
            await prisma.branchSummary.update({
                where: { id: existing.id },
                data: {
                    content,
                    confidence,
                    coveredNodes,
                    isStale,
                    version: existing.version + 1,
                    updatedAt: new Date(),
                },
            });
        } else {
            await prisma.branchSummary.create({
                data: {
                    rootNodeId,
                    intent,
                    content,
                    confidence,
                    coveredNodes,
                    isStale,
                    version: 1,
                },
            });
        }
    } catch (error) {
        console.error('Error storing branch summary:', error);
        throw error;
    }
}

/**
 * Mark branch summaries as stale when a new node is added
 * This is called after creating a node that introduces new information
 */
export async function invalidateBranchSummaries(
    rootNodeId: string,
    hasSignificantContent: boolean = true
): Promise<void> {
    if (!hasSignificantContent) {
        return; // No need to invalidate for trivial updates
    }

    try {
        await prisma.branchSummary.updateMany({
            where: { rootNodeId },
            data: { isStale: true },
        });
    } catch (error) {
        console.error('Error invalidating branch summaries:', error);
    }
}

/**
 * Get or compute a branch summary
 * Implements lazy materialization: recompute only if stale and needed
 */
export async function getBranchSummary(
    rootNodeId: string,
    intent: string,
    forceRecompute: boolean = false,
    apiKey?: string
): Promise<any | null> {
    try {
        const existing = await prisma.branchSummary.findUnique({
            where: { rootNodeId_intent: { rootNodeId, intent } },
        });

        // If exists, not stale, and not forcing recompute, return cached
        if (existing && !existing.isStale && !forceRecompute) {
            return existing;
        }

        // Need to recompute - fetch all node deltas in the subtree
        const descendants = await getDescendantNodes(rootNodeId);
        const nodeDeltas = await getNodeDeltas(descendants);

        // Generate new summary
        const summary = await generateBranchSummary(rootNodeId, intent, nodeDeltas, apiKey);

        // Store it
        await storeBranchSummary(
            rootNodeId,
            intent,
            summary.content,
            summary.confidence,
            summary.coveredNodes,
            false
        );

        // Return the updated summary
        return await prisma.branchSummary.findUnique({
            where: { rootNodeId_intent: { rootNodeId, intent } },
        });
    } catch (error) {
        console.error('Error getting branch summary:', error);
        return null;
    }
}

/**
 * Get all descendant node IDs for a given root node
 */
async function getDescendantNodes(rootNodeId: string): Promise<string[]> {
    try {
        const result = await prisma.$queryRaw<{ id: string }[]>`
            WITH RECURSIVE Descendants AS (
                SELECT id FROM "Node" WHERE id = ${rootNodeId}
                UNION ALL
                SELECT n.id FROM "Node" n
                INNER JOIN Descendants d ON n."parentId" = d.id
            )
            SELECT id FROM Descendants;
        `;
        return result.map(r => r.id);
    } catch (error) {
        console.error('Error getting descendant nodes:', error);
        return [rootNodeId];
    }
}
