import { NextResponse } from 'next/server';
import { getModels } from '@/lib/gemini';

export async function GET(request: Request) {
    try {
        const apiKey = request.headers.get('x-gemini-api-key') || undefined;
        const models = await getModels(apiKey);
        return NextResponse.json(models);
    } catch (error) {
        console.error('Error fetching models:', error);
        return NextResponse.json({ error: 'Failed to fetch models' }, { status: 500 });
    }
}
