import prisma from '@/lib/prisma';
import { JobStage, JobStatus, StageStatus, STAGE_ORDER } from './types';
import { DistillationService } from '@/lib/services/distillation/distillationService';
import { ExportPlanner } from '@/lib/services/distillation/exportPlanner';
import { MarkdownRenderer } from '@/lib/services/distillation/markdownRenderer';
import { ExportScope, ExportPlan, SemanticNode } from '@/types';

export class StageRunner {
    static async runStage(jobId: string, stageKey: string): Promise<void> {
        const job = await prisma.markdownConversionJob.findUnique({ 
            where: { id: jobId },
            include: { user: true } // Assuming we might need user context
        });
        if (!job) throw new Error(`Job ${jobId} not found`);

        // Update stage to in_progress
        await prisma.markdownConversionStage.update({
            where: { jobId_key: { jobId, key: stageKey } },
            data: { status: StageStatus.IN_PROGRESS, startedAt: new Date() }
        });

        await prisma.markdownConversionJob.update({
            where: { id: jobId },
            data: { currentStage: stageKey }
        });

        try {
            switch (stageKey) {
                case JobStage.ANALYZING:
                    await this.runAnalyzingStage(job);
                    break;
                case JobStage.GRAPH:
                    await this.runGraphStage(job);
                    break;
                case JobStage.INTENT:
                    await this.runIntentStage(job);
                    break;
                case JobStage.PREPARE:
                    await this.runPrepareStage(job);
                    break;
                case JobStage.RENDER:
                    await this.runRenderStage(job);
                    break;
                default:
                    throw new Error(`Unknown stage ${stageKey}`);
            }

            // Mark stage completed
            await prisma.markdownConversionStage.update({
                where: { jobId_key: { jobId, key: stageKey } },
                data: { status: StageStatus.COMPLETED, completedAt: new Date() }
            });

        } catch (error: any) {
            console.error(`Error in stage ${stageKey} for job ${jobId}:`, error);
            
            // Mark stage failed
            await prisma.markdownConversionStage.update({
                where: { jobId_key: { jobId, key: stageKey } },
                data: { status: StageStatus.FAILED, errorMessage: error.message }
            });

            // Mark job failed
            await prisma.markdownConversionJob.update({
                where: { id: jobId },
                data: { status: JobStatus.FAILED, errorMessage: error.message }
            });
            
            throw error; // Re-throw to stop the worker loop for this job
        }
    }

    private static async runAnalyzingStage(job: any) {
        // 1. Fetch nodes (no side effects on DB yet)
        const chatNodes = await DistillationService.getChatNodes(job.nodeId, job.scope as ExportScope, job.userId);
        
        // 2. Segment
        const segments = await DistillationService.segmentChat(chatNodes);
        
        // 3. Extract semantics
        const semanticNodes = await DistillationService.extractSemantics(segments);
        
        // Persist artifacts: Create ThoughtGraph and SemanticNodes
        // We do this here so subsequent stages can read from DB or we pass them in metadata.
        // For robustness, let's persist to DB now.
        
        const thoughtGraph = await prisma.thoughtGraph.create({
            data: {
                userId: job.userId,
                rootNodeId: job.nodeId,
                nodes: {
                    create: semanticNodes.map((n: SemanticNode) => ({
                        type: n.type,
                        title: n.title,
                        summary: n.summary,
                        sourceNodeIds: n.sourceNodeIds,
                        confidence: n.confidence
                    }))
                }
            }
        });

        // Link job to thought graph
        await prisma.markdownConversionJob.update({
            where: { id: job.id },
            data: { thoughtGraphId: thoughtGraph.id }
        });
        
        // Store metadata if needed for debugging or recovery (e.g. segments)
        await prisma.markdownConversionStage.update({
             where: { jobId_key: { jobId: job.id, key: JobStage.ANALYZING } },
             data: { metadata: { segmentCount: segments.length, nodeCount: semanticNodes.length } }
        });
    }

    private static async runGraphStage(job: any) {
        if (!job.thoughtGraphId) throw new Error("Missing thoughtGraphId");
        
        // Fetch semantic nodes from DB
        const semanticNodes = await prisma.semanticNode.findMany({
            where: { graphId: job.thoughtGraphId }
        });
        
        // Link nodes
        // Map Prisma model back to interface expected by service
        const serviceNodes = semanticNodes.map(n => ({
            id: n.id,
            type: n.type,
            title: n.title,
            summary: n.summary,
            sourceNodeIds: n.sourceNodeIds as string[],
            confidence: n.confidence || undefined
        })) as SemanticNode[];

        const edges = await DistillationService.linkNodes(serviceNodes);
        
        // Persist edges
        if (edges.length > 0) {
            await prisma.thoughtEdge.createMany({
                data: edges.map(e => ({
                    graphId: job.thoughtGraphId,
                    fromId: e.fromNodeId,
                    toId: e.toNodeId,
                    relation: e.relation
                }))
            });
        }
    }

    private static async runIntentStage(job: any) {
        const plan = await ExportPlanner.generateExportPlan(job.intentText || undefined, job.scope as ExportScope);
        
        await prisma.markdownConversionJob.update({
            where: { id: job.id },
            data: { exportPlan: plan as any }
        });
    }

    private static async runPrepareStage(job: any) {
        // This stage might re-order or filter nodes in memory before rendering.
        // For now, it effectively validates the plan against the graph.
        // We can just mark it complete if no heavy lifting is needed.
        // Or store "ready" metadata.
        if (!job.exportPlan) throw new Error("Missing export plan");
    }

    private static async runRenderStage(job: any) {
        if (!job.thoughtGraphId || !job.exportPlan) throw new Error("Missing graph or plan");

        // Fetch full graph
        const graphData = await prisma.thoughtGraph.findUnique({
             where: { id: job.thoughtGraphId },
             include: { nodes: true, edges: true }
        });
        if (!graphData) throw new Error("Graph not found");

        // Convert to interface
        const graph = {
            id: graphData.id,
            nodes: graphData.nodes.map(n => ({ ...n, sourceNodeIds: n.sourceNodeIds as string[] })),
            edges: graphData.edges.map(e => ({ ...e, fromNodeId: e.fromId, toNodeId: e.toId }))
        } as any; // Cast to ThoughtGraph interface

        const markdown = MarkdownRenderer.render(job.exportPlan as ExportPlan, graph);

        await prisma.markdownConversionJob.update({
            where: { id: job.id },
            data: { 
                resultMarkdown: markdown,
                status: JobStatus.COMPLETED,
                completedAt: new Date()
            }
        });
    }
}
