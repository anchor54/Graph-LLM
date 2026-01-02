## Product Requirements Document (PRD): **NexusChat** (Working Title)

**Version:** 1.0

**Status:** Draft

**Target Date:** Q2 2026

---

### 1. Executive Summary

**NexusChat** is a web-based LLM orchestrator designed for power users who find existing linear chat interfaces (ChatGPT, Gemini) insufficient for complex, long-term projects. It treats LLM interactions as a structured knowledge graph, allowing users to organize, branch, and link conversations through a hierarchical file system and sophisticated context management.

---

### 2. Problem Statement

* **Linearity:** Standard LLM chats are one-dimensional; users cannot explore multiple paths without losing history or creating redundant threads.
* **Context Loss/Bloat:** Long chats become expensive and the LLM loses focus ("needle in a haystack" problem).
* **Siloed Knowledge:** Information shared in one chat is "invisible" to another unless manually copied.

---

### 3. Target Audience

* **Software Engineers:** Managing codebases across different modules.
* **Researchers:** Branching hypotheses from central literature reviews.
* **Content Creators:** Maintaining brand "voice" rules across various campaign folders.

---

### 4. Functional Requirements

#### 4.1 Hierarchical Organization
    Nested Folders: Support for an infinite-depth folder tree.
    Folder Premises (Inheritance): Users can define "Rules" or "Knowledge" at a folder level.
        Behavior: Any chat inside Folder A > Subfolder B automatically inherits rules from both A and B.
    Workspace Management: Drag-and-drop support for moving chats and folders across the hierarchy.

#### 4.2 Advanced Conversation Flow
    Conversation Branching:
        Create a new chat from any message node in an existing conversation.
        Summarized Branching: Option to start a branch with an AI-generated summary of the parent conversation to save tokens.
    Conversation Cutting (Pruning):
        Users can "cut" (disable) specific messages in a thread.
        Behavior: Cut messages are visually preserved but excluded from the context sent to the LLM to prevent hallucinations from polluting the logic.
    Cross-Reference (@Mention): Ability to "pin" other chats or folders to the current conversation as external knowledge.

#### 4.3 Context Orchestration ("The Brain")
    Hybrid RAG (Retrieval-Augmented Generation):
        Internal RAG: Automatically index all chats within a user’s workspace.
        Scoped Retrieval: The LLM can search for facts across the current branch, the current folder, or the entire workspace based on user settings.
    Context Inspector (The HUD):
        A side-panel showing exactly what text/rules are being sent to the LLM.
        Toggles: Users can manually enable/disable specific "inherited" rules for a single message.
        Token Budgeter: Visual breakdown of how much context is being used by: (1) System Rules, (2) Parent Summary, (3) RAG results, (4) Chat History.

#### 4.4 Discovery
    Semantic Search: Conceptual search across all folders.
        Example: Searching for "database optimization" finds chats about "indexing" even if the word "optimization" wasn't used.

---

### 5. Non-Functional Requirements

* **Latency:** Context assembly and RAG retrieval should add < 500ms to the total LLM response time.
* **Privacy:** All chat data must be encrypted at rest; RAG embeddings should be stored in a private user-specific namespace.
* **Scalability:** Support for 1,000+ folders and 10,000+ message nodes per user without UI lag.

---

### 6. User Flow (Example: Branching)

1. **User** hovers over a message in an existing "Backend Dev" chat.
2. **User** clicks "Branch Here."
3. **System** prompts: "Full History or Summary?"
4. **User** selects "Summary."
5. **System** generates a 3-paragraph summary of the parent thread, injects the "Backend Folder Rules," and opens a new chat pane.

---

### 7. Future Scope (V2.0)

* **Snapshotting:** Labeled "Saved States" for easy rollbacks.
* **Collaborative Folders:** Sharing a hierarchical knowledge base with a team.
* **Alias/Variable Support:** Global variables (e.g., `{{api_version}}`) for dynamic prompting.
