import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateGeminiResponse, summarizeContext, DEFAULT_MODEL } from '@/lib/gemini';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { userPrompt, parentId, folderId, modelMetadata, citations } = body;

        // Validate required fields
        if (!userPrompt) {
            return NextResponse.json({ error: 'User prompt is required' }, { status: 400 });
        }

        // 1. Fetch Parent Node to get context
        // logic: Each node stores the summary of the conversation UP TO AND INCLUDING itself.
        // So when creating a new node, we fetch the parent's summary and use it as the "history context".
        // Then, we generate the NEW summary (parent summary + current prompt + current response) and store it on the NEW node.

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

        // 1b. Format Citations (if any) and append to historyContext for this specific request
        // Note: We don't necessarily want to bake citations into the *stored* summary unless they become part of the narrative.
        // For now, let's treat them as "Supplemental Context" for the LLM.
        let promptContext = historyContext || "";
        
        if (citations && Array.isArray(citations) && citations.length > 0) {
            const citationText = citations.map((c: any) => 
                `From ${c.source === 'user' ? 'User' : 'AI'} message (Node ${c.nodeId}):\n"${c.text}"`
            ).join('\n\n');
            
            promptContext = `${promptContext}\n\n[Explicit User References / Citations]:\n${citationText}`;
        }

        // 2. Create the new node (initially without summary, or we can update it after)
        let node = await prisma.node.create({
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

        // 3. Call Gemini API with the context
        const modelName = modelMetadata?.model || DEFAULT_MODEL;
        // We use promptContext (history + citations) for generation
        const aiResponse = await generateGeminiResponse(userPrompt, modelName, promptContext || undefined);

        // 4. Compute the NEW Summary for this node (History + Prompt + Response)
        // This ensures this node's summary includes itself, ready for its children to use.
        // Note: We pass 'historyContext' (the clean summary) rather than 'promptContext' (summary + citations) 
        // to avoid duplicating citation text into the summary indefinitely, unless the summarizer decides to include it.
        // Actually, better to let the summarizer see the citations too so it understands why the AI answered that way.
        const newSummary = await summarizeContext(
            promptContext || null, 
            userPrompt,
            aiResponse || null
        );

        // 5. Update node with response and the new inclusive summary
        node = await prisma.node.update({
            where: { id: node.id },
            data: { 
                aiResponse,
                summary: newSummary 
            }
        });

        return NextResponse.json(node);
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
