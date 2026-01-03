import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateGeminiResponse, summarizeInteraction, generateChatName, DEFAULT_MODEL, streamGeminiResponse } from '@/lib/gemini';
import { createClient } from '@/lib/supabase/server';

// Helper to fetch ancestor chain
async function getAncestorChain(nodeId: string, userId: string) {
    try {
        // Use raw query for recursive fetch
        // Note: Table name "Node" must be quoted if case sensitive in DB, usually Prisma uses PascalCase model -> "Node" table
        const result = await prisma.$queryRaw<any[]>`
            WITH RECURSIVE Ancestors AS (
                SELECT id, "parentId", "userPrompt", "aiResponse", summary, "modelMetadata", "createdAt"
                FROM "Node"
                WHERE id = ${nodeId} AND "userId" = ${userId}
                
                UNION ALL
                
                SELECT n.id, n."parentId", n."userPrompt", n."aiResponse", n.summary, n."modelMetadata", n."createdAt"
                FROM "Node" n
                INNER JOIN Ancestors a ON n.id = a."parentId"
            )
            SELECT * FROM Ancestors ORDER BY "createdAt" ASC;
        `;
        return result;
    } catch (error) {
        console.error("Error fetching ancestors:", error);
        return [];
    }
}

export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { userPrompt, parentId, folderId, modelMetadata, citations } = body;
        const apiKey = request.headers.get('x-gemini-api-key') || undefined;

        // Validate required fields
        if (!userPrompt) {
            return NextResponse.json({ error: 'User prompt is required' }, { status: 400 });
        }

        // Ensure user exists in Prisma
        await prisma.user.upsert({
            where: { id: user.id },
            update: {},
            create: { id: user.id, email: user.email! }
        });

        // 1. Build Context from Ancestors
        let promptContext = "";
        let ancestorNodes: any[] = [];

        if (parentId) {
            // Fetch the parent and all its ancestors
            ancestorNodes = await getAncestorChain(parentId, user.id);
            
            // If parentId was provided but no nodes returned, it means the parent doesn't exist or isn't owned by user
            // (Assuming getAncestorChain returns at least the parent if it exists)
            // However, getAncestorChain returns ancestors of the node ID passed. 
            // If we pass parentId, it returns parent and its ancestors.
            if (ancestorNodes.length === 0) {
                 // Double check if it's just a missing parent or query failure
                 // But for now, if we expect a parent and get none, treat as error or detached.
                 // Actually, let's verify if parent exists separately if result is empty? 
                 // No, getAncestorChain does the job.
                 const check = await prisma.node.findUnique({ where: { id: parentId } });
                 if (!check || check.userId !== user.id) {
                     return NextResponse.json({ error: 'Parent node not found' }, { status: 404 });
                 }
                 // If check passed but chain empty, something weird happened with CTE, maybe just return check?
                 // But CTE should work.
            }
        }

        // Partition History
        // We want the last 10 interactions as full text
        const recentHistory = ancestorNodes.slice(-10);
        // Everything before that is deep history
        const olderHistory = ancestorNodes.slice(0, -10);

        // Build Summaries from Deep History
        const deepHistorySummary = olderHistory.map(node => {
            const summary = node.summary;
            if (summary) return `Summary of interaction: ${summary}`;
            // Fallback if no summary exists
            return `Interaction: User asked "${node.userPrompt.substring(0, 50)}..." and AI responded.`;
        }).join("\n");

        // Format Recent History (Full Text)
        const recentHistoryText = recentHistory.map(node => 
            `User: ${node.userPrompt}\nAI: ${node.aiResponse || "(No response)"}`
        ).join("\n\n");

        // Aggregate Citations
        // 1. Ancestor citations
        const ancestorCitations = ancestorNodes.flatMap(node => {
            const meta = node.modelMetadata;
            if (meta && typeof meta === 'object' && !Array.isArray(meta) && meta.citations && Array.isArray(meta.citations)) {
                return meta.citations;
            }
            return [];
        });

        // 2. Current request citations
        const currentCitations = citations || [];
        const allCitations = [...ancestorCitations, ...currentCitations];
        
        // Deduplicate citations based on text
        const uniqueCitationsMap = new Map();
        allCitations.forEach(c => {
            if (c && c.text) uniqueCitationsMap.set(c.text, c);
        });
        const uniqueCitations = Array.from(uniqueCitationsMap.values());

        // Construct Final Prompt Context
        const contextParts = [];
        
        if (deepHistorySummary) {
            contextParts.push(`--- PREVIOUS CONVERSATION SUMMARIES ---\n${deepHistorySummary}`);
        }
        
        if (uniqueCitations.length > 0) {
            const citationText = uniqueCitations.map((c: any) => 
                `"${c.text}" (Source: ${c.source === 'user' ? 'User' : 'AI'} message)`
            ).join('\n');
            contextParts.push(`--- REFERENCED QUOTES ---\n${citationText}`);
        }

        if (recentHistoryText) {
             contextParts.push(`--- RECENT CONVERSATION ---\n${recentHistoryText}`);
        }

        promptContext = contextParts.join("\n\n");

        // 2. Create the new node
        const node = await prisma.node.create({
            data: {
                userPrompt,
                userId: user.id,
                parentId: parentId || undefined,
                folderId: folderId || undefined,
                modelMetadata: {
                    ...(modelMetadata ?? {}),
                    citations: citations ?? []
                },
                aiResponse: null,
                summary: null, // We will compute this AFTER we get the AI response
            },
        });

        // 3. Setup Streaming Response
        const modelName = modelMetadata?.model || DEFAULT_MODEL;
        const stream = streamGeminiResponse(userPrompt, modelName, promptContext || undefined, apiKey);
        
        const encoder = new TextEncoder();
        
        // Return a streaming response immediately
        return new Response(new ReadableStream({
            async start(controller) {
                let fullAiResponse = "";
                
                // Send initial node ID to client so it can update the temp ID
                const initialData = JSON.stringify({ nodeId: node.id });
                controller.enqueue(encoder.encode(`data: ${initialData}\n\n`));

                try {
                    for await (const chunk of stream) {
                        fullAiResponse += chunk;
                        const data = JSON.stringify({ chunk });
                        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                    }
                    
                    // Stream finished
                    
                    // 4. Compute Summary/Title & Update DB
                    let newSummary = "";

                    if (!parentId) {
                        // New conversation - Generate Title
                        newSummary = await generateChatName(userPrompt, fullAiResponse || "", apiKey);
                    } else {
                        // Existing conversation - Summarize THIS Interaction only
                        newSummary = await summarizeInteraction(
                            userPrompt,
                            fullAiResponse || null,
                            apiKey
                        );
                    }

                    await prisma.node.update({
                        where: { id: node.id },
                        data: { 
                            aiResponse: fullAiResponse,
                            summary: newSummary 
                        }
                    });

                } catch (e) {
                    console.error("Streaming error:", e);
                    const errorData = JSON.stringify({ error: "Stream failed" });
                    controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
                } finally {
                    controller.close();
                }
            }
        }), {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });

    } catch (error) {
        console.error('Error creating node:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function GET(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Simple list, maybe filter by folderId?
    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get('folderId');
    const rootsOnly = searchParams.get('rootsOnly') === 'true';

    try {
        const where: any = { userId: user.id };
        if (folderId) where.folderId = folderId;
        if (rootsOnly) where.parentId = null;

        const nodes = await prisma.node.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 100, // Limit for safety
        });
        return NextResponse.json(nodes);
    } catch (error) {
        console.error('Error fetching nodes:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { id, folderId, parentId, summary } = body;

        if (!id) {
            return NextResponse.json({ error: 'Node ID is required' }, { status: 400 });
        }

        const data: any = {};
        if (folderId !== undefined) data.folderId = folderId;
        // Allow parentId to be null (to cut node) or a string
        if (parentId !== undefined) data.parentId = parentId;
        if (summary !== undefined) data.summary = summary;

        const node = await prisma.node.findFirst({
            where: { id, userId: user.id }
        });

        if (!node) {
            return NextResponse.json({ error: 'Node not found or unauthorized' }, { status: 404 });
        }

        const updatedNode = await prisma.node.update({
            where: { id },
            data,
        });

        return NextResponse.json(updatedNode);
    } catch (error) {
        console.error('Error updating node:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'Node ID is required' }, { status: 400 });
    }

    try {
        const existingNode = await prisma.node.findFirst({
            where: { id, userId: user.id }
        });

        if (!existingNode) {
            return NextResponse.json({ error: 'Node not found or unauthorized' }, { status: 404 });
        }

        await prisma.node.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting node:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
