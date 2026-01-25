# Product Requirements Document (PRD)

## Title

In-Memory Conversation Tree Management & Reload-Free Navigation

## Author

Ankur Mazumder

## Status

Draft

## Overview

This document defines the product and technical requirements for improving the chat application’s navigation and performance by introducing an in-memory conversation tree, eliminating page reloads during navigation, and enabling efficient traversal between nodes within the same conversation tree.

The goal is to make the chat experience feel instantaneous and intentional while preserving correctness, durability, and scalability.

---

## Problem Statement

### Current Behavior

* Each conversation is modeled as a graph/tree of nodes.
* Each node has a unique `nodeId`.
* Selecting a node fetches the full path from root → selected node from the database.
* Creating a new node requires a page refresh to:

  * Show the new message
  * Update the URL
  * Update selected state in the graph UI

### Issues

* Page reloads break flow and feel slow.
* Re-fetching the same ancestry is redundant.
* Graph interactions feel heavier than they need to be.
* Navigation logic is tightly coupled to routing instead of state.

---

## Goals

1. Eliminate page reloads during node creation and navigation.
2. Enable instant navigation within the same conversation tree.
3. Minimize database reads for navigation.
4. Allow smooth branching and exploration of conversations.
5. Preserve deep-linking and refresh safety.
6. Phase changes incrementally to reduce risk.

---

## Non-Goals

* Real-time multi-user collaboration (out of scope for now).
* Aggressive memory eviction or subtree paging (future consideration).
* Full offline-first support.

---

## Key Concepts

### Conversation Tree

* A directed tree (or DAG) of conversation nodes.
* Each node has:

  * `nodeId`
  * `parentId`
  * `content`
  * `metadata`

### Workspace

* A client-side concept representing the currently active conversation context.
* Owns:

  * Active node
  * Loaded conversation tree
  * Navigation logic

---

## Proposed Architecture

### High-Level Principles

* **Client memory is the working set**
* **Database is the durability layer**
* **Navigation is a state transition, not a reload**
* **URL is a side-effect, not the source of truth**

---

## Navigation Model

### Types of Navigation

1. **Same-Tree Navigation**

   * Moving between nodes within the same conversation tree.
   * No page reload.
   * No full re-fetch.

2. **Cross-Tree Navigation**

   * Selecting a node outside the currently loaded tree.
   * Requires hydration of a new tree.
   * Still no hard reload.

---

## Efficient Same-Tree Navigation (LCA-Based Update)

### Problem

When switching between nodes in the same conversation tree, the displayed conversation thread should update efficiently without re-rendering the entire path from the root.

### Solution: Lowest Common Ancestor (LCA)

When navigating from node A → node B:

1. Compute paths:

   * `pathA = root → A`
   * `pathB = root → B`
2. Find the **Lowest Common Ancestor (LCA)** of A and B.
3. Update the UI by:

   * Removing messages after the LCA from the current thread
   * Appending messages from LCA → B

### Benefits

* Minimal DOM updates
* No unnecessary re-renders
* Feels instantaneous even for deep trees

### Requirements

* Parent pointers available in memory
* Fast ancestry lookup (cached paths or parent traversal)

---

## In-Memory Data Model

### Workspace Store

* `nodesById: Map<NodeId, Node>`
* `childrenById: Map<NodeId, NodeId[]>`
* `activeNodeId: NodeId`
* `activePath: NodeId[]`
* `workspaceStatus: idle | switching | error`

---

## Persistence Model

### Write Path

1. Create/update node optimistically in memory
2. Persist asynchronously to DB
3. Reconcile on success/failure

### Read Path

* Prefer memory
* Fetch only missing nodes or entire tree on cold start

---

## URL Management

* URL reflects the currently active node
* URL updates are triggered by workspace state changes
* Initial load hydrates workspace from URL

---

## Milestones & Phased Rollout

### Milestone 1: Centralized Workspace State (Low Risk)

**Scope**

* Introduce `useWorkspace` as the single source of truth
* Track `activeNodeId` in memory
* Sync URL via client-side routing (no reload)

**Outcome**

* Node selection updates UI without refresh
* URL updates reliably

---

### Milestone 2: In-Memory Conversation Tree

**Scope**

* Load entire conversation tree on workspace entry
* Normalize nodes into in-memory store
* Stop refetching ancestry on node selection

**Outcome**

* Instant same-tree navigation
* Reduced backend load

---

### Milestone 3: Optimistic Node Creation

**Scope**

* Create nodes optimistically in memory
* Support temporary node IDs
* Async persistence with reconciliation

**Outcome**

* No refresh after message send
* Faster perceived response

---

### Milestone 4: LCA-Based Thread Updates

**Scope**

* Compute LCA on node switches
* Update conversation thread incrementally
* Avoid full thread re-renders

**Outcome**

* Highly efficient UI updates
* Smooth navigation for deep trees

---

### Milestone 5: Cross-Tree Navigation & Hydration

**Scope**

* Detect navigation outside current tree
* Soft-switch workspace context
* Fetch and hydrate new tree

**Outcome**

* Seamless movement between conversation trees
* No hard reloads

---

## Success Metrics

* Zero page reloads during normal navigation
* <50ms latency for same-tree node switches
* Reduced API calls per navigation
* Improved user engagement with branching

---

## Risks & Mitigations

| Risk                     | Mitigation                           |
| ------------------------ | ------------------------------------ |
| Memory growth            | Limit workspace to one active tree   |
| State inconsistencies    | Single authoritative workspace store |
| Failed optimistic writes | Retry + error states                 |

---

## Open Questions

* Should very large trees be partially hydrated?
* Do we need subtree-level versioning?
* How to handle deleted or rebased nodes?

---

## Appendix

Future enhancements may include:

* Tree eviction policies
* Multi-device synchronization
* Collaborative branching
