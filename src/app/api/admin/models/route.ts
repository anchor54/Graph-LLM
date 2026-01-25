import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
    getAllModels,
    createModel,
    updateModel,
    deleteModel,
    type CreateModelData,
    type UpdateModelData,
} from '@/lib/services/modelService';

// Helper to check if user is admin (you can implement your own logic)
async function isAdmin(userId: string): Promise<boolean> {
    // For now, we'll allow all authenticated users
    // In production, you'd check against a roles table or specific user IDs
    return true;
}

export async function GET(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!(await isAdmin(user.id))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const models = await getAllModels();
        return NextResponse.json(models);
    } catch (error) {
        console.error('Error fetching models:', error);
        return NextResponse.json({ error: 'Failed to fetch models' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!(await isAdmin(user.id))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body: CreateModelData = await request.json();

        // Validate required fields
        if (!body.provider || !body.name || !body.displayName) {
            return NextResponse.json(
                { error: 'Provider, name, and displayName are required' },
                { status: 400 }
            );
        }

        const model = await createModel(body);
        return NextResponse.json(model, { status: 201 });
    } catch (error) {
        console.error('Error creating model:', error);
        return NextResponse.json({ error: 'Failed to create model' }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!(await isAdmin(user.id))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await request.json();
        const { id, ...updateData } = body as { id: string } & UpdateModelData;

        if (!id) {
            return NextResponse.json({ error: 'Model ID is required' }, { status: 400 });
        }

        const model = await updateModel(id, updateData);
        return NextResponse.json(model);
    } catch (error) {
        console.error('Error updating model:', error);
        return NextResponse.json({ error: 'Failed to update model' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!(await isAdmin(user.id))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Model ID is required' }, { status: 400 });
        }

        await deleteModel(id);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting model:', error);
        return NextResponse.json({ error: 'Failed to delete model' }, { status: 500 });
    }
}
