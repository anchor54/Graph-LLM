import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import prisma from '@/lib/prisma';
import { JobStatus, StageStatus, STAGE_ORDER } from '@/lib/services/exportJobs/types';
import { ExportJobWorker } from '@/lib/services/exportJobs/ExportJobWorker';

// Ensure worker is started
// In Next.js dev mode, this might run multiple times, but in prod server it's once per process.
// We lazily start it here.
const worker = ExportJobWorker.getInstance();

export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const body = await req.json();
        const { nodeId, scope, userIntent } = body;

        if (!nodeId || !scope) {
            return NextResponse.json({ error: 'Missing nodeId or scope' }, { status: 400 });
        }

        // Create Job
        const job = await prisma.markdownConversionJob.create({
            data: {
                userId: user.id,
                nodeId,
                scope,
                intentText: userIntent,
                status: JobStatus.QUEUED,
                currentStage: STAGE_ORDER[0],
                stages: {
                    create: STAGE_ORDER.map(key => ({
                        key,
                        status: StageStatus.PENDING
                    }))
                }
            }
        });

        // Ensure worker is polling
        worker.start();

        return NextResponse.json({ jobId: job.id });
    } catch (error) {
        console.error("Error creating export job:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
