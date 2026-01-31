import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAllowedModels } from '@/lib/services/modelService';

export async function GET(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        // Extract API keys from headers
        const geminiKey = request.headers.get('X-Gemini-API-Key') || undefined;
        const openaiKey = request.headers.get('X-OpenAI-API-Key') || undefined;

        // Get allowed models for the user (or global if not authenticated)
        const models = await getAllowedModels(user?.id, { gemini: geminiKey, openai: openaiKey });
        
        return NextResponse.json(models);
    } catch (error) {
        console.error('Error fetching models:', error);
        return NextResponse.json({ error: 'Failed to fetch models' }, { status: 500 });
    }
}
