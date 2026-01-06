'use client';

import { Sidebar } from '@/components/workspace/Sidebar';
import { ChatInterface } from '@/components/workspace/ChatInterface';
import { GraphVisualization } from '@/components/workspace/GraphVisualization';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Menu, PanelRight, X, AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useWorkspace } from '@/context/WorkspaceContext';

function NodeErrorNotification() {
   const { nodeError, clearNodeError } = useWorkspace();

   if (!nodeError) return null;

   return (
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
   );
}

export function WorkspaceLayout() {
   const isMobile = useIsMobile();
   const [mounted, setMounted] = useState(false);

   useEffect(() => {
     setMounted(true);
   }, []);

   if (!mounted) return null;

   if (isMobile) {
     return (
       <>
         <NodeErrorNotification />
         <div className="flex flex-col h-screen overflow-hidden bg-background text-foreground">
            <header className="flex items-center justify-between p-2 border-b border-border h-14 shrink-0 bg-background">
               <Sheet>
                 <SheetTrigger asChild>
                   <Button variant="ghost" size="icon">
                     <Menu className="h-5 w-5" />
                   </Button>
                 </SheetTrigger>
                 <SheetContent side="left" className="p-0 w-[300px]">
                   <Sidebar />
                 </SheetContent>
               </Sheet>
               
               <span className="font-semibold text-sm">Graph LLM</span>

               <Sheet>
                 <SheetTrigger asChild>
                   <Button variant="ghost" size="icon">
                     <PanelRight className="h-5 w-5" />
                   </Button>
                 </SheetTrigger>
                 <SheetContent side="right" className="p-0 w-[90vw] sm:w-[400px]">
                   <GraphVisualization />
                 </SheetContent>
               </Sheet>
            </header>
            <div className="flex-1 overflow-hidden">
              <ChatInterface />
            </div>
         </div>
       </>
     );
   }

   return (
      <>
        <NodeErrorNotification />
        <div className="h-screen w-full flex flex-col overflow-hidden">
          <ResizablePanelGroup direction="horizontal" className="flex-1" id="main-group">
            <ResizablePanel defaultSize={20} minSize={15} maxSize={30} id="sidebar-panel">
              <Sidebar />
            </ResizablePanel>

            <ResizableHandle id="sidebar-handle" />

            <ResizablePanel defaultSize={50} minSize={30} id="chat-panel">
              <ChatInterface />
            </ResizablePanel>

            <ResizableHandle id="chat-handle" />

            <ResizablePanel defaultSize={30} minSize={20} id="graph-panel">
              <GraphVisualization />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </>
   );
}

