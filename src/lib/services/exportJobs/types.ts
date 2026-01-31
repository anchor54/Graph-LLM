export enum JobStage {
  ANALYZING = 'analyzing',
  GRAPH = 'graph',
  INTENT = 'intent',
  PREPARE = 'prepare',
  RENDER = 'render'
}

export enum JobStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export enum StageStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export const STAGE_ORDER = [
  JobStage.ANALYZING,
  JobStage.GRAPH,
  JobStage.INTENT,
  JobStage.PREPARE,
  JobStage.RENDER
];

export interface ExportJobMetadata {
    segmentationJson?: any;
    semanticNodes?: any[];
    exportPlan?: any;
    // ... other artifacts
}
