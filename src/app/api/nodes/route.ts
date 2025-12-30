import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateGeminiResponse, summarizeContext, DEFAULT_MODEL } from '@/lib/gemini';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { userPrompt, parentId, folderId, modelMetadata } = body;

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
                // Since we want each node to store the summary including itself, 
                // the parent's `summary` field SHOULD contain the summary of everything up to the parent.
                // We use this directly as the context for the current generation.
                
                // Fallback: If parent has no summary (legacy), we might want to generate one on the fly, 
                // but for now let's assume valid state or start fresh.
                historyContext = parentNode.summary; 
            }
        }

        // 2. Create the new node (initially without summary, or we can update it after)
        let node = await prisma.node.create({
            data: {
                userPrompt,
                parentId,
                folderId,
                modelMetadata: modelMetadata ?? {},
                aiResponse: null,
                summary: null, // We will compute this AFTER we get the AI response
            },
        });

        // 3. Call Gemini API with the context
        const modelName = modelMetadata?.model || DEFAULT_MODEL;
        const aiResponse = await generateGeminiResponse(userPrompt, modelName, historyContext || undefined);

        // 4. Compute the NEW Summary for this node (History + Prompt + Response)
        // This ensures this node's summary includes itself, ready for its children to use.
        const newSummary = await summarizeContext(
            historyContext || null,
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
