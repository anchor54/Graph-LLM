import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Quote } from 'lucide-react';

interface SelectionMenuProps {
    onQuote: (text: string, nodeId: string, source: 'user' | 'ai') => void;
}

export const SelectionMenu = ({ onQuote }: SelectionMenuProps) => {
    const [position, setPosition] = useState<{ x: number, y: number } | null>(null);
    const [selectionInfo, setSelectionInfo] = useState<{ text: string, nodeId: string, source: 'user' | 'ai' } | null>(null);

    useEffect(() => {
        const handleSelectionChange = () => {
            const selection = window.getSelection();
            if (!selection || selection.isCollapsed || !selection.rangeCount) {
                setPosition(null);
                return;
            }

            const range = selection.getRangeAt(0);
            const container = range.commonAncestorContainer;
            
            // Find the closest message bubble container
            let element = container.nodeType === 3 ? container.parentElement : container as HTMLElement;
            let messageBubble = element?.closest('[data-message-id]');
            
            if (!messageBubble) {
                setPosition(null);
                return;
            }

            const nodeId = messageBubble.getAttribute('data-message-id');
            const source = messageBubble.getAttribute('data-message-source') as 'user' | 'ai';
            
            if (nodeId && source) {
                const rect = range.getBoundingClientRect();
                setPosition({
                    x: rect.left + (rect.width / 2) - 40, // Center the button (assuming button width ~80px)
                    y: rect.top - 40 // Position above the selection
                });
                setSelectionInfo({
                    text: selection.toString(),
                    nodeId,
                    source
                });
            } else {
                setPosition(null);
            }
        };

        document.addEventListener('selectionchange', handleSelectionChange);
        // Also listen to mouseup to ensure we catch the end of selection
        document.addEventListener('mouseup', handleSelectionChange);
        
        return () => {
            document.removeEventListener('selectionchange', handleSelectionChange);
            document.removeEventListener('mouseup', handleSelectionChange);
        };
    }, []);

    if (!position || !selectionInfo) return null;

    return (
        <div 
            className="fixed z-50 animate-in fade-in zoom-in duration-200"
            style={{ 
                left: position.x, 
                top: position.y,
            }}
        >
            <Button 
                size="sm" 
                className="bg-slate-900 text-white shadow-lg hover:bg-slate-800 h-8 px-3 rounded-full flex items-center gap-2"
                onClick={(e) => {
                    e.stopPropagation(); // Prevent clearing selection immediately
                    onQuote(selectionInfo.text, selectionInfo.nodeId, selectionInfo.source);
                    window.getSelection()?.removeAllRanges(); // Clear selection after quoting
                    setPosition(null);
                }}
            >
                <Quote size={12} />
                <span className="text-xs font-medium">Quote</span>
            </Button>
        </div>
    );
};

