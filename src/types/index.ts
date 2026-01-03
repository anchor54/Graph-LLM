export interface Folder {
    id: string;
    name: string;
    parentId: string | null;
    createdAt: string;
    updatedAt: string;
    children?: Folder[]; // For client-side tree structure
}

export interface Node {
    id: string;
    parentId: string | null;
    folderId: string | null;
    summary: string | null;
    userPrompt: string;
    aiResponse: string | null;
    modelMetadata: any;
    citations?: any[];
    references?: ContextItem[]; // Array of referenced context items
    createdAt: string;
    updatedAt: string;
}

export interface ContextItem {
    id: string;
    type: 'folder' | 'chat' | 'node';
    name?: string; // Optional name for display
}
