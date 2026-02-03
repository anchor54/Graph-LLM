export const SEGMENTATION_PROMPT = `
You are an expert at analyzing conversation structures.
Your task is to group the following chat messages into coherent "discussion segments".
Each segment should represent a single distinct topic, idea, or step in the reasoning process.

Output format (JSON):
{
  "segments": [
    {
      "id": "segment-1",
      "nodeIds": ["node-id-1", "node-id-2"],
      "summary": "Brief summary of this segment"
    }
  ]
}

Chat Messages:
{{chat_content}}
`;

export const SEMANTIC_EXTRACTION_PROMPT = `
You are an expert at distilling conversations into structured knowledge.
Transform the following conversation segment into a set of "Semantic Nodes".
Semantic Nodes capture the essence of the reasoning, decisions, and outcomes.

Semantic Types:
- context: Background information or constraints.
- question: A specific question asked or problem posed.
- exploration: Brainstorming, analysis, or investigation.
- decision: A concrete choice or conclusion reached.
- rationale: The reasoning behind a decision.
- outcome: The result of an action or decision.
- open_item: Unresolved questions or future tasks.
- reference: External link or citation.

Output format (JSON):
{
  "nodes": [
    {
      "type": "decision", // One of the types above
      "title": "Short generic title (e.g. 'Database Selection')",
      "summary": "Detailed content of the node.",
      "sourceNodeIds": ["original-chat-node-id"]
    }
  ]
}

Segment Context:
{{segment_content}}
`;

export const LINKING_PROMPT = `
You are an expert at mapping logical relationships between thoughts.
Given the following list of Semantic Nodes, identify the logical connections (edges) between them.

Relation Types:
- answers: Node A answers Question B.
- leads_to: Node A logically precedes Node B.
- justifies: Node A provides the reason for Node B (e.g. Rationale -> Decision).
- results_in: Node A caused Node B (e.g. Decision -> Outcome).

Output format (JSON):
{
  "edges": [
    {
      "fromNodeId": "id-1",
      "toNodeId": "id-2",
      "relation": "leads_to"
    }
  ]
}

Semantic Nodes:
{{nodes_json}}
`;

export const EXPORT_PLAN_PROMPT = `
You are an expert document planner.
Your task is to create a structured "Export Plan" based on the user's intent and the available content scope.
The Export Plan determines how the Thought Graph will be rendered into Markdown.

User Intent: "{{user_intent}}"
Scope: {{scope}} (subtree or root_to_current)

Constraints:
- strictly follow the JSON schema.
- 'includeTypes': meaningful subset of types to show.
- 'sectionOrder': logical flow of sections.
- 'grouping': 'by_type' (grouped by category) or 'by_reasoning_flow' (narrative order).
- 'verbosity': 'concise' (bullets), 'balanced', 'detailed' (paragraphs).
- 'contextMode': 'none', 'summary', or 'full'.

Output format (JSON):
{
  "includeTypes": ["decision", "rationale", "outcome"],
  "sectionOrder": ["decision", "rationale", "outcome"],
  "grouping": "by_reasoning_flow",
  "contextMode": "summary",
  "verbosity": "balanced",
  "formatStyle": "sectioned",
  "headingDepth": 2,
  "includeProvenance": false,
  "includeWarnings": true,
  "intentLabel": "Summary of Decisions"
}
`;
