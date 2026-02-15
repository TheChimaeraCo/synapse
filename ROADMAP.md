# Synapse Roadmap

This is the public roadmap for Synapse. It shows what we've shipped, what we're working on, and where we're headed.

Last updated: February 2026

---

## v0.1 - Beta (Current)

**Status: Released**

The foundation. Everything you need to run AI agents across multiple channels with a unified backend.

### Core Platform
- [x] Multi-gateway architecture (create multiple gateways, switch between them, invite-only registration)
- [x] Multi-channel support (Web chat, Telegram via grammY, Discord, WhatsApp)
- [x] Each channel operates as an independent AI conversation
- [x] Auth.js authentication with role-based access
- [x] Convex backend (self-hosted or cloud)
- [x] Premium Apple-glass UI design
- [x] PWA with push notifications
- [x] License system with tiered feature gating

### Agent System
- [x] Multi-agent system with sub-agents/workers
- [x] Parallel agent execution with abort control and cost tracking
- [x] Tool execution loop (MAX_TOOL_ROUNDS=5) with 24+ builtin tools
- [x] Agent souls and user profiles (personality system)
- [x] Skill engine for modular capabilities
- [x] Model routing (task-based model selection)
- [x] Self-modification capabilities (convex_deploy, create_tool)

### Conversations & Memory
- [x] Conversation chains with decisions and summaries
- [x] Semantic memory search with embeddings
- [x] Knowledge management
- [x] Scheduling and reminders with natural language parsing

### Security
- [x] 10-layer prompt injection defense
- [x] License validation (JWT keys, phone-home)

### Tools & Integrations
- [x] 24+ builtin tools (shell_exec, code_execute, spawn_agent, convex_deploy, create_tool, and more)
- [x] File manager (full file browser/editor at /files)
- [x] PM2 integration (dashboard panel, popout console, log viewer, settings)
- [x] A2A cross-gateway messaging
- [x] Voice support

---

## v0.2 - Coming Soon

**Status: In Progress**

Expanding intelligence, improving developer experience, and adding streaming.

- [ ] Knowledge tab with visualizations (dedicated page, moved from Settings)
- [ ] MCP (Model Context Protocol) server support
- [ ] RAG (Retrieval Augmented Generation) improvements
- [ ] Streaming responses
- [ ] Project intelligence system (AI proposes projects, tracks tasks and decisions per project)
- [ ] Discord bot integration improvements

---

## v0.3+ - Future

**Status: Planned**

These are things we're exploring. Priorities may shift based on feedback.

- [ ] Plugin marketplace
- [ ] Custom tool builder UI
- [ ] Multi-model conversations (different models in the same chat)
- [ ] Real-time voice chat
- [ ] Mobile app
- [ ] Self-hosted Convex deployment guide
- [ ] Webhook integrations
- [ ] API for external tools
- [ ] Community themes

---

## Have Ideas?

Open an issue or start a discussion on GitHub. We prioritize based on real user needs.

Built by [The Chimaera Company LLC](https://chimaeraco.dev)
