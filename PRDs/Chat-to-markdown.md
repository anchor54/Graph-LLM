# Product Requirements Document (PRD)

## 1. Overview

### Feature Name

Chat-Tree → Thought-Graph → Markdown Export

### Summary

This feature allows users to convert conversational chat trees into structured, human-readable Markdown documents that capture **reasoning, decisions, outcomes, and open questions**, rather than raw chat transcripts. The system distills conversations into a semantic Thought-Graph and renders customizable Markdown outputs based on user intent.

---

## 2. Problem Statement

Chat-based thinking is powerful during exploration but becomes inefficient for:

* Revisiting decisions later
* Sharing outcomes with others
* Searching past reasoning
* Building long-term knowledge

Raw chat exports are:

* Verbose and noisy
* Chronological instead of logical
* Poor representations of reasoning

Users need a way to transform conversations into **durable reasoning artifacts**.

---

## 3. Goals & Non-Goals

### Goals

* Convert chat trees into structured reasoning (Thought-Graphs)
* Export clean, readable Markdown
* Preserve decisions, rationale, outcomes, and open items
* Support subtree-level and root-to-current exports
* Allow user-controlled customization without exposing system internals

### Non-Goals

* Exporting raw transcripts
* Perfect factual summarization
* Free-form user-authored prompt templates
* Real-time continuous syncing between chat and markdown

---

## 4. User Personas & Use Cases

### Personas

* **Knowledge Workers / Engineers**: Want decision logs, PRDs, ADRs
* **Learners / Researchers**: Want distilled explanations and open questions
* **Builders / Thinkers**: Want to preserve reasoning trails

### Core Use Cases

* “Summarize the decisions we made in this branch.”
* “Explain how we arrived at this architecture.”
* “Extract open questions for follow-up.”
* “Turn this discussion into internal design notes.”

---

## 5. Scope Selection

When exporting, users can choose:

### A. Subtree Export (Default)

* Selected node + descendants
* Best for focused explorations and local decisions

### B. Root → Current Export

* Ancestor path leading to the selected node
* Best for narrative documentation and context-heavy artifacts

### Context Summary (Optional, Default On)

* A brief, clearly labeled summary of prerequisite context
* Separate from the exported subtree content
* Read-only, non-persistent, non-graph content

---

## 6. Semantic Model

Chats are distilled into **Semantic Nodes**, not copied verbatim.

### Semantic Types

* Context
* Question
* Exploration
* Decision
* Rationale
* Outcome
* Open Item
* Reference

Multiple chat nodes may map to a single semantic node, and a single chat node may yield multiple semantic nodes.

---

## 7. Customization & User Intent

### Design Principle

Users express **intent**, not implementation details.

### Supported Customization

* What types of reasoning to include (e.g., decisions only)
* Level of detail (concise → detailed)
* Document style (sectioned, bulleted, narrative)
* Context inclusion (none / summary)

### Explicitly Not Supported

* Free-form Markdown templates
* Arbitrary semantic logic rules
* Direct user-written prompts for generation

---

## 8. Export Flow (User Experience)

1. User selects a node
2. Clicks “Convert to Markdown”
3. Chooses scope (Subtree / Root → Current)
4. Optionally describes intent in natural language
5. System interprets intent into a structured plan
6. User reviews and adjusts the plan
7. Markdown is generated and previewed
8. User exports

---

## 9. Quality Bar

Markdown output must:

* Read like carefully written human notes
* Avoid conversational or chat-like phrasing
* Be logically structured, not chronological
* Be explainable and reproducible

---

# Technical Solution Document

## 1. High-Level Architecture

```
Chat Tree
   ↓
Segmentation
   ↓
Semantic Distillation
   ↓
Thought-Graph
   ↓
Export Plan
   ↓
Deterministic Markdown Renderer
```

LLMs are used **only for interpretation and distillation**, never for final Markdown rendering.

---

## 2. Data Models

### 2.1 ChatNode

```ts
ChatNode {
  id: string
  parentId?: string
  text: string
  timestamp: number
}
```

### 2.2 SemanticNode

```ts
SemanticNode {
  id: string
  type: SemanticType
  title: string
  summary: string
  sourceChatNodeIds: string[]
  confidence?: number
}
```

### 2.3 ThoughtEdge

```ts
ThoughtEdge {
  fromNodeId: string
  toNodeId: string
  relation: 'answers' | 'leads_to' | 'justifies' | 'results_in'
}
```

### 2.4 ThoughtGraph

```ts
ThoughtGraph {
  id: string
  nodes: SemanticNode[]
  edges: ThoughtEdge[]
}
```

---

## 3. Semantic Distillation Pipeline

### Step A: Segmentation

* Group chat nodes into coherent discussion segments
* Segments represent idea-level units, not messages

### Step B: Semantic Extraction

* LLM extracts semantic nodes from each segment
* Output is structured JSON only

### Step C: Reasoning Linking

* Semantic nodes are connected based on logical relationships
* Links are non-temporal and many-to-many

---

## 4. ExportPlan (Core Contract)

The ExportPlan bridges user intent and deterministic rendering.

```ts
ExportPlan {
  includeTypes: SemanticType[]
  excludeTypes?: SemanticType[]
  sectionOrder: SemanticType[]
  grouping: 'by_type' | 'by_reasoning_flow'
  contextMode: 'none' | 'summary' | 'full'
  maxContextBullets?: number
  verbosity: 'concise' | 'balanced' | 'detailed'
  formatStyle: 'bulleted' | 'sectioned' | 'narrative'
  headingDepth: number
  includeProvenance: boolean
  includeWarnings: boolean
  intentLabel?: string
}
```

---

## 5. Intent Interpretation (LLM Usage)

### Purpose

Translate free-form user intent into a constrained ExportPlan.

### Rules

* Output must match ExportPlan schema
* Only predefined enum values allowed
* No Markdown or prose generation
* Conservative defaults for ambiguity

This step is inspectable, diffable, and explainable.

---

## 6. Markdown Rendering

Rendering is fully deterministic:

* Filter semantic nodes by `includeTypes`
* Apply ordering and grouping rules
* Render using predefined templates

No LLM involvement at this stage.

---

## 7. Persistence & Versioning

### Persisted

* SemanticNodes
* ThoughtEdges
* User edits
* ExportPlans (optional, reusable)

### Versioning

* Version Thought-Graphs, not chats
* New versions created on:

  * Re-distillation
  * Bulk edits
  * Merges

---

## 8. Partial Hydration & Performance

* Load graph skeleton first
* Hydrate node summaries on demand
* Load provenance only on hover

Enables large graphs without UI or memory lag.

---

## 9. Safety & Trust Guarantees

* Context summaries are clearly labeled and non-authoritative
* User reviews ExportPlan before generation
* Deterministic rendering ensures reproducibility
* No silent scope expansion

---

## 10. Future Extensions

* Saved export profiles
* Reasoning-based search over SemanticNodes
* Automatic PRD / ADR generation
* Merging multiple Thought-Graphs
* Confidence decay and freshness indicators

---

## Core Principle (System Invariant)

**LLMs interpret intent. Systems execute plans.**

Breaking this boundary is explicitly disallowed.
