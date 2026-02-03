# Product Requirements Document (PRD)

## Feature Name

Async Chat-Tree → Thought-Graph → Markdown Conversion

---

## 1. Overview

### Summary

This feature introduces an **asynchronous, staged workflow** for converting chat trees into Thought-Graphs and exporting them as Markdown. Instead of a blocking or opaque operation, users see clear progress across semantic stages, can retry or cancel safely, and are notified upon completion.

The async design improves trust, debuggability, scalability, and user experience for long-running, LLM-powered reasoning workflows.

---

## 2. Problem Statement

Markdown conversion involves multiple non-trivial steps:

* LLM-based semantic distillation
* Reasoning graph construction
* Intent interpretation
* Filtering and rendering

Synchronous execution leads to:

* UI blocking or spinners with no feedback
* Unclear failure reasons
* No way to retry or resume
* Poor perceived reliability

Users need **visibility and control** over the conversion process.

---

## 3. Goals & Non-Goals

### Goals

* Make conversion a non-blocking async operation
* Expose meaningful progress stages to users
* Allow safe retries and cancellation
* Notify users when the operation completes
* Persist intermediate artifacts for recovery

### Non-Goals

* True background/offline processing
* Parallel editing during conversion
* Real-time streaming Markdown output

---

## 4. User Value

Users should:

* Know what the system is doing at each step
* Trust that the process is progressing or recoverable
* Navigate away without losing work
* Return to a completed document without re-running

---

## 5. User Flow

1. User selects a node and clicks **“Convert to Markdown”**
2. User configures scope and intent (optional)
3. User starts conversion
4. Async pipeline begins
5. User sees staged progress UI
6. User may:

   * Stay and watch progress
   * Navigate away
7. On completion:

   * Auto-transition to preview (if still present)
   * Show actionable toast (if navigated away)

---

## 6. Pipeline Stages (User-Facing)

Stages are semantic and human-readable, not technical.

1. **Analyzing discussions**

   * Chat segmentation
   * Semantic distillation

2. **Building thought graph**

   * Semantic node linking
   * Graph validation

3. **Interpreting your intent**

   * Natural language → ExportPlan

4. **Preparing document**

   * Filtering semantic nodes
   * Ordering and grouping

5. **Finalizing markdown**

   * Deterministic rendering

Each stage has one of the following states:

* Pending
* In progress
* Completed
* Failed

---

## 7. Progress UI Requirements

### Progress View

* Vertical stepper or checklist
* Clearly indicates current stage
* Shows completed vs pending stages

Example:

```
✓ Analyzing discussions
✓ Building thought graph
⟳ Interpreting your intent
• Preparing document
• Finalizing markdown
```

### Behavior

* Progress updates in near real-time
* No indeterminate spinners

---

## 8. Completion & Notification

### If User Is Present

* Automatically transition to Markdown preview

### If User Navigated Away

* Show toast notification:

  > “Markdown ready — click to view”

Toast must be actionable and deep-link back to the result.

---

## 9. Failure Handling

### Failure Scenarios

* LLM timeout or error
* Ambiguous intent interpretation
* Graph validation failure

### UX on Failure

* Stage marked as failed
* Clear, human-readable error message
* Offer contextual actions:

  * Retry stage
  * Edit intent
  * Cancel job

Failures must not require restarting the entire pipeline.

---

## 10. Cancellation

Users may cancel an in-progress conversion.

### Cancellation Behavior

* Current stage is stopped
* Completed stages are preserved
* Job marked as cancelled

Cancelled jobs may be resumed later.

---

## 11. Persistence Requirements

### Persisted During Async Execution

* Segmentation results
* Semantic nodes
* Thought-Graph
* Draft ExportPlan
* Stage statuses

### Not Persisted

* Partial Markdown output
* Raw prompts or intermediate LLM text

Persistence enables:

* Resume after failure
* Debugging
* Cost-efficient retries

---

## 12. Performance & Scalability

* Pipeline must support large chat trees via partial hydration
* Stages should be independently retryable
* Async jobs should be resumable after app reload

---

## 13. Success Metrics

* ≥95% of conversions complete without full restart
* Reduced user abandonment during conversion
* High user confidence in system transparency
* Low support/debug incidents related to “stuck” exports

---

## 14. UX Principles

* Prefer visibility over speed
* Semantic progress over technical jargon
* Never silently fail
* Never expand scope without user consent

---

## 15. Core Principle (Invariant)

**Long-running reasoning transformations must be observable, interruptible, and recoverable.**

This invariant must not be violated in future iterations.
