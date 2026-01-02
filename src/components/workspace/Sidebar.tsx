'use client';

import React, { useState } from 'react';
import { FolderTree } from './FolderTree';
import { Button } from '@/components/ui/button';
import { FolderPlus, MessageSquarePlus, LogOut, Key } from 'lucide-react';
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
    const { setActiveNodeId, setActiveFolderId, triggerFolderRefresh, setGeminiApiKey } = useWorkspace();
    const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
    const [isApiKeyDialogOpen, setIsApiKeyDialogOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [apiKeyInputValue, setApiKeyInputValue] = useState('');
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

    const handleUpdateApiKey = () => {
        if (apiKeyInputValue.trim()) {
            setGeminiApiKey(apiKeyInputValue.trim());
            setApiKeyInputValue('');
            setIsApiKeyDialogOpen(false);
        }
    };

    return (
        <div className="h-full bg-muted/40 border-r border-sidebar-border flex flex-col p-4">
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

            <div className="mt-4 pt-4 border-t border-sidebar-border shrink-0 space-y-1">
                <Button variant="ghost" className="w-full justify-start gap-2" onClick={() => setIsApiKeyDialogOpen(true)}>
                    <Key size={16} />
                    Change API Key
                </Button>
                <Button variant="ghost" className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleLogout}>
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
            <Dialog open={isApiKeyDialogOpen} onOpenChange={setIsApiKeyDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Update Gemini API Key</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <Input
                            placeholder="Enter new API key"
                            value={apiKeyInputValue}
                            onChange={(e) => setApiKeyInputValue(e.target.value)}
                            type="password"
                            autoComplete="off"
                            onKeyDown={(e) => e.key === 'Enter' && handleUpdateApiKey()}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsApiKeyDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleUpdateApiKey} disabled={!apiKeyInputValue.trim()}>
                            Update Key
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
