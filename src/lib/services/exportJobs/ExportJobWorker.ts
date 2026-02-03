import prisma from '@/lib/prisma';
import { JobStatus, StageStatus, STAGE_ORDER } from './types';
import { StageRunner } from './stages';

export class ExportJobWorker {
    private static instance: ExportJobWorker;
    private isRunning: boolean = false;
    private intervalId: NodeJS.Timeout | null = null;
    private readonly POLL_INTERVAL = 2000; // 2 seconds

    private constructor() {}

    static getInstance(): ExportJobWorker {
        if (!ExportJobWorker.instance) {
            ExportJobWorker.instance = new ExportJobWorker();
        }
        return ExportJobWorker.instance;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log("Starting ExportJobWorker...");
        
        // Use a loop or interval. Interval is simpler for this scope.
        this.intervalId = setInterval(() => this.processNextJob(), this.POLL_INTERVAL);
    }

    stop() {
        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    private async processNextJob() {
        try {
            // Find a running job or a queued job
            // We prioritize jobs that are already 'running' but might have stalled (server restart)
            // Or just pick the oldest queued job.
            
            // Actually, we need to pick a job that is NOT completed/failed/cancelled.
            // And ideally one that is not currently being processed by another worker instance (if scaled).
            // Since we are single-instance per PRD, simple query is fine.
            
            const job = await prisma.markdownConversionJob.findFirst({
                where: {
                    status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] }
                },
                orderBy: { createdAt: 'asc' },
                include: { stages: true }
            });

            if (!job) return;

            // Determine next pending stage
            // We iterate STAGE_ORDER. The first one that is PENDING is our target.
            // If a stage is FAILED, we stop (job should be failed).
            // If a stage is IN_PROGRESS, we resume it (idempotency required or we assume crash).
            // For simplicity, if IN_PROGRESS, we treat as "resume".
            
            let targetStageKey: string | null = null;

            for (const key of STAGE_ORDER) {
                const stage = job.stages.find(s => s.key === key);
                if (!stage) continue; // Should not happen if seeded correctly

                if (stage.status === StageStatus.FAILED) {
                    // Job is failed, update job status if mismatch
                    if (job.status !== JobStatus.FAILED) {
                         await prisma.markdownConversionJob.update({
                             where: { id: job.id },
                             data: { status: JobStatus.FAILED }
                         });
                    }
                    return; 
                }

                if (stage.status === StageStatus.PENDING || stage.status === StageStatus.IN_PROGRESS) {
                    targetStageKey = key;
                    break;
                }
            }

            if (!targetStageKey) {
                // All stages completed? Mark job completed if not already
                if (job.status !== JobStatus.COMPLETED) {
                     await prisma.markdownConversionJob.update({
                         where: { id: job.id },
                         data: { status: JobStatus.COMPLETED, completedAt: new Date() }
                     });
                }
                return;
            }

            // Lock job to RUNNING if it was QUEUED
            if (job.status === JobStatus.QUEUED) {
                await prisma.markdownConversionJob.update({
                    where: { id: job.id },
                    data: { status: JobStatus.RUNNING, startedAt: new Date() }
                });
            }

            // Run the stage
            // console.log(`Running stage ${targetStageKey} for job ${job.id}`);
            await StageRunner.runStage(job.id, targetStageKey);

        } catch (error) {
            console.error("ExportJobWorker error:", error);
        }
    }
}
