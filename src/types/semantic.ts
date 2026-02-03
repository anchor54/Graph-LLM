export type SemanticType =
  | 'context'
  | 'question'
  | 'exploration'
  | 'decision'
  | 'rationale'
  | 'outcome'
  | 'open_item'
  | 'reference';

export interface SemanticNode {
  id: string;
  type: SemanticType;
  title: string;
  summary: string;
  sourceNodeIds: string[]; // ChatNode IDs
  confidence?: number;
}

export interface ThoughtEdge {
  fromNodeId: string;
  toNodeId: string;
  relation: 'answers' | 'leads_to' | 'justifies' | 'results_in';
}

export interface ThoughtGraph {
  id: string;
  nodes: SemanticNode[];
  edges: ThoughtEdge[];
}

export type ExportScope = 'subtree' | 'root_to_current';

export interface ExportPlan {
  includeTypes: SemanticType[];
  excludeTypes?: SemanticType[];
  sectionOrder: SemanticType[];
  grouping: 'by_type' | 'by_reasoning_flow';
  contextMode: 'none' | 'summary' | 'full';
  maxContextBullets?: number;
  verbosity: 'concise' | 'balanced' | 'detailed';
  formatStyle: 'bulleted' | 'sectioned' | 'narrative';
  headingDepth: number;
  includeProvenance: boolean;
  includeWarnings: boolean;
  intentLabel?: string;
}
