# Testing Guide - Context Assembly System

This guide provides step-by-step instructions to test the implemented Context Assembly System.

## Prerequisites

1. Database connection configured (DATABASE_URL in .env)
2. Apply migrations: `npx prisma migrate dev`
3. Gemini API key configured
4. Development server running: `npm run dev`

---

## Test 1: Linear Conversation Flow ✅

### Objective
Verify that node deltas are created for each conversation turn and context is assembled correctly.

### Steps

1. **Start a new conversation**
   - Navigate to the app
   - Start a new chat
   - Enter: "What is React?"

2. **Verify first node**
   - Check database: `SELECT * FROM "NodeDelta" ORDER BY "createdAt" DESC LIMIT 1;`
   - Expected: One entry with intent like "react-learning" or "general-discussion"
   - Should have `newInformation` with extracted facts

3. **Continue conversation**
   - Follow-up: "How do I use React hooks?"
   - Then: "Show me an example of useState"
   - Then: "What about useEffect?"

4. **Check node deltas**
   ```sql
   SELECT 
     nd."nodeId", 
     nd.intent, 
     nd."newInformation"::text as info,
     nd.confidence,
     n."userPrompt"
   FROM "NodeDelta" nd
   JOIN "Node" n ON nd."nodeId" = n.id
   ORDER BY n."createdAt" DESC 
   LIMIT 5;
   ```

5. **Expected Results**
   - ✅ Each node has a corresponding NodeDelta
   - ✅ Intents are consistent (e.g., all "react-learning")
   - ✅ `newInformation` contains structured data:
     - Facts about React concepts
     - Possibly constraints (e.g., "hooks only work in function components")
   - ✅ Confidence scores between 0.7-0.95

6. **Verify context assembly**
   - Add console.log in `src/app/api/nodes/route.ts` after `assembleContext()`:
   ```typescript
   console.log('Context metadata:', assembledContext.metadata);
   ```
   - Should show:
     - Active intent identified
     - Node deltas used (should increase with conversation depth)
     - Token count under budget (< 8000)

---

## Test 2: Branching Conversation Flow ✅

### Objective
Verify that branches are independent and context doesn't leak between siblings.

### Steps

1. **Create base conversation**
   - New chat
   - Message 1: "Explain authentication methods"
   - Message 2: "What about JWT tokens?"
   - Note the node ID of Message 2 (let's call it NODE_A)

2. **Create a branch**
   - In the UI, branch from Message 2
   - New branch message: "Actually, let's discuss OAuth instead"
   - Continue: "How does OAuth 2.0 work?"
   - Note this branch's second node ID (NODE_B)

3. **Check branch structure**
   ```sql
   SELECT 
     n.id,
     n."parentId",
     n."userPrompt",
     nd.intent
   FROM "Node" n
   LEFT JOIN "NodeDelta" nd ON n.id = nd."nodeId"
   WHERE n."parentId" = 'NODE_A_PARENT_ID'
   ORDER BY n."createdAt";
   ```

4. **Expected Results**
   - ✅ Two children from same parent (original + branch)
   - ✅ Different intents: "jwt-authentication" vs "oauth-authentication"
   - ✅ Node deltas for both branches

5. **Verify context isolation**
   - Continue original branch (NODE_A): "How do I implement JWT refresh tokens?"
   - Continue new branch (NODE_B): "What are OAuth scopes?"
   - Check context metadata for each:
     - Original branch should NOT include OAuth node deltas
     - New branch should NOT include JWT-specific deltas
     - Both should share parent history

6. **Check branch summaries NOT created yet**
   ```sql
   SELECT * FROM "BranchSummary";
   ```
   - Expected: Empty or very few entries
   - Summaries are lazy - only created when needed

---

## Test 3: Lazy Branch Summary Materialization ✅

### Objective
Verify that branch summaries are created on-demand and marked stale appropriately.

### Steps

1. **Create a deep conversation**
   - New chat about "database optimization"
   - Add 8-10 messages with decisions:
     - "We should use indexes on frequently queried columns"
     - "Connection pooling is essential"
     - "Avoid N+1 queries"
     - "Use prepared statements"
     - Etc.

2. **Trigger branch summary creation**
   - Ask a meta-question: "Based on our discussion, what are the key database optimization strategies we decided on?"
   - This should trigger `getBranchSummary()` internally

3. **Check branch summary created**
   ```sql
   SELECT 
     bs.id,
     bs."rootNodeId",
     bs.intent,
     bs."content"::text,
     bs.confidence,
     bs."isStale",
     bs.version,
     array_length(bs."coveredNodes"::jsonb::jsonb, 1) as node_count
   FROM "BranchSummary" bs
   ORDER BY bs."createdAt" DESC
   LIMIT 1;
   ```

4. **Expected Results**
   - ✅ One BranchSummary entry created
   - ✅ Intent matches conversation (e.g., "database-optimization")
   - ✅ Content includes:
     - `decisions`: Array of key decisions
     - `constraints`: Any mentioned limitations
   - ✅ `isStale: false` (just created)
   - ✅ `coveredNodes`: Array of node IDs
   - ✅ `version: 1`

5. **Test stale marking**
   - Add a new message with significant content: "We also need to implement caching with Redis"
   - Check branch summary again:
   ```sql
   SELECT "isStale", version FROM "BranchSummary" 
   WHERE intent LIKE '%database%' 
   ORDER BY "createdAt" DESC LIMIT 1;
   ```
   - Expected: `isStale: true`, `version: 1` (not recomputed yet)

6. **Test lazy recomputation**
   - Ask another meta-question: "Summarize all our database decisions including the latest ones"
   - Check branch summary:
   ```sql
   SELECT "isStale", version, "updatedAt" FROM "BranchSummary" 
   WHERE intent LIKE '%database%' 
   ORDER BY "createdAt" DESC LIMIT 1;
   ```
   - Expected: `isStale: false`, `version: 2`, `updatedAt` changed
   - Content should now include Redis caching decision

---

## Test 4: Context Budget Enforcement

### Objective
Verify that context stays within token limits.

### Steps

1. **Create very long conversation**
   - New chat
   - Add 20+ messages on a topic
   - Each message should be substantial (200+ words)

2. **Monitor context size**
   - Add logging in `assembleContext()`:
   ```typescript
   console.log('Context assembly result:', {
     totalTokens: metadata.totalTokens,
     itemsUsed: {
       branchSummaries: metadata.branchSummariesUsed.length,
       nodeDeltas: metadata.nodeDeltasUsed.length,
       rawMessages: metadata.rawMessagesCount
     }
   });
   ```

3. **Expected Results**
   - ✅ `totalTokens` stays under 8000
   - ✅ As conversation grows, older items are dropped
   - ✅ Priority order respected:
     - Branch summaries included (if exist)
     - Recent node deltas included (last ~10)
     - Raw messages limited (last ~3)

---

## Test 5: Intent Tracking

### Objective
Verify that intent classification works and evolves appropriately.

### Steps

1. **Start conversation with clear topic**
   - New chat
   - "How do I implement user authentication in Next.js?"

2. **Check initial intent**
   ```sql
   SELECT nd.intent, n."userPrompt" 
   FROM "NodeDelta" nd
   JOIN "Node" n ON nd."nodeId" = n.id
   ORDER BY n."createdAt" DESC LIMIT 1;
   ```
   - Expected: Something like "nextjs-authentication" or "authentication-implementation"

3. **Continue on same topic**
   - "What about password hashing?"
   - "How do I store sessions?"
   - Check intents: Should remain consistent

4. **Shift topic**
   - "Actually, let's talk about database schema design instead"
   - Check intent: Should change to something like "database-design" or "schema-planning"

5. **Expected Results**
   - ✅ Intent stays consistent within same topic
   - ✅ Intent changes when topic shifts significantly
   - ✅ Child nodes inherit parent intent when continuing same discussion

---

## Test 6: Error Handling

### Objective
Verify graceful degradation when summarization fails.

### Steps

1. **Test without Gemini API key**
   - Temporarily remove GEMINI_API_KEY
   - Create new message
   - Expected: Message succeeds, but node delta may have low confidence or fallback values

2. **Test with invalid parent**
   - Try to create node with non-existent parentId via API
   - Expected: 404 error, no node created

3. **Check error logs**
   - Should see warnings but no crashes
   - System should continue functioning with degraded summarization

---

## Database Verification Queries

### Check all node deltas
```sql
SELECT 
  COUNT(*) as total_deltas,
  COUNT(DISTINCT intent) as unique_intents,
  AVG(confidence) as avg_confidence
FROM "NodeDelta";
```

### Check all branch summaries
```sql
SELECT 
  COUNT(*) as total_summaries,
  SUM(CASE WHEN "isStale" THEN 1 ELSE 0 END) as stale_count,
  AVG(version) as avg_version
FROM "BranchSummary";
```

### See conversation tree with intents
```sql
WITH RECURSIVE tree AS (
  SELECT 
    n.id, 
    n."parentId", 
    n."userPrompt",
    nd.intent,
    0 as depth
  FROM "Node" n
  LEFT JOIN "NodeDelta" nd ON n.id = nd."nodeId"
  WHERE n."parentId" IS NULL
  
  UNION ALL
  
  SELECT 
    n.id, 
    n."parentId", 
    n."userPrompt",
    nd.intent,
    t.depth + 1
  FROM "Node" n
  JOIN tree t ON n."parentId" = t.id
  LEFT JOIN "NodeDelta" nd ON n.id = nd."nodeId"
)
SELECT 
  REPEAT('  ', depth) || LEFT("userPrompt", 50) as conversation_tree,
  intent,
  depth
FROM tree
ORDER BY id;
```

---

## Success Criteria

For the implementation to be considered successful:

1. ✅ **Node Deltas Created**: Every AI response has a corresponding NodeDelta entry
2. ✅ **Intent Classification**: Intents are reasonable and consistent within topics
3. ✅ **Context Assembly**: Metadata shows appropriate context items being used
4. ✅ **Token Budget**: Context never exceeds 8000 token estimate
5. ✅ **Lazy Summaries**: Branch summaries only appear after meta-queries
6. ✅ **Stale Marking**: Summaries marked stale when new content added
7. ✅ **Branch Isolation**: Branches don't contaminate each other's context
8. ✅ **Graceful Degradation**: System works even if summarization partially fails

---

## Troubleshooting

### Issue: No NodeDeltas created
- Check: Is Gemini API key valid?
- Check: Are there errors in server logs?
- Check: Is Prisma client generated? Run `npx prisma generate`

### Issue: Context seems wrong
- Add logging to `assembleContext()` to see what's being included
- Check if intent inference is accurate
- Verify node delta quality in database

### Issue: Branch summaries never created
- Branch summaries are LAZY - only created when:
  - Meta-query is asked
  - Context assembly needs them
  - Explicitly requested
- Try asking "What have we discussed so far?"

### Issue: Database errors
- Ensure migrations are applied: `npx prisma migrate dev`
- Check foreign key constraints are satisfied
- Verify PostgreSQL version compatibility

---

## Next Steps After Testing

Once tests pass:

1. **Monitor Performance**
   - Track summarization latency
   - Monitor token usage
   - Check database query performance

2. **Tune Parameters**
   - Adjust token budget in `context.ts`
   - Modify confidence thresholds
   - Fine-tune intent classification prompts

3. **Plan Phase 2**
   - Multi-intent summaries
   - User-authored summaries
   - Explicit promotion UX
   - Summary diffing and merging
