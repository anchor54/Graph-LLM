import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateGeminiResponse, summarizeContext, generateChatName, DEFAULT_MODEL, streamGeminiResponse } from '@/lib/gemini';
import { createClient } from '@/lib/supabase/server';

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

        // 1. Fetch Parent Node to get context
        let historyContext = null;
        let parentNode = null;

        if (parentId) {
            parentNode = await prisma.node.findFirst({
                where: { id: parentId, userId: user.id }
            });

            if (!parentNode) {
                return NextResponse.json({ error: 'Parent node not found' }, { status: 404 });
            }

            historyContext = parentNode.summary; 
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
                        // Existing conversation - Summarize Context
                        newSummary = await summarizeContext(
                            promptContext || null, 
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
