'use client';

import { Sidebar } from '@/components/workspace/Sidebar';
import { ChatInterface } from '@/components/workspace/ChatInterface';
import { GraphVisualization } from '@/components/workspace/GraphVisualization';
import { GeminiKeyDialog } from '@/components/workspace/GeminiKeyDialog';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"

import { WorkspaceProvider } from '@/context/WorkspaceContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Menu, PanelRight } from 'lucide-react';
import { useEffect, useState } from 'react';

function WorkspaceLayout() {
   const isMobile = useIsMobile();
   const [mounted, setMounted] = useState(false);

   useEffect(() => {
     setMounted(true);
   }, []);

   if (!mounted) return null;

   if (isMobile) {
     return (
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
     );
   }

   return (
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
   );
}

export default function Home() {
  return (
    <WorkspaceProvider>
      <GeminiKeyDialog />
      <WorkspaceLayout />
    </WorkspaceProvider>
  );
}
