import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Ensure user exists (in case they only hit folders first)
        await prisma.user.upsert({
            where: { id: user.id },
            update: {},
            create: { id: user.id, email: user.email! }
        });

        const body = await request.json();
        const { name, parentId } = body;

        if (!name) {
            return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
        }

        const folder = await prisma.folder.create({
            data: {
                name,
                parentId,
                userId: user.id,
            },
        });

        return NextResponse.json(folder);
    } catch (error) {
        console.error('Error creating folder:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Return all folders. Client acts as tree builder or we can build tree here.
        // Flat list is easier for now.
        const folders = await prisma.folder.findMany({
            where: { userId: user.id },
            orderBy: { name: 'asc' },
        });
        return NextResponse.json(folders);
    } catch (error) {
        console.error('Error fetching folders:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { id, parentId, name } = body;

        if (!id) {
            return NextResponse.json({ error: 'Folder ID is required' }, { status: 400 });
        }

        const existingFolder = await prisma.folder.findFirst({
            where: { id, userId: user.id }
        });

        if (!existingFolder) {
            return NextResponse.json({ error: 'Folder not found or unauthorized' }, { status: 404 });
        }

        const data: any = {};
        if (parentId !== undefined) data.parentId = parentId;
        if (name !== undefined) data.name = name;

        const folder = await prisma.folder.update({
            where: { id },
            data,
        });

        return NextResponse.json(folder);
    } catch (error) {
        console.error('Error updating folder:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Folder ID is required' }, { status: 400 });
        }

        const existingFolder = await prisma.folder.findFirst({
            where: { id, userId: user.id }
        });

        if (!existingFolder) {
            return NextResponse.json({ error: 'Folder not found or unauthorized' }, { status: 404 });
        }

        await prisma.folder.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting folder:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
