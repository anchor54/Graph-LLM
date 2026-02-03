'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ExportPlan, ExportScope } from '@/types';
import { Loader2, Download, Copy, Check, X, RefreshCw, AlertCircle } from 'lucide-react';
import { JobStage, JobStatus, StageStatus, STAGE_ORDER } from '@/lib/services/exportJobs/types';
import { cn } from '@/lib/utils';

interface MarkdownExportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    nodeId: string | null;
}

const STAGE_LABELS: Record<string, string> = {
    [JobStage.ANALYZING]: 'Analyzing discussions',
    [JobStage.GRAPH]: 'Building thought graph',
    [JobStage.INTENT]: 'Interpreting your intent',
    [JobStage.PREPARE]: 'Preparing document',
    [JobStage.RENDER]: 'Finalizing markdown',
};

export function MarkdownExportDialog({ open, onOpenChange, nodeId }: MarkdownExportDialogProps) {
    const [step, setStep] = useState<'config' | 'processing' | 'preview'>('config');
    const [scope, setScope] = useState<ExportScope>('subtree');
    const [intent, setIntent] = useState('');
    const [jobId, setJobId] = useState<string | null>(null);
    const [jobStatus, setJobStatus] = useState<any>(null);
    const [markdown, setMarkdown] = useState('');
    const [copied, setCopied] = useState(false);
    const [polling, setPolling] = useState(false);

    // Reset when closed
    useEffect(() => {
        if (!open) {
            // If we have a running job, we should probably keep polling in background?
            // PRD says: "If user navigated away... Show toast notification"
            // So if we close dialog, we stop polling HERE, but global layout might need to pick it up?
            // For now, let's just reset UI state.
            if (jobId && jobStatus?.status === JobStatus.RUNNING) {
                 // We don't want to cancel the job, just close the view.
                 // We need a way to "re-attach" to the job if we open dialog again on same node?
                 // That's complex. Let's stick to simple flow first.
            }
        } else {
             if (step !== 'processing' && step !== 'preview') {
                 setStep('config');
             }
        }
    }, [open]);

    // Poll job status
    useEffect(() => {
        if (!jobId || !polling) return;

        const poll = async () => {
            try {
                const res = await fetch(`/api/export/jobs/${jobId}`);
                if (res.ok) {
                    const job = await res.json();
                    setJobStatus(job);

                    if (job.status === JobStatus.COMPLETED) {
                        setMarkdown(job.resultMarkdown || '');
                        setStep('preview');
                        setPolling(false);
                    } else if (job.status === JobStatus.FAILED || job.status === JobStatus.CANCELLED) {
                        setPolling(false);
                    }
                }
            } catch (e) {
                console.error("Polling error", e);
            }
        };

        const interval = setInterval(poll, 1000);
        poll(); // Immediate check

        return () => clearInterval(interval);
    }, [jobId, polling]);

    const startJob = async () => {
        if (!nodeId) return;
        setStep('processing');
        setPolling(true);
        setJobStatus(null);
        
        try {
            const res = await fetch('/api/export/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nodeId, scope, userIntent: intent })
            });
            if (res.ok) {
                const { jobId } = await res.json();
                setJobId(jobId);
            } else {
                 // Handle start error
                 setStep('config');
                 setPolling(false);
            }
        } catch (e) {
            console.error(e);
            setStep('config');
            setPolling(false);
        }
    };

    const cancelJob = async () => {
        if (!jobId) return;
        try {
            await fetch(`/api/export/jobs/${jobId}/cancel`, { method: 'POST' });
            // Poll will catch the update
        } catch (e) {
            console.error(e);
        }
    };

    const retryStage = async (stageKey: string) => {
        if (!jobId) return;
        setPolling(true); // Resume polling
        try {
             await fetch(`/api/export/jobs/${jobId}/retry`, {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ stageKey })
             });
        } catch (e) {
            console.error(e);
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(markdown);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const downloadMarkdown = () => {
        const blob = new Blob([markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `export-${Date.now()}.md`;
        a.click();
    };

    const renderStage = (key: string) => {
        const stage = jobStatus?.stages?.find((s: any) => s.key === key);
        const status = stage?.status || StageStatus.PENDING;
        
        let icon = <div className="w-4 h-4 rounded-full border border-muted-foreground/30" />;
        let textClass = "text-muted-foreground";

        if (status === StageStatus.COMPLETED) {
            icon = <Check className="w-4 h-4 text-green-500" />;
            textClass = "text-foreground";
        } else if (status === StageStatus.IN_PROGRESS) {
            icon = <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
            textClass = "text-blue-500 font-medium";
        } else if (status === StageStatus.FAILED) {
            icon = <X className="w-4 h-4 text-red-500" />;
            textClass = "text-red-500";
        }

        return (
            <div key={key} className="flex items-center justify-between py-2 border-b last:border-0 border-border/50">
                <div className="flex items-center gap-3">
                    {icon}
                    <span className={cn("text-sm", textClass)}>{STAGE_LABELS[key]}</span>
                </div>
                {status === StageStatus.FAILED && (
                     <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => retryStage(key)}>
                        <RefreshCw className="w-3 h-3 mr-1" /> Retry
                     </Button>
                )}
            </div>
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Export to Markdown</DialogTitle>
                    <DialogDescription>Convert this conversation into a structured document.</DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto py-4">
                    {step === 'config' && (
                        <div className="space-y-6">
                            <div className="space-y-3">
                                <label className="text-sm font-medium">Export Scope</label>
                                <div className="grid grid-cols-2 gap-4">
                                    <div 
                                        className={`border rounded-lg p-4 cursor-pointer transition-colors ${scope === 'subtree' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50'}`}
                                        onClick={() => setScope('subtree')}
                                    >
                                        <div className="font-semibold mb-1">Subtree (Default)</div>
                                        <div className="text-xs text-muted-foreground">Export selected node and all its descendants.</div>
                                    </div>
                                    <div 
                                        className={`border rounded-lg p-4 cursor-pointer transition-colors ${scope === 'root_to_current' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50'}`}
                                        onClick={() => setScope('root_to_current')}
                                    >
                                        <div className="font-semibold mb-1">Root to Current</div>
                                        <div className="text-xs text-muted-foreground">Export the path from conversation start to here.</div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-sm font-medium">Intent (Optional)</label>
                                <Input 
                                    placeholder="e.g. Summarize key decisions and open questions" 
                                    value={intent}
                                    onChange={(e) => setIntent(e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">Describe what you want to extract. Leave empty for a general summary.</p>
                            </div>
                        </div>
                    )}

                    {step === 'processing' && (
                        <div className="space-y-4">
                            <div className="bg-muted/30 p-4 rounded-md border text-sm">
                                {STAGE_ORDER.map(key => renderStage(key))}
                            </div>
                            
                            {jobStatus?.status === JobStatus.FAILED && (
                                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-md text-sm">
                                    <AlertCircle className="w-4 h-4" />
                                    <span>Process failed: {jobStatus.errorMessage || "Unknown error"}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {step === 'preview' && (
                        <div className="border rounded-md p-4 bg-muted/10 h-[300px] overflow-y-auto">
                            <pre className="whitespace-pre-wrap text-sm font-mono">{markdown}</pre>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    {step === 'config' && (
                        <Button onClick={startJob}>
                            Start Conversion
                        </Button>
                    )}
                    {step === 'processing' && (
                         <div className="flex justify-between w-full">
                            {jobStatus?.status === JobStatus.FAILED ? (
                                <Button variant="ghost" onClick={() => setStep('config')}>Back to Config</Button>
                            ) : (
                                <Button variant="ghost" className="text-muted-foreground" onClick={cancelJob} disabled={jobStatus?.status === JobStatus.CANCELLED}>
                                    Cancel
                                </Button>
                            )}
                            {/* Retry logic is per-stage */}
                         </div>
                    )}
                    {step === 'preview' && (
                        <>
                            <Button variant="outline" onClick={() => setStep('config')}>Back</Button>
                            <Button variant="secondary" onClick={copyToClipboard}>
                                {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                                {copied ? 'Copied' : 'Copy'}
                            </Button>
                            <Button onClick={downloadMarkdown}>
                                <Download className="mr-2 h-4 w-4" />
                                Download
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
