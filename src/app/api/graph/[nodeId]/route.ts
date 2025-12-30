
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(
    request: Request,
    props: { params: Promise<{ nodeId: string }> }
) {
    const params = await props.params;
    const nodeId = params.nodeId;

    try {
        // Basic verification the node exists
        const rootNode = await prisma.node.findUnique({
            where: { id: nodeId },
        });

        if (!rootNode) {
            return NextResponse.json({ error: 'Node not found' }, { status: 404 });
        }

        const { searchParams } = new URL(request.url);
        const direction = searchParams.get('direction'); // 'descendants' (default) or 'ancestors'

        let query;
        if (direction === 'ancestors') {
            query = prisma.$queryRaw`
                WITH RECURSIVE "Ancestors" AS (
                    SELECT "id", "parentId", "folderId", "summary", "userPrompt", "aiResponse", "modelMetadata", "createdAt", "updatedAt"
                    FROM "Node"
                    WHERE "id" = ${nodeId}
                    
                    UNION ALL
                    
                    SELECT p."id", p."parentId", p."folderId", p."summary", p."userPrompt", p."aiResponse", p."modelMetadata", p."createdAt", p."updatedAt"
                    FROM "Node" p
                    JOIN "Ancestors" c ON c."parentId" = p."id"
                )
                SELECT * FROM "Ancestors"
            `;
        } else {
            // Default: descendants
            query = prisma.$queryRaw`
                WITH RECURSIVE "Tree" AS (
                    SELECT "id", "parentId", "folderId", "summary", "userPrompt", "aiResponse", "modelMetadata", "createdAt", "updatedAt"
                    FROM "Node"
                    WHERE "id" = ${nodeId}
                    
                    UNION ALL
                    
                    SELECT c."id", c."parentId", c."folderId", c."summary", c."userPrompt", c."aiResponse", c."modelMetadata", c."createdAt", c."updatedAt"
                    FROM "Node" c
                    JOIN "Tree" p ON c."parentId" = p."id"
                )
                SELECT * FROM "Tree"
            `;
        }

        const result = await query;
        return NextResponse.json(result);
    } catch (error) {
        console.error('Error fetching graph:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
