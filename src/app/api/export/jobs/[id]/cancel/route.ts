import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import prisma from '@/lib/prisma';
import { JobStatus, StageStatus } from '@/lib/services/exportJobs/types';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    try {
        const job = await prisma.markdownConversionJob.findUnique({
            where: { id, userId: user.id }
        });

        if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

        await prisma.markdownConversionJob.update({
            where: { id },
            data: { 
                status: JobStatus.CANCELLED,
                cancelledAt: new Date()
            }
        });

        // Also mark currently running stage as cancelled/failed?
        // Actually, the worker checks job status before running next stage.
        // But if a stage is running, it will finish. That's acceptable for "interruptible".
        
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error cancelling job:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
