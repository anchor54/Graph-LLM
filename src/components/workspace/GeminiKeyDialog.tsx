'use client';

import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useWorkspace } from '@/context/WorkspaceContext';

export function GeminiKeyDialog() {
    const { geminiApiKey, setGeminiApiKey } = useWorkspace();
    const [inputValue, setInputValue] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!geminiApiKey || geminiApiKey.trim() === '') {
            setIsOpen(true);
        } else {
            setIsOpen(false);
        }
    }, [geminiApiKey]);

    const handleSave = () => {
        if (inputValue.trim()) {
            setGeminiApiKey(inputValue.trim());
            setInputValue(''); // Clear for security, though state updates will close dialog
        }
    };

    if (!mounted) return null;

    return (
        <Dialog open={isOpen} onOpenChange={() => {}}>
            <DialogContent 
                className="[&>button]:hidden" 
                onPointerDownOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>Enter Gemini API Key</DialogTitle>
                    <DialogDescription>
                        A valid Google Gemini API key is required to use this application. 
                        Your key will be stored locally in your browser.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Input
                        placeholder="Type your API key here..."
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        type="password"
                        autoComplete="off"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                handleSave();
                            }
                        }}
                    />
                </div>
                <DialogFooter>
                    <Button onClick={handleSave} disabled={!inputValue.trim()}>
                        Save Key
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
