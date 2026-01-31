import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import prisma from '@/lib/prisma';
import { JobStatus, StageStatus, STAGE_ORDER } from '@/lib/services/exportJobs/types';
import { ExportJobWorker } from '@/lib/services/exportJobs/ExportJobWorker';

const worker = ExportJobWorker.getInstance();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    try {
        const { stageKey } = await req.json();
        
        const job = await prisma.markdownConversionJob.findUnique({
            where: { id, userId: user.id },
            include: { stages: true }
        });

        if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        
        // Find index of stage to retry
        const retryIndex = STAGE_ORDER.indexOf(stageKey);
        if (retryIndex === -1) return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });

        // Reset this stage and all subsequent stages to PENDING
        // Also clear error messages
        const stagesToReset = STAGE_ORDER.slice(retryIndex);
        
        await prisma.markdownConversionStage.updateMany({
            where: { 
                jobId: id,
                key: { in: stagesToReset }
            },
            data: {
                status: StageStatus.PENDING,
                startedAt: null,
                completedAt: null,
                errorMessage: null
            }
        });

        // Set job back to QUEUED (or RUNNING if we want it picked up immediately)
        // QUEUED is safer logic with worker.
        await prisma.markdownConversionJob.update({
            where: { id },
            data: {
                status: JobStatus.QUEUED,
                errorMessage: null,
                completedAt: null,
                cancelledAt: null,
                currentStage: stageKey
            }
        });

        worker.start();

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error retrying job:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
