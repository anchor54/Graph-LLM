import React, { useState, useEffect } from 'react';
import { useWorkspace } from '@/context/WorkspaceContext';
import { AlertCircle, X, CheckCircle } from 'lucide-react';

export function WorkspaceNotifications() {
   const { nodeError, clearNodeError } = useWorkspace();
   // We can add more notification types here, e.g. for job completion
   const [jobNotification, setJobNotification] = useState<{ id: string, message: string } | null>(null);

   // Poll for completed jobs that we might have missed?
   // Or more simply: If the user started a job, we could store that ID in local storage or context
   // and check it occasionally.
   // For now, let's keep it simple: We only show the error notification from context.
   // Implementing true background job notification requires a global polling mechanism or websocket.
   // Given the "long-lived server" and "navigate away" requirement, a global poller in WorkspaceLayout is reasonable.
   // But let's verify if we want to add that overhead now. 
   // The PRD says "If job completes while dialog is closed, show 'Markdown ready — click to view'".

   useEffect(() => {
       // Simple poller for active jobs
       // Check localStorage for "active_export_job"
       // If exists, poll it. If complete, show notification and clear localStorage.
       
       const checkJob = async () => {
           const activeJobId = localStorage.getItem('active_export_job');
           if (!activeJobId) return;

           try {
               const res = await fetch(`/api/export/jobs/${activeJobId}`);
               if (res.ok) {
                   const job = await res.json();
                   if (job.status === 'completed') {
                       setJobNotification({ id: job.id, message: 'Markdown ready — click to view' });
                       localStorage.removeItem('active_export_job');
                   } else if (job.status === 'failed' || job.status === 'cancelled') {
                       // Silent fail or show error? PRD implies success notification.
                       localStorage.removeItem('active_export_job');
                   }
               }
           } catch (e) {
               console.error("Background job check failed", e);
           }
       };

       const interval = setInterval(checkJob, 5000);
       return () => clearInterval(interval);
   }, []);

   return (
    <>
     {/* Node Error Notification */}
     {nodeError && (
     <div className="fixed top-4 right-4 z-50 max-w-md bg-destructive/10 border border-destructive/50 rounded-lg p-4 shadow-lg animate-in slide-in-from-top-2 duration-300">
       <div className="flex items-start gap-3">
         <AlertCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
         <div className="flex-1">
           <p className="text-sm text-destructive font-medium">Invalid Chat Link</p>
           <p className="text-xs text-muted-foreground mt-1">{nodeError}</p>
         </div>
         <button
           onClick={clearNodeError}
           className="text-muted-foreground hover:text-foreground transition-colors"
           aria-label="Close notification"
         >
           <X className="h-4 w-4" />
         </button>
       </div>
     </div>
     )}

     {/* Job Completion Notification */}
     {jobNotification && (
         <div className="fixed top-4 right-4 z-50 max-w-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 shadow-lg animate-in slide-in-from-top-2 duration-300">
            <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 cursor-pointer" onClick={() => {
                    // Open the dialog somehow? Or just let them know.
                    // Ideally we'd trigger the dialog to open with this job ID.
                    // For now, we just inform them.
                    setJobNotification(null);
                }}>
                    <p className="text-sm font-medium text-green-800 dark:text-green-200">Export Complete</p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">{jobNotification.message}</p>
                </div>
                <button
                    onClick={() => setJobNotification(null)}
                    className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200 transition-colors"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
         </div>
     )}
    </>
   );
}
