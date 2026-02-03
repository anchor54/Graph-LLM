import { ExportPlan, ThoughtGraph, SemanticNode } from '@/types';

export class MarkdownRenderer {
    static render(plan: ExportPlan, graph: ThoughtGraph): string {
        let md = `# ${plan.intentLabel || 'Export'}\n\n`;

        // Filter nodes
        const nodes = graph.nodes.filter(n => plan.includeTypes.includes(n.type));

        if (plan.grouping === 'by_type') {
            for (const type of plan.sectionOrder) {
                // If the type is not in includeTypes, skip
                if (!plan.includeTypes.includes(type)) continue;

                const typeNodes = nodes.filter(n => n.type === type);
                if (typeNodes.length === 0) continue;

                md += `## ${this.formatType(type)}\n\n`;
                
                for (const node of typeNodes) {
                    md += this.renderNode(node, plan);
                }
            }
        } else {
             // By flow - simplistic topological sort or just list
             // For now, just list in order of appearance (which roughly matches chat order if we kept it)
             // or traverse edges. Simpler is list.
             for (const node of nodes) {
                 md += this.renderNode(node, plan);
             }
        }
        
        return md;
    }

    private static formatType(type: string): string {
        return type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ');
    }

    private static renderNode(node: SemanticNode, plan: ExportPlan): string {
        let text = '';
        if (plan.formatStyle === 'sectioned') {
            text += `### ${node.title}\n\n`;
            text += `${node.summary}\n\n`;
        } else if (plan.formatStyle === 'bulleted') {
            text += `- **${node.title}**: ${node.summary}\n`;
        } else {
            text += `**${node.title}**\n${node.summary}\n\n`;
        }
        return text;
    }
}
