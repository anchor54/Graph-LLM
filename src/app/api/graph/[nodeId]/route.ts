
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';

export async function GET(
    request: Request,
    props: { params: Promise<{ nodeId: string }> }
) {
    const params = await props.params;
    const nodeId = params.nodeId;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Basic verification the node exists and belongs to user
        const rootNode = await prisma.node.findFirst({
            where: { id: nodeId, userId: user.id },
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
                    SELECT "id", "parentId", "folderId", "summary", "userPrompt", "aiResponse", "modelMetadata", "createdAt", "updatedAt", "references"
                    FROM "Node"
                    WHERE "id" = ${nodeId} AND "userId" = ${user.id}
                    
                    UNION ALL
                    
                    SELECT p."id", p."parentId", p."folderId", p."summary", p."userPrompt", p."aiResponse", p."modelMetadata", p."createdAt", p."updatedAt", p."references"
                    FROM "Node" p
                    JOIN "Ancestors" c ON c."parentId" = p."id"
                    WHERE p."userId" = ${user.id}
                )
                SELECT * FROM "Ancestors"
            `;
        } else {
            // Default: descendants
            query = prisma.$queryRaw`
                WITH RECURSIVE "Tree" AS (
                    SELECT "id", "parentId", "folderId", "summary", "userPrompt", "aiResponse", "modelMetadata", "createdAt", "updatedAt", "references"
                    FROM "Node"
                    WHERE "id" = ${nodeId} AND "userId" = ${user.id}
                    
                    UNION ALL
                    
                    SELECT c."id", c."parentId", c."folderId", c."summary", c."userPrompt", c."aiResponse", c."modelMetadata", c."createdAt", c."updatedAt", c."references"
                    FROM "Node" c
                    JOIN "Tree" p ON c."parentId" = p."id"
                    WHERE c."userId" = ${user.id}
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
