'use client';

import { WorkspaceLayout } from '@/components/workspace/WorkspaceLayout';
import { WorkspaceProvider } from '@/context/WorkspaceContext';
import { Suspense } from 'react';
import { useParams } from 'next/navigation';

export default function NodePage() {
  const params = useParams();
  const nodeId = params.nodeId as string;

  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center">Loading...</div>}>
      <WorkspaceProvider nodeId={nodeId}>
        <WorkspaceLayout />
      </WorkspaceProvider>
    </Suspense>
  );
}

