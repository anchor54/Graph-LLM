# Product Requirements Document (PRD)

## Title

Multi-Pass Prompting Architecture with Clarity Gating

---

## Author

Ankur Mazumder

## Status

Draft

## Last Updated

2026-01-27

---

## 1. Background & Motivation

Large Language Models (LLMs) accessed directly via APIs often produce responses that are:

* Overly generic or bland
* Overconfident despite missing information
* Inconsistent in depth and structure
* Prone to implicit assumptions

In contrast, chat-based platforms (e.g., ChatGPT, Gemini UI) feel significantly more intelligent due to layered prompt engineering, intent interpretation, reasoning separation, and response shaping.

Currently, most API consumers rely on **single-pass prompting**, where a single user message is sent to the model and a response is returned. This approach fails to emulate real human problem-solving behavior.

A senior engineer typically:

1. Clarifies the problem
2. Identifies missing information
3. Thinks deeply about the solution
4. Structures the explanation
5. Refines communication

This document proposes a **multi-pass prompting architecture** that explicitly encodes this workflow, with a mandatory **clarity gate** that prevents hallucinated or assumptive answers.

---

## 2. Problem Statement

### Core Problem

The system should:

* Avoid answering underspecified or ambiguous questions
* Ask clarifying questions when required
* Produce high-quality, structured, insightful responses when sufficient information exists

### Current Limitations

| Issue                  | Impact                          |
| ---------------------- | ------------------------------- |
| Single-pass prompting  | Shallow or generic responses    |
| Implicit assumptions   | Incorrect or misleading answers |
| No intent modeling     | Misaligned responses            |
| No reasoning isolation | Reduced depth                   |
| No quality refinement  | Poor readability                |

---

## 3. Goals & Non-Goals

### Goals

* Build a reusable, extensible LLM orchestration layer
* Explicitly separate interpretation, reasoning, and communication
* Prevent answering when information is insufficient
* Provide deterministic and explainable control flow
* Support future task-specific pipelines

### Non-Goals

* Training or fine-tuning LLMs
* Building a UI layer
* Replacing human judgment in critical decision-making

---

## 4. High-Level Solution Overview

The proposed system introduces **multi-pass prompting with a clarity gate**.

### Conceptual Flow

```
User Input
   ↓
Intent & Clarity Gate
   ↓
 ┌───────────────────────────┐
 │ Can the question be       │
 │ answered without guessing?│
 └───────────┬───────────────┘
             │
     YES ────┘        NO
      ↓                 ↓
Deep Reasoning     Ask Clarifying Questions
      ↓                 ↓
Answer Construction   Stop Pipeline
      ↓
Quality Rewrite
      ↓
Final Output
```

---

## 5. Functional Requirements

### FR-1: Intent Extraction

The system must:

* Identify user intent
* Normalize raw user input into a refined problem statement

### FR-2: Clarity Detection (Gate)

The system must:

* Detect ambiguity or missing critical information
* Avoid assumptions
* Decide whether answering is allowed

### FR-3: Clarifying Question Generation

If information is insufficient:

* Generate concise, actionable clarifying questions
* Output questions only (no partial answers)

### FR-4: Deep Reasoning Pass

If answering is allowed:

* Generate internal reasoning content
* Optimize for depth and correctness
* Not be user-facing

### FR-5: Answer Construction

Transform reasoning into:

* Structured explanation
* Clear mental models
* Appropriate technical depth

### FR-6: Quality Rewrite (Optional)

* Improve clarity and flow
* Remove redundancy
* Preserve meaning

---

## 6. Non-Functional Requirements

* Deterministic control flow
* Configurable per-pass temperature and parameters
* Ability to skip passes for latency optimization
* Observable decision-making (can_answer = true/false)
* Extensible to new task types

---

## 7. System Architecture

### Core Components

1. **Prompt Registry**

   * Stores system prompts per pass

2. **Pipeline Orchestrator**

   * Controls execution order
   * Enforces clarity gate

3. **LLM Client**

   * Stateless model invocation

4. **Response Controller**

   * Determines final output type

---

## 8. Detailed Pass Definitions

### Pass 1: Intent & Clarity Gate

**Purpose**

* Interpret user intent
* Identify missing or ambiguous information
* Decide whether answering is permitted

**Output Contract (JSON only)**

```json
{
  "intent": "string",
  "can_answer": true | false,
  "missing_info": ["string"],
  "clarifying_questions": ["string"]
}
```

**Rules**

* No assumptions
* No answering
* Conservative bias toward asking questions

---

### Pass 2: Deep Reasoning

**Purpose**

* Generate comprehensive internal understanding

**Characteristics**

* Not user-facing
* Higher temperature
* Encouraged exploration

---

### Pass 3: Answer Construction

**Purpose**

* Convert reasoning into a coherent explanation

**Guidelines**

* Structured sections
* Technical clarity
* No mention of internal steps

---

### Pass 4: Quality Rewrite (Optional)

**Purpose**

* Improve readability and confidence

---

## 9. Orchestration Logic

### Pseudocode

```ts
async function runPipeline(userInput) {
  const gate = await llm(intentGatePrompt, userInput);

  if (!gate.can_answer) {
    return {
      type: "clarification",
      questions: gate.clarifying_questions
    };
  }

  const reasoning = await llm(reasoningPrompt, gate.intent);
  const draft = await llm(writerPrompt, reasoning);
  const final = await llm(editorPrompt, draft);

  return {
    type: "answer",
    content: final
  };
}
```

---

## 10. Milestones & Implementation Plan

### Milestone 1: Core Pipeline Skeleton

**Scope**

* LLM client abstraction
* Orchestrator framework

**Deliverables**

* Basic pipeline execution
* Logging and tracing

---

### Milestone 2: Intent & Clarity Gate

**Scope**

* Prompt design
* Strict JSON parsing
* Hard stop logic

**Success Criteria**

* No answer returned when can_answer = false

---

### Milestone 3: Multi-Pass Reasoning

**Scope**

* Reasoning prompt
* Writer prompt
* Parameter tuning per pass

---

### Milestone 4: Quality Rewrite Layer

**Scope**

* Optional final refinement
* Toggle via configuration

---

### Milestone 5: Observability & Evaluation

**Scope**

* Capture gate decisions
* Compare single-pass vs multi-pass output
* Latency metrics

---

## 11. Risks & Mitigations

| Risk                  | Mitigation                         |
| --------------------- | ---------------------------------- |
| Increased latency     | Allow pass skipping                |
| Over-questioning      | Tune clarity gate conservativeness |
| JSON parsing failures | Schema validation + retries        |
| Cost increase         | Cache early passes                 |

---

## 12. Future Extensions

* Task-specific pipelines (RCA, PR review, design docs)
* State-machine-based orchestration
* Confidence scoring
* Auto-follow-up handling
* Integration with memory/context stores

---

## 13. Success Metrics

* Reduction in hallucinated responses
* Higher user satisfaction ratings
* Improved response depth
* Lower clarification cycles over time

---

## 14. Summary

This architecture transforms raw LLM APIs into an **engineered reasoning system** that:

* Thinks before answering
* Refuses to guess
* Communicates clearly
* Scales across problem domains

It encodes senior-engineer judgment directly into software, enabling reliable and high-quality AI-assisted workflows.
