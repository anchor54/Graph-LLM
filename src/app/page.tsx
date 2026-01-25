'use client';

import { WorkspaceLayout } from '@/components/workspace/WorkspaceLayout';
import { WorkspaceProvider } from '@/context/WorkspaceContext';
import { Suspense } from 'react';

export default function Home() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center">Loading...</div>}>
      <WorkspaceProvider nodeId={null}>
        <WorkspaceLayout />
      </WorkspaceProvider>
    </Suspense>
  );
}
