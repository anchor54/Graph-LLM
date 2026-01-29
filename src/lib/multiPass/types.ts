export interface ClarityGateResult {
    intent: string;
    can_answer: boolean;
    missing_info?: string[];
    clarifying_questions?: string[];
}

export interface MultiPassContext {
    userPrompt: string;
    modelName: string;
    historyContext?: string; // Previous conversation
}

export interface PassResult {
    passName: string;
    content: string | ClarityGateResult;
    durationMs: number;
}
