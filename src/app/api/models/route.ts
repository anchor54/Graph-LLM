import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAllowedModels } from '@/lib/services/modelService';

export async function GET(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        // Get allowed models for the user (or global if not authenticated)
        const models = await getAllowedModels(user?.id);
        
        return NextResponse.json(models);
    } catch (error) {
        console.error('Error fetching models:', error);
        return NextResponse.json({ error: 'Failed to fetch models' }, { status: 500 });
    }
}
