# Tools

Synapse ships with 24+ builtin tools and supports creating custom tools at runtime.

## How Tools Work

When the AI agent decides it needs to perform an action, it makes a tool call. Synapse executes the tool and feeds the result back to the agent. This can happen multiple times per turn (up to MAX_TOOL_ROUNDS, default 5).

```
User Message
    → Agent thinks
    → Tool call (e.g., web_search)
    → Tool result
    → Agent thinks again
    → Tool call (e.g., read_file)
    → Tool result
    → Final response to user
```

## Builtin Tools

### Execution

| Tool | Description |
|------|-------------|
| `shell_exec` | Execute shell commands in the gateway workspace |
| `code_execute` | Run code snippets (JavaScript, Python, etc.) |

### Agent Management

| Tool | Description |
|------|-------------|
| `spawn_agent` | Create a sub-agent for parallel work |
| `abort_agent` | Stop a running sub-agent |

### File Operations

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents |
| `write_file` | Create or overwrite a file |
| `edit_file` | Make targeted edits to a file |
| `list_files` | List directory contents |
| `delete_file` | Remove a file |

### Web & Search

| Tool | Description |
|------|-------------|
| `web_search` | Search the web (requires Brave API key) |
| `web_fetch` | Fetch and extract content from a URL |

### Memory & Knowledge

| Tool | Description |
|------|-------------|
| `memory_search` | Semantic search across stored memories |
| `memory_store` | Save information to long-term memory |
| `knowledge_search` | Search the knowledge base |

### Communication

| Tool | Description |
|------|-------------|
| `send_message` | Send a message to a channel |
| `a2a_message` | Send a message to another gateway's agent |

### Self-Modification

| Tool | Description |
|------|-------------|
| `convex_deploy` | Deploy changes to the Convex backend |
| `create_tool` | Create a new custom tool at runtime |

### Scheduling

| Tool | Description |
|------|-------------|
| `schedule` | Set a reminder or scheduled task |
| `list_schedules` | View upcoming scheduled tasks |

### Utilities

| Tool | Description |
|------|-------------|
| `think` | Internal reasoning step (not shown to user) |
| `summarize` | Summarize conversation or content |

*Some tools may require a premium license. See [Licensing](./licensing.md) for details.*

## Creating Custom Tools

Synapse agents can create new tools at runtime using the `create_tool` builtin. This allows the AI to extend its own capabilities based on what it needs.

Custom tools are:
- Defined as JavaScript functions
- Stored in the Convex database
- Available immediately after creation
- Scoped to the gateway that created them

## Tool Execution Flow

1. The AI model returns a response containing tool calls
2. Synapse validates each tool call against the gateway's allowed tools
3. Tools execute in order (or parallel for independent calls)
4. Results are collected and sent back to the model
5. The model can make additional tool calls or return a final response
6. This repeats for up to MAX_TOOL_ROUNDS (default: 5)

## Tool Permissions

Gateway admins can control which tools are available:
- Enable or disable specific tools per gateway
- Some tools (like `shell_exec`) can be restricted to admin users
- Premium tools require an active license

---

Built by [The Chimaera Company LLC](https://chimaeraco.dev)
