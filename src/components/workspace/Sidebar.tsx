'use client';

import React, { useState } from 'react';
import { FolderTree } from './FolderTree';
import { Button } from '@/components/ui/button';
import { FolderPlus, MessageSquarePlus, LogOut } from 'lucide-react';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
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
    const router = useRouter();
    const supabase = createClient();

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

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/login');
        router.refresh();
    };

    return (
        <div className="h-full bg-slate-50 border-r flex flex-col p-4">
            <div className="flex items-center justify-between mb-4 shrink-0">
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
            
            <div className="flex-1 overflow-y-auto min-h-0">
                <FolderTree />
            </div>

            <div className="mt-4 pt-4 border-t shrink-0">
                <Button variant="ghost" className="w-full justify-start gap-2 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={handleLogout}>
                    <LogOut size={16} />
                    Sign Out
                </Button>
            </div>

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
