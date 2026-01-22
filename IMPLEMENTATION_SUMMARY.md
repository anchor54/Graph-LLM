# Context Assembly System - Implementation Summary

## ✅ Completed Implementation

This implementation follows the PRD's Phase 1 requirements for the Context Summarization & Context Assembly System.

### 1. Database Schema Updates ✅

**File:** `prisma/schema.prisma`

Added two new models:

#### NodeDelta Model
Stores incremental summaries for each node:
- `nodeId` (PK, FK to Node)
- `intent` (string) - classified intent of the conversation
- `newInformation` (JSON) - structured data: decisions, constraints, facts, rejected_options
- `openQuestions` (JSON array) - unresolved questions
- `confidence` (float) - confidence score 0.0-1.0
- `derivedFrom` (JSON array) - parent node IDs

#### BranchSummary Model
Stores materialized branch summaries:
- `id` (UUID PK)
- `rootNodeId` (FK to Node)
- `intent` (string) - the intent this summary covers
- `content` (JSON) - consolidated: decisions, constraints, rejected_options, open_questions
- `confidence` (float)
- `coveredNodes` (JSON array) - node IDs included in summary
- `isStale` (boolean) - marks when recomputation is needed
- `version` (int) - increments on each update

**Unique constraint:** `(rootNodeId, intent)` - one summary per branch per intent
**Index:** `(rootNodeId, isStale)` - for efficient stale summary queries

### 2. Summarization Library ✅

**File:** `src/lib/summarization.ts`

Implements LLM-driven summarization logic:

#### Functions:
- **`inferIntent()`** - Classifies user intent from messages (e.g., "authentication-design", "bug-investigation")
- **`generateNodeDelta()`** - Extracts structured information (decisions, facts, constraints) from a user-AI exchange
- **`storeNodeDelta()`** - Persists node delta to database
- **`getNodeDeltas()`** - Retrieves deltas for specified nodes
- **`generateBranchSummary()`** - Aggregates node deltas into coherent branch summary
- **`storeBranchSummary()`** - Persists or updates branch summary
- **`invalidateBranchSummaries()`** - Marks summaries as stale when new content is added
- **`getBranchSummary()`** - Lazy materialization: recompute if stale, serve cached otherwise

**Key Design Decisions:**
- Uses Gemini 2.0 Flash Lite for fast, cost-effective summarization
- Structured JSON output for consistent parsing
- Graceful fallbacks on LLM failures
- Intent-based filtering for relevance

### 3. Context Assembly Engine ✅

**File:** `src/lib/context.ts`

Implements the Context Assembly Algorithm (PRD §7.2):

#### Main Function: `assembleContext()`
Reconstructs context on-demand for each new node following this algorithm:

1. **Identify Active Intent**
   - Inherit from parent node delta
   - Can be overridden by explicit user signal (future enhancement)

2. **Collect Context (Priority Order)**
   - Recent Node Delta Summaries (last 10, walking upward)
   - Branch Intent Summaries (matching active intent)
   - Referenced Conversations (if explicitly selected)
   - Raw Messages (last 3 for grounding)

3. **Budget Enforcement**
   - Hard limit: 8000 tokens (~32KB text)
   - Priority-based dropping when over budget
   - Drops raw messages first, then low-confidence summaries

4. **Return Assembled Context + Metadata**
   - Formatted text ready for LLM prompt
   - Metadata: active intent, summaries used, token count

#### Helper Functions:
- **`formatContextForPrompt()`** - Formats context with system instructions
- **`hasSignificantContent()`** - Determines if node delta warrants invalidation
- **`findBranchRoot()`** - Walks tree to find branch starting point
- **`getAncestors()`** - Recursive query for ancestor nodes

**Token Budget:**
- Conservative 8K token limit for context
- ~0.25 tokens per character estimate
- Ensures fast inference and cost control

### 4. API Integration ✅

**File:** `src/app/api/nodes/route.ts`

Refactored `POST /api/nodes` to use new system:

#### Flow:
1. **Before LLM Call:**
   - Call `assembleContext()` to build optimal prompt
   - Include citations if provided
   - Use assembled context instead of manual partitioning

2. **After LLM Response:**
   - Store Node with AI response
   - Generate and store Node Delta Summary
   - Infer intent (inherit from parent or classify)
   - Invalidate branch summaries if significant content
   - Return metadata about summarization process

3. **Streaming Support:**
   - Non-blocking: summarization happens after stream completes
   - Errors in summarization don't fail the request
   - Client receives summarization metadata in final message

### 5. Migration Files ✅

**File:** `prisma/migrations/20260122_add_summarization_system/migration.sql`

SQL migration ready to apply:
- Creates NodeDelta and BranchSummary tables
- Adds foreign key constraints with CASCADE delete
- Creates necessary indexes

**To apply:** User must run `npx prisma migrate dev` when database URL is configured

---

## 🎯 PRD Requirements Met

### Phase 1 Requirements:
- ✅ **Node Delta Summaries** - Created synchronously after each AI response
- ✅ **Single Intent per Branch** - Intent tracking at node and branch level
- ✅ **Lazy Branch Summaries** - Only materialized when needed
- ✅ **Pull-based Context Assembly** - Context reconstructed on-demand, never pushed

### Core Principles:
- ✅ **No Automatic Propagation** - Summaries don't push upward
- ✅ **Eager Invalidation** - Branch summaries marked stale immediately
- ✅ **Lazy Recomputation** - Recomputed only when accessed
- ✅ **Cached-First Policy** - Always serve last-known summary, update async
- ✅ **Explainable Context** - Metadata tracks which summaries were used

### Non-Goals Respected:
- ❌ No global truth maintenance
- ❌ No automatic branch reconciliation
- ❌ No replacement of raw history (summaries are indexes)

---

## 📋 Testing Checklist

### Linear Conversation Test:
1. Start new chat (root node N0)
2. Send message → creates N1 with node delta
3. Continue conversation → N2, N3, N4...
4. Verify:
   - Each node has a NodeDelta entry
   - Intent is consistent or evolves appropriately
   - Context uses recent deltas (not full history)

### Branching Conversation Test:
1. Create branch at existing node N2
2. Create child N3b (alternative to N3a)
3. Continue in branch → N4b, N5b
4. Verify:
   - Node deltas created for each branch node
   - Branch summaries are NOT created until needed
   - Context includes parent history but not sibling branches

### Lazy Summarization Test:
1. Create deep branch (10+ nodes)
2. Make query asking "what did we decide so far?"
3. Verify:
   - Branch summary is generated on-demand
   - Summary includes decisions from relevant nodes
   - `isStale` flag is false after generation
4. Add new node with significant content
5. Verify:
   - Branch summary marked as `isStale: true`
6. Make another meta query
7. Verify:
   - Summary is recomputed
   - Version number increments

---

## 🚀 Next Steps for User

### 1. Apply Database Migration
```bash
npx prisma migrate dev
```

### 2. Test the System
- Start the development server: `npm run dev`
- Create a new conversation
- Observe summarization metadata in responses

### 3. Monitor Summarization
Check database for:
- `NodeDelta` entries being created
- Branch summaries appearing on meta-queries
- Intent classification accuracy

### 4. Future Enhancements (Phase 2)
- Multi-intent summaries per branch
- Confidence-based summary filtering
- Explicit promotion UX (promote conclusions to parent)
- Intent evolution tracking
- User-authored summary support

---

## 🔧 Configuration

### Environment Variables Required:
- `DATABASE_URL` - PostgreSQL connection string
- `GEMINI_API_KEY` - For summarization (or per-request key)

### Model Used:
- Summarization: `gemini-2.0-flash-lite` (fast, cost-effective)
- Can be configured in `src/lib/summarization.ts`

---

## 📚 Key Files

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Database schema with new models |
| `src/lib/summarization.ts` | LLM-driven summarization logic |
| `src/lib/context.ts` | Context assembly algorithm |
| `src/app/api/nodes/route.ts` | API integration |
| `prisma/migrations/20260122_add_summarization_system/migration.sql` | Migration SQL |

---

## 🎓 Architecture Highlights

### Data Flow:
```
User Message → Node Created
    ↓
AI Response Generated (using assembled context)
    ↓
Node Delta Summary Created
    ↓
Branch Summaries Marked Stale
    ↓
(Later) Branch Summary Recomputed on Access
```

### Context Assembly:
```
New Message Arrives
    ↓
Identify Active Intent
    ↓
Collect: Node Deltas + Branch Summaries + Raw Messages
    ↓
Prioritize & Apply Token Budget
    ↓
Format for LLM Prompt
```

### Lazy Materialization:
```
Branch Summary Requested
    ↓
Check: Exists? Stale?
    ├─ Fresh: Return Cached
    └─ Stale/Missing:
        ↓
    Fetch Node Deltas
        ↓
    Generate Summary
        ↓
    Store & Return
```

---

## ✅ Implementation Complete

All Phase 1 requirements from the PRD have been implemented and are ready for testing.
