# 📄 Product Requirements Document (PRD)

## Conversation Graph UI & Custom Graph Engine

### Product Vision

Build a **thinking-oriented conversation system** where users can reason, branch, prune, and reuse ideas over time.
The graph is not a visual novelty — it is a **navigation and decision-making tool**.

---

# PART 1: Conversation Graph Semantics & UI Behavior

---

## 1. Graph Collapsing

### 1.1 Problem Statement

Conversation graphs grow quickly and become visually overwhelming.
Users need to:

* focus on relevant reasoning paths
* hide low-signal history
* preserve structure without losing information

---

### 1.2 Design Principles

* Collapsing is **lossless** (no data is deleted)
* Collapsing is **semantic**, not purely visual
* Timeline clarity must always be preserved

---

### 1.3 Types of Collapsing

#### A. Subtree Collapsing (Branch-Level)

**Description**
Collapse an entire branch starting from a selected node.

**Behavior**

* All descendant nodes are hidden
* A single collapsed placeholder node is shown

**UI Representation**

```
▶ Collapsed: 6 turns
```

**User Actions**

* Expand subtree

### 1.4 Non-Goals

* No automatic deletion of conversation history
* No irreversible collapse actions

---

## 2. UI Node Display Text

### 2.1 Core Principle

> **Each node represents a “delta in thinking”, not raw messages.**

Nodes must help users **judge relevance**, not read content.

---

### 2.2 Node Content Model

Each node displays **exactly three layers of information**:

#### Layer 1: Outcome-Oriented Summary (Mandatory)

* 1 line
* 6–12 words
* Verb-led
* Describes what changed as a result of the turn

**Examples**

* “Defines per-user token quotas”
* “Rejects user-provided API keys”
* “Introduces credit-based free tier”

---

#### Layer 2: Topic Signals (Optional, Max 3)

Compact indicators representing key themes.

**Formats**

* Short keywords
* Icons
* Badges

**Examples**

```
[token] [rate-limit] [security]
```

---

#### Layer 3: State Indicator (Optional)

Communicates the nature of the turn.

**Examples**

* ✅ Decision
* 💡 Insight
* ❗ Open Question
* ⚠️ Risk Identified
* 🔁 Follow-up Needed

---

### 2.3 Progressive Disclosure

| Interaction State | Content Shown             |
| ----------------- | ------------------------- |
| Zoomed out        | Summary only              |
| Hover             | Summary + topic signals   |
| Selected          | Summary + preview bullets |
| Side panel        | Full user + AI exchange   |

---

### 2.4 Hard Constraints (Enforced in Code)

* Max 2 lines of text per node
* No paragraphs
* No code blocks
* No lists longer than 3 items
* Truncation with ellipsis is mandatory

---

### 2.5 Summary Generation Strategy

Summaries are **outcome-based**, not user-query-based.

**Heuristic**

* If a decision/constraint was introduced → summarize outcome
* If direction shifted → summarize intent
* If nothing changed → merge or collapse node

---

### 2.6 Hover-Based Progressive Disclosure

#### 2.6.1 Design Principle

Hover is the primary mechanism for revealing secondary information.
Selection is reserved for intentful actions.

The graph must remain clean and legible by default, with additional information revealed only on hover.

#### 2.6.2 Hover States (Mandatory)

When a user hovers over a node:

**Reveal**

* Topic signals (if hidden)
* Preview bullets (max 2–3 lines)
* Reference indicators (if present)

**Do NOT reveal**

* Full content
* Long text blocks
* Reference edges beyond first-degree

**Visual Changes**

* Slight elevation or glow
* Border emphasis
* Increased text contrast

---

# PART 2: Custom Graph UI

---

## 3. Why a Custom Graph UI

### 3.1 Problem with Generic Graph Libraries

Generic graph libraries (e.g., DOM/SVG-based systems):

* Treat all edges equally
* Lack semantic understanding of time and causality
* Do not scale well with dense interactions
* Optimize for drag-and-drop, not reasoning

---

### 3.2 Goals of Custom Graph UI

* Encode **time, causality, and relevance** visually
* Enable domain-specific interactions
* Scale to large graphs smoothly
* Support advanced features like collapsing, ghosting, and merging

---

## 4. Graph Layout Model

### 4.1 Timeline-Anchored Tree

* Vertical axis → time
* Horizontal axis → branching
* Layout is deterministic and stable
* Parent nodes centered above children

---

### 4.2 Edge Semantics

#### Primary Edges (Timeline)

* Solid lines
* Vertical flow
* Always visible

#### Secondary Edges (References)

* Dashed, curved
* Lower opacity
* Shown only on hover/selection
* Never affect layout

---

## 5. Rendering Architecture

### 5.1 Separation of Concerns

```
State (React)
   ↓
Layout Engine (Pure Functions)
   ↓
Renderer (Canvas / WebGL)
   ↓
Interaction Layer (Hit Testing)
```

---

### 5.2 Rendering Technology

#### Phase 1

* HTML Canvas
* CPU rendering
* Deterministic redraw loop

#### Phase 2 (Scale & Polish)

* WebGL rendering
* GPU acceleration
* Smooth transitions and animations

---

## 6. Interaction Model

### 6.1 Supported Interactions

* Pan & zoom (camera-based)
* Node selection
* Subtree focus
* Collapse / expand
* Promote branch
* Compare branches
* Show references on demand

---

### 6.2 Non-Goals

* Freeform node dragging
* Arbitrary edge creation
* Graph editing unrelated to conversation semantics

---

## 7. References & Cross-Conversation Links

### 7.1 Reference Representation

* Small indicator on node (🔗 + count)
* Dashed edge revealed on demand
* Detailed explanation in side panel

---

### 7.2 Cross-Conversation References

* Same mechanism as local references
* Visually differentiated
* Never rendered by default

---

## 8. Conversation Merging (Conceptual Support)

### 8.1 Definition

Merging means **reusing a decision or outcome from one conversation as an accepted premise in another**.

---

### 8.2 UI Implication

* Node can reference another node as an assumed decision
* Reference automatically included in context
* User can override or remove

---

### 8.3 Non-Goals

* No automatic merging
* No content duplication

---

## 9. Success Metrics

* Users can identify relevant branches in <3 seconds
* Graph remains usable beyond 200+ nodes
* Users actively reuse prior decisions via references
* Reduced repetition across conversations

---

## 10. Out of Scope (for now)

* Full knowledge graph view
* Force-directed layouts
* Collaborative real-time editing


