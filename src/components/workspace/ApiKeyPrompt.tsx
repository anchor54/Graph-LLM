'use client';

import React, { useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Key } from 'lucide-react';

export function ApiKeyPrompt({ open, onOpenChange }: { open?: boolean; onOpenChange?: (open: boolean) => void }) {
    const [internalOpen, setInternalOpen] = useState(false);
    const [geminiKey, setGeminiKey] = useState('');
    const [openaiKey, setOpenaiKey] = useState('');
    const [error, setError] = useState<string | null>(null);

    const isOpen = open !== undefined ? open : internalOpen;
    const setIsOpen = onOpenChange || setInternalOpen;

    useEffect(() => {
        // Check for existing keys
        const storedGemini = localStorage.getItem('gemini_api_key');
        const storedOpenAI = localStorage.getItem('openai_api_key');

        if (open === undefined && !storedGemini && !storedOpenAI) {
            setInternalOpen(true);
        }
        
        // Always sync state with local storage when dialog opens or mounts
        if (storedGemini) setGeminiKey(storedGemini);
        if (storedOpenAI) setOpenaiKey(storedOpenAI);
        
    }, [open]);

    // Validate if keys are present for UI feedback (disable button)
    const hasAtLeastOneKey = !!geminiKey.trim() || !!openaiKey.trim();

    const handleSave = () => {
        setError(null);

        if (!hasAtLeastOneKey) {
            setError("At least one API key is required to use the application.");
            return;
        }

        if (geminiKey.trim()) {
            localStorage.setItem('gemini_api_key', geminiKey.trim());
        } else {
            localStorage.removeItem('gemini_api_key');
        }

        if (openaiKey.trim()) {
            localStorage.setItem('openai_api_key', openaiKey.trim());
        } else {
            localStorage.removeItem('openai_api_key');
        }

        setIsOpen(false);
        window.location.reload(); // Reload to refresh model lists
    };

    return (
        <Dialog open={isOpen} onOpenChange={(val) => {
             // Prevent closing via UI if no keys are set (initial setup)
            const storedGemini = localStorage.getItem('gemini_api_key');
            const storedOpenAI = localStorage.getItem('openai_api_key');
            
            // If explicit open prop is used (edit mode), allow closing unless we just deleted both keys
            if (open !== undefined) {
                 if (!val) {
                     // Check if current input state would result in no keys if saved? 
                     // Actually, onOpenChange usually triggers cancellation. 
                     // If cancelling edit, we just revert to stored.
                     // But if we are in "forced" mode (internalOpen), we block close.
                     setIsOpen(val);
                 }
                 return;
            }

            // Forced mode
            if (storedGemini || storedOpenAI) {
                setIsOpen(val);
            }
        }}>
            <DialogContent className="sm:max-w-[425px]" onInteractOutside={(e) => {
                // Prevent closing by clicking outside if no keys are set (in forced mode)
                if (open === undefined) {
                    const storedGemini = localStorage.getItem('gemini_api_key');
                    const storedOpenAI = localStorage.getItem('openai_api_key');
                    if (!storedGemini && !storedOpenAI) {
                        e.preventDefault();
                    }
                }
            }}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Key className="w-5 h-5" />
                        {open !== undefined ? 'Manage API Keys' : 'Enter API Keys'}
                    </DialogTitle>
                    <DialogDescription>
                        {open !== undefined 
                            ? "Update or remove your API keys. At least one key must be present."
                            : "To use Graph LLM, please provide your API keys. Your keys are stored locally in your browser and sent directly to the API."}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="gemini">Gemini API Key</Label>
                        <Input
                            id="gemini"
                            placeholder="AIza..."
                            value={geminiKey}
                            onChange={(e) => setGeminiKey(e.target.value)}
                            type="password"
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="openai">OpenAI API Key</Label>
                        <Input
                            id="openai"
                            placeholder="sk-..."
                            value={openaiKey}
                            onChange={(e) => setOpenaiKey(e.target.value)}
                            type="password"
                        />
                    </div>
                    {error && (
                        <p className="text-sm text-destructive font-medium">{error}</p>
                    )}
                    {!hasAtLeastOneKey && (
                        <p className="text-sm text-destructive font-medium">Please enter at least one API key.</p>
                    )}
                </div>
                <DialogFooter>
                    <Button onClick={handleSave} disabled={!hasAtLeastOneKey}>Save & Continue</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
