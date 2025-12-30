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
        <div className="flex flex-wrap gap-2 px-4 py-2 bg-slate-50 border-t border-slate-100 max-h-[120px] overflow-y-auto">
            {citations.map((citation, index) => (
                <div 
                    key={`${citation.nodeId}-${index}`} 
                    className="flex items-start gap-2 bg-white border border-blue-100 text-slate-700 rounded-md p-2 text-xs shadow-sm max-w-full group"
                >
                    <Quote size={12} className="text-blue-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                        <div className="line-clamp-2 italic text-slate-600">"{citation.text}"</div>
                        <div className="text-[10px] text-slate-400 mt-1 uppercase font-semibold">
                            From {citation.source === 'user' ? 'User' : 'AI'}
                        </div>
                    </div>
                    <button 
                        onClick={() => onRemove(index)}
                        className="text-slate-400 hover:text-red-500 transition-colors p-0.5"
                    >
                        <X size={12} />
                    </button>
                </div>
            ))}
        </div>
    );
};

