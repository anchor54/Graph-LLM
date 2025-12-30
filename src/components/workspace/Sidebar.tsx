'use client';

import React from 'react';
import { FolderTree } from './FolderTree';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useWorkspace } from '@/context/WorkspaceContext';

export function Sidebar() {
    const { setActiveNodeId } = useWorkspace();
    return (
        <div className="h-full bg-slate-50 border-r p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">Folders</h2>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveNodeId(null)}
                    className="h-8 px-2"
                    title="New Chat"
                >
                    <Plus size={16} />
                </Button>
            </div>
            <FolderTree />
        </div>
    );
}
