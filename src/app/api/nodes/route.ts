import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateGeminiResponse, summarizeContext, DEFAULT_MODEL, streamGeminiResponse } from '@/lib/gemini';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { userPrompt, parentId, folderId, modelMetadata, citations } = body;

        // Validate required fields
        if (!userPrompt) {
            return NextResponse.json({ error: 'User prompt is required' }, { status: 400 });
        }

        // 1. Fetch Parent Node to get context
        let historyContext = null;
        let parentNode = null;

        if (parentId) {
            parentNode = await prisma.node.findUnique({
                where: { id: parentId }
            });

            if (parentNode) {
                historyContext = parentNode.summary; 
            }
        }

        // 1b. Format Citations
        let promptContext = historyContext || "";
        
        if (citations && Array.isArray(citations) && citations.length > 0) {
            const citationText = citations.map((c: any) => 
                `From ${c.source === 'user' ? 'User' : 'AI'} message (Node ${c.nodeId}):\n"${c.text}"`
            ).join('\n\n');
            
            promptContext = `${promptContext}\n\n[Explicit User References / Citations]:\n${citationText}`;
        }

        // 2. Create the new node
        const node = await prisma.node.create({
            data: {
                userPrompt,
                // Use relation connect or undefined (scalar parentId causing issues?)
                parent: parentId ? { connect: { id: parentId } } : undefined,
                // Use relation connect or undefined for folder as well to be safe
                folder: folderId ? { connect: { id: folderId } } : undefined,
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
        const stream = streamGeminiResponse(userPrompt, modelName, promptContext || undefined);
        
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
                    
                    // 4. Compute Summary & Update DB (Background async work effectively)
                    // Note: We need to do this BEFORE closing the stream ideally, or just ensure it completes.
                    // Since this is server-side, we can just await it here before closing controller.
                    
                    const newSummary = await summarizeContext(
                        promptContext || null, 
                        userPrompt,
                        fullAiResponse || null
                    );

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
    // Simple list, maybe filter by folderId?
    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get('folderId');
    const rootsOnly = searchParams.get('rootsOnly') === 'true';

    try {
        const where: any = {};
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
    try {
        const body = await request.json();
        const { id, folderId, parentId } = body;

        if (!id) {
            return NextResponse.json({ error: 'Node ID is required' }, { status: 400 });
        }

        const data: any = {};
        if (folderId !== undefined) data.folderId = folderId;
        // Allow parentId to be null (to cut node) or a string
        if (parentId !== undefined) data.parentId = parentId;

        const node = await prisma.node.update({
            where: { id },
            data,
        });

        return NextResponse.json(node);
    } catch (error) {
        console.error('Error updating node:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
