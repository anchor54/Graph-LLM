import React from 'react';
import { X, Quote } from 'lucide-react';

export interface Citation {
    text: string;
    nodeId: string;
    source: 'user' | 'ai';
}

interface CitationsDisplayProps {
    citations: Citation[];
    onRemove: (index: number) => void;
}

export const CitationsDisplay = ({ citations, onRemove }: CitationsDisplayProps) => {
    if (citations.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-2 px-4 py-2 bg-muted/50 border-t border-border max-h-[120px] overflow-y-auto">
            {citations.map((citation, index) => (
                <div 
                    key={`${citation.nodeId}-${index}`} 
                    className="flex items-start gap-2 bg-card border border-border text-foreground rounded-md p-2 text-xs shadow-sm max-w-full group"
                >
                    <Quote size={12} className="text-primary mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                        <div className="line-clamp-2 italic text-muted-foreground">"{citation.text}"</div>
                        <div className="text-[10px] text-muted-foreground mt-1 uppercase font-semibold">
                            From {citation.source === 'user' ? 'User' : 'AI'}
                        </div>
                    </div>
                    <button 
                        onClick={() => onRemove(index)}
                        className="text-muted-foreground hover:text-destructive transition-colors p-0.5"
                    >
                        <X size={12} />
                    </button>
                </div>
            ))}
        </div>
    );
};

