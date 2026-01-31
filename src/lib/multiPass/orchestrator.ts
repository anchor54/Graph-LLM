import { generateModelResponse, streamModelResponse } from '@/lib/models';
import { 
    INTENT_GATE_PROMPT, 
    REASONING_PROMPT, 
    ANSWER_CONSTRUCTION_PROMPT,
    QUALITY_REWRITE_PROMPT,
    TONE_REWRITE_PROMPT
} from './prompts';
import { 
    ClarityGateResult, 
    MultiPassContext 
} from './types';

export class MultiPassOrchestrator {
    
    /**
     * Run Pass 1: Intent & Clarity Gate
     */
    static async runClarityGate(
        context: MultiPassContext
    ): Promise<ClarityGateResult> {
        const prompt = `${INTENT_GATE_PROMPT}\n\nUser Request:\n"${context.userPrompt}"\n\nContext Summary:\n${context.historyContext || "None"}`;
        
        // Use a fast/smart model for gating if possible, but sticking to requested model or default
        // We enforce JSON format in the prompt
        try {
            const responseText = await generateModelResponse(prompt, context.modelName, undefined, context.apiKey);
            
            // Attempt to parse JSON
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                console.warn("Clarity Gate failed to produce JSON, falling back to answerable.");
                return {
                    intent: context.userPrompt,
                    can_answer: true
                };
            }
            
            const jsonStr = jsonMatch[0];
            const result = JSON.parse(jsonStr) as ClarityGateResult;
            
            return result;
        } catch (e) {
            console.error("Error in Clarity Gate:", e);
            // Fail open -> try to answer
            return {
                intent: context.userPrompt,
                can_answer: true
            };
        }
    }

    /**
     * Run Pass 2: Deep Reasoning
     */
    static async runDeepReasoning(
        intent: string,
        context: MultiPassContext
    ): Promise<string> {
        const prompt = REASONING_PROMPT
            .replace('{{intent}}', intent)
            + `\n\nFull User Query: ${context.userPrompt}\nContext: ${context.historyContext || "None"}`;

        return await generateModelResponse(prompt, context.modelName, undefined, context.apiKey);
    }

    /**
     * Run Pass 3: Answer Construction (Non-streaming)
     */
    static async runAnswerConstruction(
        intent: string,
        reasoning: string,
        context: MultiPassContext
    ): Promise<string> {
        const prompt = ANSWER_CONSTRUCTION_PROMPT
            .replace('{{intent}}', intent)
            .replace('{{reasoning}}', reasoning);

        return await generateModelResponse(prompt, context.modelName, undefined, context.apiKey);
    }

    /**
     * Run Pass 4: Quality Rewrite (Non-streaming)
     */
    static async runQualityRewrite(
        draftAnswer: string,
        context: MultiPassContext
    ): Promise<string> {
        const prompt = `${QUALITY_REWRITE_PROMPT}\n\nDraft Content:\n${draftAnswer}`;
        return await generateModelResponse(prompt, context.modelName, undefined, context.apiKey);
    }

    /**
     * Run Pass 5: Tone Rewrite (Streaming)
     */
    static async *streamToneRewrite(
        content: string,
        context: MultiPassContext
    ): AsyncGenerator<string, void, unknown> {
        const prompt = `${TONE_REWRITE_PROMPT}\n\nContent:\n${content}`;
        yield* streamModelResponse(prompt, context.modelName, undefined, context.apiKey);
    }

    /**
     * Main Entry Point
     */
    static async *streamMultiPass(
        context: MultiPassContext,
        onMetadata?: (metadata: any) => void
    ): AsyncGenerator<string, void, unknown> {
        
        const metadata: any = {
            multiPassMode: true,
            steps: []
        };

        // 1. Clarity Gate
        const gateStart = Date.now();
        const gateResult = await this.runClarityGate(context);
        metadata.steps.push({
            name: 'clarity_gate',
            duration: Date.now() - gateStart,
            result: gateResult
        });
        metadata.clarityGate = gateResult;
        metadata.intent = gateResult.intent;

        if (!gateResult.can_answer) {
            // If cannot answer, stream the clarifying questions
            const questions = gateResult.clarifying_questions || ["Could you please clarify your request?"];
            const responseText = "I need a bit more information to answer that correctly:\n\n" + questions.map(q => `- ${q}`).join('\n');
            
            if (onMetadata) onMetadata(metadata);
            yield responseText;
            return;
        }

        // 2. Deep Reasoning
        const reasonStart = Date.now();
        const reasoning = await this.runDeepReasoning(gateResult.intent, context);
        metadata.steps.push({
            name: 'deep_reasoning',
            duration: Date.now() - reasonStart
        });
        metadata.reasoning = reasoning;

        // 3. Answer Construction (Wait for full response)
        const constructionStart = Date.now();
        const draftAnswer = await this.runAnswerConstruction(gateResult.intent, reasoning, context);
        metadata.steps.push({
            name: 'answer_construction',
            duration: Date.now() - constructionStart
        });

        // 4. Quality Rewrite (Wait for full response)
        const qualityStart = Date.now();
        const qualityAnswer = await this.runQualityRewrite(draftAnswer, context);
        metadata.steps.push({
            name: 'quality_rewrite',
            duration: Date.now() - qualityStart
        });

        // 5. Tone Rewrite (Streaming)
        const toneStart = Date.now();
        
        if (onMetadata) onMetadata(metadata);

        yield* this.streamToneRewrite(qualityAnswer, context);
        
        metadata.steps.push({
            name: 'tone_rewrite',
            duration: Date.now() - toneStart
        });
        
        if (onMetadata) onMetadata(metadata);
    }
}
