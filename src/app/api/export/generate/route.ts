import { NextRequest, NextResponse } from 'next/server';
import { DistillationService } from '@/lib/services/distillation/distillationService';
import { MarkdownRenderer } from '@/lib/services/distillation/markdownRenderer';
import { ExportPlan, ExportScope } from '@/types';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { nodeId, scope, plan } = await req.json();

        if (!nodeId || !scope || !plan) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }
        
        const thoughtGraph = await DistillationService.distill(nodeId, scope as ExportScope, user.id);
        const markdown = MarkdownRenderer.render(plan as ExportPlan, thoughtGraph);

        return NextResponse.json({ markdown, thoughtGraph });
    } catch (error) {
        console.error('Error generating markdown:', error);
        return NextResponse.json({ error: 'Failed to generate markdown' }, { status: 500 });
    }
}
