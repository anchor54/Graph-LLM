import { NextRequest, NextResponse } from 'next/server';
import { ExportPlanner } from '@/lib/services/distillation/exportPlanner';
import { ExportScope } from '@/types';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { nodeId, scope, userIntent } = await req.json();
        
        if (!nodeId || !scope) {
            return NextResponse.json({ error: 'Missing nodeId or scope' }, { status: 400 });
        }

        const plan = await ExportPlanner.generateExportPlan(userIntent, scope as ExportScope);
        return NextResponse.json(plan);
    } catch (error) {
        console.error('Error generating export plan:', error);
        return NextResponse.json({ error: 'Failed to generate plan' }, { status: 500 });
    }
}
