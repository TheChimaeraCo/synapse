# Changelog

All notable changes to Synapse are documented in this file.

## [0.2.0] - 2026-02-16

### Wave 18 - Agent Capabilities & Intelligence
- System prompt templates (General, Code Helper, Creative Writer, Research Analyst, Customer Support)
- Memory browser in Knowledge page with bulk delete
- Tool result caching with TTL (web_search: 1hr, code_execute: 5min)
- Streaming improvements: tool_start, token_count SSE events

### Wave 19 - Admin & Monitoring
- Admin audit log page with search and action filtering
- Wired audit logging into config and agent settings changes
- Usage quotas display with color-coded progress bars
- System alerts with burst detection (3+ AI failures in 5min)
- systemAlerts and toolCache Convex tables

### Wave 17 - README & Public Repo Polish
- Rewrote README.md with hero section, badges, feature list, quick start
- Updated CONTRIBUTING.md with dev setup, style guide, how-to guides
- Created SECURITY.md with vulnerability reporting and security features
- Bumped package.json to v0.2.0

## [0.1.5] - 2026-02-16

### Wave 16 - Build Verification & Integration Testing
- Full build audit: zero errors, zero warnings
- Route audit: 17 pages, 100+ API routes verified
- Convex schema audit: 49 tables, all consistent
- Component import chain audit: no broken imports from cleanup

## [0.1.4] - 2026-02-16

### Wave 13 - Accessibility & Internationalization Prep
- Added aria-labels to all icon-only buttons
- Added role/aria-modal/aria-labelledby to all modals
- Semantic HTML: sidebar as `<aside>`, messages as `<article>`
- Created i18n string extraction (`lib/strings.ts`, 100+ strings)
- Meta tags, robots.txt, sitemap.xml

### Wave 14 - Testing & Reliability
- Smoke test script (`scripts/smoke-test.sh`) - 7/8 tests passing
- Graceful shutdown handlers for Telegram bot
- Connection retry with exponential backoff (`withRetry()`)
- Backup script with 7-day retention (`scripts/backup.sh`)

### Wave 15 - User Experience Enhancements
- Dark/light theme toggle with system detection
- Command palette (Ctrl+K) with fuzzy matching
- Drag-and-drop file upload with progress indicator
- Message reactions (5 emoji presets with toggle behavior)
- messageReactions Convex table

## [0.1.3] - 2026-02-16

### Wave 10 - Advanced Agent Features
- Conversation branching (fork from any message)
- Message bookmarks/pins with slide-out panel
- Agent persona quick-switch in chat input
- Export conversation as Markdown or JSON

### Wave 11 - Integration & Automation
- Webhook outbound system with HMAC-SHA256 signing
- Analytics dashboard with SVG charts (messages, tokens, sessions, latency)
- Scheduled messages with datetime picker
- webhooks, scheduledMessages Convex tables

### Wave 12 - Code Quality & Consistency Audit
- Removed ~1006 lines of dead code (5 components, 6 lib files)
- Migrated 7 routes to consistent `handleGatewayError()` pattern
- Fixed error message leaking in heartbeat routes

## [0.1.2] - 2026-02-16

### Wave 7 - Chat UX
- file_write tool post-write verification
- Session search overlay (Ctrl+K shortcut)
- Session rename (double-click) and delete with confirmation
- Scroll-to-bottom button with smart auto-scroll

### Wave 8 - Performance & Reliability
- React.memo on MessageBubble, extracted static markdown config
- Request deduplication on chat routes (2s sliding window)
- Error recovery with retry button on failed messages
- Enhanced health check (Convex, PM2, memory, uptime)
- Keyboard shortcuts system with overlay (Ctrl+/, Ctrl+N, Ctrl+,)

### Wave 9 - Documentation & Developer Experience
- JSDoc on core library files
- API documentation page at /docs (16 categories, ~60 endpoints)
- Changelog viewer in settings
- Setup page tooltips

## [0.1.1] - 2026-02-16

### Wave 4 - Hardening & Quality
- Loading states for Projects page
- Empty state for Knowledge page with CTA
- Input validation: maxLength on project/task/knowledge/channel forms
- Rate limiting on API channel (60 req/min per channel)

### Wave 5 - Agent Intelligence & Context
- Soul integration in context builder (identity injection)
- Response style config (verbosity, formality, tone)
- Agent Soul settings tab with presets and prompt preview
- Wired conversation summarization into post-response hook

### Wave 6 - Security Audit
- **CRITICAL:** Removed X-API-Channel-Auth header bypass (skipped all auth)
- Tightened middleware public route allowlist
- Secured config POST during post-setup
- Fixed internal error message leaking (generic 500s)
- Fixed command injection in file actions (execSync -> execFileSync)
- Hardened PM2 route inputs with regex validation

## [0.1.0] - 2026-02-16

### Wave 1 - Initial Fixes
- Fixed synapse-telegram crash loop (4800+ restarts)
- Audited and fixed all bare fetch() calls to use gatewayFetch
- Fixed API channel badge/grouping in sidebar

### Wave 2 - Polish & UX
- Verified Knowledge tab implementation
- Dashboard data verification (all real data, no hardcoded values)
- Mobile responsiveness fixes (dashboard, chat, knowledge, projects)

### Wave 3 - Feature Completeness
- File manager end-to-end audit (all paths scoped via getWorkspacePath)
- Conversation history/search audit
- PM2 dashboard panel audit
- Notification system audit
- Added ErrorBoundary component wrapping entire app
