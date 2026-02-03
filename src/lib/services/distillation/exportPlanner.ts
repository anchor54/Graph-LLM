import { ExportPlan, ExportScope } from '@/types';
import { generateModelResponse } from '@/lib/models';
import { EXPORT_PLAN_PROMPT } from './prompts';

export class ExportPlanner {
    static async generateExportPlan(
        intent: string | undefined, 
        scope: ExportScope,
        modelName: string = 'gemini-2.5-flash'
    ): Promise<ExportPlan> {
        const prompt = EXPORT_PLAN_PROMPT
            .replace('{{user_intent}}', intent || "Create a comprehensive summary")
            .replace('{{scope}}', scope);

        try {
            const response = await generateModelResponse(prompt, modelName);
             const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]) as ExportPlan;
            }
        } catch (e) {
            console.error("Error generating export plan", e);
        }

        // Default Plan
        return {
            includeTypes: ['decision', 'rationale', 'outcome', 'open_item'],
            sectionOrder: ['decision', 'rationale', 'outcome', 'open_item'],
            grouping: 'by_type',
            contextMode: 'summary',
            verbosity: 'balanced',
            formatStyle: 'sectioned',
            headingDepth: 2,
            includeProvenance: false,
            includeWarnings: true,
            intentLabel: intent || "Summary"
        };
    }
}
