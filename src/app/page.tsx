import { Sidebar } from '@/components/workspace/Sidebar';
import { ChatInterface } from '@/components/workspace/ChatInterface';
import { GraphVisualization } from '@/components/workspace/GraphVisualization';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"

import { WorkspaceProvider } from '@/context/WorkspaceContext';

export default function Home() {
  return (
    <WorkspaceProvider>
      <div className="h-screen w-full flex flex-col overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="flex-1">
          <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
            <Sidebar />
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel defaultSize={50} minSize={30}>
            <ChatInterface />
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel defaultSize={30} minSize={20}>
            <GraphVisualization />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </WorkspaceProvider>
  );
}
