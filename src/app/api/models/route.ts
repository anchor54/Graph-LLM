import { NextResponse } from 'next/server';
import { getModels } from '@/lib/gemini';

export async function GET() {
    try {
        const models = await getModels();
        return NextResponse.json(models);
    } catch (error) {
        console.error('Error fetching models:', error);
        return NextResponse.json({ error: 'Failed to fetch models' }, { status: 500 });
    }
}
