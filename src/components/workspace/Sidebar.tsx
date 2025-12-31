'use client';

import React, { useState } from 'react';
import { FolderTree } from './FolderTree';
import { Button } from '@/components/ui/button';
import { FolderPlus, MessageSquarePlus } from 'lucide-react';
import { useWorkspace } from '@/context/WorkspaceContext';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export function Sidebar() {
    const { setActiveNodeId, setActiveFolderId, triggerFolderRefresh } = useWorkspace();
    const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;

        setIsCreating(true);
        try {
            const res = await fetch('/api/folders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newFolderName, parentId: null }),
            });

            if (res.ok) {
                setNewFolderName('');
                setIsCreateFolderOpen(false);
                triggerFolderRefresh();
            } else {
                console.error('Failed to create folder');
            }
        } catch (error) {
            console.error('Error creating folder:', error);
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className="h-full bg-slate-50 border-r p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">Folders</h2>
                <div className="flex gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsCreateFolderOpen(true)}
                        className="h-8 px-2"
                        title="New Folder"
                    >
                        <FolderPlus size={16} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setActiveNodeId(null);
                            setActiveFolderId(null);
                        }}
                        className="h-8 px-2"
                        title="New Chat"
                    >
                        <MessageSquarePlus size={16} />
                    </Button>
                </div>
            </div>
            <FolderTree />

            <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create New Folder</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <Input
                            placeholder="Folder Name"
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsCreateFolderOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateFolder} disabled={isCreating || !newFolderName.trim()}>
                            Create
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
