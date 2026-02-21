# Synapse Audit - Feb 12, 2026

## Summary
Mara (OpenClaw sub-agent) audited and fixed the Synapse chat agent's CLI interface.

## Issues Found & Fixed

### 1. Tool Execution Not Working (FIXED)
**Problem:** `synapse-chat.js` only streamed text - when Claude wanted to use tools, it roleplayed tool calls instead of executing them. No tool definitions were passed to pi-ai, and no tool loop existed.

**Fix:** Rewrote `synapse-chat.js` to:
- Include all tool definitions (get_soul, save_soul, knowledge_query, memory_store, memory_search, get_time, web_search, list_agents, spawn_agent, kill_agent) in the pi-ai `streamSimple` call
- Handle `toolcall_end` events from the stream
- Execute tools via inline executors that call Convex directly (no @/ imports needed for CLI)
- Feed tool results back as `toolResult` messages and loop (up to 5 rounds)
- Log tool execution to stdout: `[TOOL name] OK/ERROR`

### 2. No User Knowledge Stored (FIXED)
**Problem:** The knowledge base was empty - Synapse had no information about Brad.

**Fix:** Seeded 9 knowledge entries via `api.functions.knowledge.upsert`:
- user_name: Bradley DiLeonardo
- user_job: Amusement Manager at AIKG
- user_location: Atlanta, Georgia
- user_timezone: America/New_York (EST)
- user_projects: BeTS, King of Pops, Chimaera Comics
- user_business: The Chimaera Company LLC
- user_interests: Gaming, AI, vibe coding
- user_communication: Direct, adaptive energy, cursing allowed
- user_girlfriend: Kam

### 3. Stale Session (FIXED)
**Problem:** Old session had 119 messages, cluttering context.

**Fix:** Created fresh session `n1779kgq636dgh1k7n08etxkt1811v12` with externalUserId `mara:openclaw`. Updated script with new session ID.

## Test Results

### Test 1: "Use get_soul to tell me about yourself"
- **Result:** PASS - Called get_soul tool, returned full soul/identity data, gave coherent response about being Synapse
- Tool output: 3727 chars of identity JSON

### Test 2: "What do you know about Brad? His job, projects, timezone?"
- **Result:** PASS - Called get_soul then knowledge_query, returned all seeded knowledge accurately
- Listed job, projects, location, timezone, personal details correctly

### Test 3: "Store a memory that Mara tested you on Feb 12 2026..."
- **Result:** PASS - Called memory_store tool, confirmed storage
- Stored: [context] mara_testing_feb2026 = On Feb 12 2026, Mara tested Synapse and found issues...

## Remaining Issues / Notes

1. **web_search** - Returns "not configured" in CLI mode (needs BRAVE_SEARCH_API_KEY)
2. **spawn_agent / kill_agent** - Disabled in CLI mode (complex async execution)
3. **Token tracking** - CLI saves 0/0 tokens (doesn't capture usage from pi-ai `done` events) - could be improved
4. **get_soul called too often** - Synapse calls get_soul on almost every message even when not needed. Could be addressed with better system prompt guidance.
5. **Cost tracking** - No cost calculation in CLI mode
6. **file_read/file_write/shell_exec/code_execute** - Not exposed in CLI tool defs (available in web UI via builtinTools.ts). Could add if needed.

## Files Modified
- `/root/clawd/scripts/synapse-chat.js` - Complete rewrite with tool execution loop
- Knowledge base seeded via Convex mutations (no schema changes)
- New session created via Convex mutation
