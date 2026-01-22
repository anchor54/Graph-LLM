# PRD: Context Summarization & Context Assembly System

## 1. Purpose & Goals

### Objective

Design and implement a **scalable, intent-aware summarization and context assembly system** for a graph-based LLM chat product, enabling:

* Long-running, non-linear conversations
* Branching and subtree reuse
* Low-latency inference
* Predictable context inclusion
* Explainable AI behavior

This system should allow **any new chat node** to be generated with **just enough relevant context**, without flooding the LLM or losing critical prior decisions.

---

## 2. Non-Goals (Explicit)

The system will **not** attempt to:

* Maintain a single global “truth”
* Automatically reconcile contradictory branches
* Guarantee perfect summaries
* Replace raw chat history as source of truth

Summaries are **indexes**, not canonical state.

---

## 3. Core Concepts & Definitions

### 3.1 Conversation Graph

* Directed acyclic graph (DAG)
* Each node = `(user_prompt, ai_response)`
* Branch points represent divergence of intent or exploration

---

### 3.2 Intent

A **latent goal or problem** being pursued in a branch or sub-branch.

Examples:

* `context-architecture`
* `mvp-scope`
* `performance-optimization`

Intents may be:

* Explicit (user-stated)
* Implicit (LLM-inferred)

---

### 3.3 Summary Types (MVP Scope)

#### A. Node Delta Summary

A structured summary of **what changed at this node** relative to its parent.

> This replaces “summary till now”.

#### B. Branch Intent Summary

A materialized, intent-scoped summary derived from a subtree.

---

## 4. Data Model

### 4.1 Node Delta Summary

Stored **per node**.

```json
{
  "node_id": "N123",
  "intent": "context-architecture",
  "new_information": {
    "decisions": [],
    "constraints": [],
    "facts": [],
    "rejected_options": []
  },
  "open_questions": [],
  "confidence": 0.85,
  "derived_from": ["N122"]
}
```

**Properties**

* Small
* Append-only
* Immutable once written

---

### 4.2 Branch Intent Summary

Stored **per branch point per intent**.

```json
{
  "branch_id": "B45",
  "intent": "context-architecture",
  "decisions": [],
  "constraints": [],
  "rejected_options": [],
  "open_questions": [],
  "confidence": 0.92,
  "covered_nodes": ["N12", "N19", "N33"],
  "last_updated_at": "timestamp",
  "version": 3
}
```

**Important**

* Multiple summaries per branch (keyed by intent)
* May be stale
* Derived, not authoritative

---

## 5. Summary Lifecycle

### 5.1 Creation

#### Node Delta Summary

* Created **synchronously** after AI response
* Always generated

#### Branch Intent Summary

* Created **lazily**
* Only when needed (see triggers)

---

### 5.2 Invalidation

A branch intent summary is **marked stale** when:

* A new node is added under the branch
* A node delta introduces:

  * a new decision
  * a rejected option
  * resolution of an open question

Invalidation is **cheap** and **eager**.

---

### 5.3 Recompute Triggers

A branch summary is recomputed **only when**:

1. It is about to be:

   * Included in LLM context
   * Displayed in UI
   * Referenced by another branch
2. User explicitly requests refresh
3. Structural operations:

   * Cut subtree
   * Branch switch
   * Merge (future)

---

## 6. Relevance & Inclusion Rules

### 6.1 Intent Matching (Primary Filter)

A node delta is considered **eligible** for a branch summary **iff**:

```
similarity(node.intent, branch.intent) > threshold
```

(MVP: embedding similarity or LLM classification)

---

### 6.2 Relevance Scoring

For eligible nodes:

```
relevance =
  intent_similarity
  × information_density
  × confidence
  × novelty
```

Only items above threshold are included.

---

### 6.3 Allowed Summary Content

Only these categories may be summarized:

✅ decisions
✅ constraints
✅ invariants
✅ rejected options
⚠️ open questions (only unresolved & important)

❌ brainstorming
❌ speculative exploration
❌ verbose explanation

---

## 7. Context Assembly for a New Chat Node

### 7.1 Objective

Given a target node `N`, assemble **minimal, relevant, explainable context** for LLM inference.

---

### 7.2 Context Assembly Algorithm

#### Step 1: Identify Active Intent(s)

* Use:

  * Explicit user signal
  * Branch intent
  * Recent node intent
* Select 1–2 dominant intents max

---

#### Step 2: Collect Context (Priority Order)

1. **User-pinned summaries (if any)**
2. **Recent Node Delta Summaries**

   * Walk upward from parent
   * Stop when:

     * token budget reached OR
     * diminishing returns detected
3. **Branch Intent Summaries**

   * Only matching active intent(s)
   * Prefer:

     * closest branch
     * highest confidence
4. **Raw Messages (fallback)**

   * Only if needed for grounding

---

#### Step 3: Budget Enforcement

* Hard token limit
* Drop order:

  1. Old node deltas
  2. Low-confidence summaries
  3. Raw messages

---

### 7.3 Prompt Assembly Structure (Conceptual)

```
SYSTEM:
- Role
- Constraints

CONTEXT:
- Intent summary (if any)
- Recent decisions
- Active constraints
- Known rejections

CONVERSATION:
- Last N turns (compressed)

USER:
- New prompt
```

---

## 8. Propagation Rules (Critical)

### 8.1 Default Behavior

* **No automatic propagation**
* Summaries do not push upward

### 8.2 Pull-Based Access

* Nodes *request* summaries
* Summaries never embed themselves into nodes

---

### 8.3 Explicit Promotion (Optional UX)

User may promote:

> “This conclusion should apply to parent branch”

This is:

* Explicit
* Rare
* High signal

---

## 9. Latency Management

### 9.1 Serving Strategy

* Always serve **last-known summary**
* Never block user on recomputation

---

### 9.2 Progressive Update

1. Respond using cached summary
2. Trigger async recompute if stale
3. UI updates when new version is ready

---

### 9.3 Background Optimization (Optional)

* Opportunistic summarization during idle
* Cancelable
* Best-effort only

---

## 10. Transparency & UX Requirements

* Indicate summary freshness:

  * “Updated 3 nodes ago”
* Expose:

  * Which summaries were used
  * Which intents were active
* Allow:

  * Manual refresh
  * Exclusion from context

---

## 11. Failure Modes & Safeguards

| Failure                | Mitigation                   |
| ---------------------- | ---------------------------- |
| Stale summary          | Versioning + freshness label |
| Wrong intent           | User override                |
| Over-context           | Hard budget caps             |
| Inconsistent summaries | Source node references       |
| High latency           | Cached-first policy          |

---

## 12. MVP Implementation Order

### Phase 1 (Must-have)

* Node delta summaries
* Single intent per branch
* Lazy branch summary
* Pull-based context assembly

### Phase 2

* Multi-intent summaries
* Confidence scoring
* Explicit promotion UX

### Phase 3

* Branch merging
* Summary diffing
* Auto intent evolution

---

## 13. Success Metrics

* Average prompt token reduction
* LLM response relevance
* Time-to-first-token
* User trust (“Why did it answer this way?”)
* Reusability of prior discussions

---

## Guiding Principle (Applies to All Scenarios)

> **Context is never “carried forward.”
> It is always *reconstructed on demand* for the current node.**

Every scenario below follows this invariant.

---

## Scenario 1: Linear Conversation (No Branching)

### Description

User starts a new chat and continues linearly.

---

### Step-by-step

#### Step 1: User creates a new chat

* Root node `N0` is created
* No prior context exists

**Context for N0**

* Empty (system + user prompt only)

---

#### Step 2: User sends follow-up message

* Node `N1` is created
* Parent = `N0`

**What happens internally**

1. AI response for `N1` is generated using:

   * Raw messages of `N0`
2. Node Delta Summary for `N1` is created:

   * Captures new facts / decisions
3. No branch summaries exist

**Context for N1**

* Recent raw messages
* No summaries yet (depth too small)

---

#### Step 3: Conversation grows longer

* Nodes `N2`, `N3`, `N4`…

**Context Assembly for Nk**

1. Walk upward collecting **Node Delta Summaries**
2. Stop when:

   * token budget reached OR
   * diminishing returns detected
3. No branch summaries involved

**Key Insight**

* Even linear chats benefit from delta summaries
* No “summary till now” blob ever exists

---

## Scenario 2: Branching an Ongoing Conversation

### Description

User branches from an existing node to explore a different direction.

---

### Step-by-step

#### Step 1: Branch is created at node `N2`

* New branch `B1`
* Two children:

  * `N3a` (original continuation)
  * `N3b` (new branch)

---

#### Step 2: User continues in branch `N3b`

**Context for `N3b`**

1. Node Delta Summaries from:

   * `N2`, `N1`, `N0`
2. No branch summaries yet (not materialized)

**Important**

* Branch creation itself does **not** trigger summarization
* No duplication of context

---

#### Step 3: User explores deeply in branch

* Nodes `N4b`, `N5b`, `N6b`

Each node:

* Generates its own Node Delta Summary
* Invalidates (but does not recompute) any potential branch summary for `B1`

---

## Scenario 3: Branch Summary Is Needed (Lazy Materialization)

### Description

User asks a question that requires “what did we decide in this branch?”

---

### Trigger

User asks:

> “Based on this branch, what should we do?”

---

### What happens internally

#### Step 1: System detects need for branch summary

* Active intent inferred (e.g. `context-architecture`)
* Branch summary for `(B1, intent)` is:

  * Missing OR stale

---

#### Step 2: Branch summary recomputation

1. Traverse subtree under `B1`
2. Collect Node Delta Summaries
3. Filter by:

   * intent similarity
   * relevance score
4. Produce **Branch Intent Summary**

---

#### Step 3: Context assembly for new node

Context includes:

1. Branch Intent Summary (high priority)
2. Recent Node Delta Summaries
3. Minimal raw messages (if needed)

---

### Key Insight

* Branch summaries are created **because they are needed**
* Not because the branch exists

---

## Scenario 4: Referencing an Old Conversation

### Description

User explicitly references another chat or branch.

Example:

> “Refer to the conclusions from the auth redesign discussion.”

---

### Step-by-step

#### Step 1: User selects referenced chat / branch

* Reference intent inferred or user-specified

---

#### Step 2: System resolves reference

* Identify:

  * Branch ID
  * Relevant intent(s)
* Fetch corresponding Branch Intent Summary

If summary is stale:

* Serve cached version
* Trigger async recompute

---

#### Step 3: Context assembly

Context includes:

1. Referenced Branch Intent Summary
2. Local node deltas
3. Current branch summaries (if relevant)

---

### Important Safeguard

* Referenced summaries are **read-only**
* They do not mutate current branch state

---

## Scenario 5: Cutting a Subtree into a New Chat

### Description

User cuts a subtree and turns it into a standalone chat.

---

### Step-by-step

#### Step 1: Subtree cut

* New chat created with root `N_cut_root`
* Original nodes preserved

---

#### Step 2: New chat initialization

* The cut node becomes `N0` of new chat
* Existing Node Delta Summaries remain valid

---

#### Step 3: Branch summaries

* Old branch summaries are **not copied**
* New branch summaries will be created lazily

---

### Context for first message in new chat

1. Node Delta Summary of `N_cut_root`
2. Optionally:

   * User-selected summaries from old chat

---

### Key Insight

* Cutting does not clone context
* It clones **structure + raw facts**

---

## Scenario 6: Adding Folder-Level Context

### Description

User adds an entire folder to context:

> “Use my ‘Payments Architecture’ folder for reference.”

---

### Step-by-step

#### Step 1: Folder selected

* Folder contains multiple chats / branches

---

#### Step 2: Context resolution

For each chat:

* Select:

  * Most relevant Branch Intent Summary
  * Highest confidence version

---

#### Step 3: Context assembly

Context includes:

* Multiple branch summaries
* Each clearly labeled by source + intent

---

### Important Constraint

* Raw messages from folder chats are **never** pulled by default
* Only summaries

---

## Scenario 7: User Adds Their Own Summary

### Description

User manually adds a summary.

---

### Step-by-step

#### Step 1: User provides summary text

* Stored as:

  * User-authored summary
  * With explicit intent

---

#### Step 2: Context usage

* Treated as **highest-priority context**
* Overrides system-generated summaries

---

### Key Insight

User summaries are:

* Not auto-modified
* Not invalidated
* Always explicit

---

## Scenario 8: User Switches Branch Focus

### Description

User navigates back to another branch and continues.

---

### Step-by-step

#### Step 1: Branch switch

* Active branch changes
* Active intent may change

---

#### Step 2: Context assembly

* Uses:

  * Branch summaries for new branch
  * Recent node deltas in that branch
* Ignores:

  * Other branches unless explicitly referenced

---

### Important

* No summaries are recomputed eagerly
* Only relevance changes

---

## Scenario 9: Meta Question (“What did we decide so far?”)

### Description

User asks a meta-level question.

---

### Step-by-step

1. System identifies:

   * Meta intent
2. Fetches:

   * Branch Intent Summary
3. If stale:

   * Serve cached
   * Recompute async
4. Answer generated using summary

---

## Scenario 10: Stale Summary During Active Typing

### Description

User sends message while summary recomputation is ongoing.

---

### Behavior

* Context uses:

  * Last-known summary
* UI indicates:

  * “Summary updating…”
* No blocking

---

### Principle

> **Correctness is eventual. Responsiveness is immediate.**

---

## Scenario 11: Conflicting Branch Conclusions

### Description

Two branches reach opposite conclusions.

---

### Behavior

* Each branch summary is independent
* No reconciliation attempted
* If both referenced:

  * Both summaries included
  * Clearly labeled

---

## Scenario 12: Very Large Branch (Hundreds of Nodes)

### Behavior

* Summary recomputation:

  * Traverses recent nodes first
  * Stops early when confidence threshold met
* Old nodes ignored unless:

  * Referenced by summary
  * Marked important

---

## Scenario Coverage Checklist

This PRD now explicitly covers:

* ✅ Linear chats
* ✅ Branching
* ✅ Deep exploration
* ✅ Lazy summarization
* ✅ Cross-chat references
* ✅ Folder-level context
* ✅ User-authored context
* ✅ Subtree cutting
* ✅ Latency & staleness
* ✅ Conflicts & scale
