<p align="center">
  <img src="public/icons/icon-192x192.png" alt="Synapse" width="80" />
</p>

<h1 align="center">Synapse</h1>

<p align="center">
  <strong>Your self-hosted AI command center.</strong><br/>
  Manage AI agents across multiple channels from a single, beautiful dashboard.
</p>

<p align="center">
  <a href="https://github.com/TheChimaeraCo/synapse/stargazers"><img src="https://img.shields.io/github/stars/TheChimaeraCo/synapse?style=flat-square&color=blue" alt="Stars" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-FSL-blue?style=flat-square" alt="License" /></a>
  <img src="https://img.shields.io/badge/version-0.2.0-blue?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/next.js-16-black?style=flat-square" alt="Next.js" />
  <img src="https://img.shields.io/badge/convex-realtime-orange?style=flat-square" alt="Convex" />
</p>

<!-- screenshots -->
<!-- Add screenshots here: dashboard, chat, settings, mobile PWA -->

---

## What is Synapse?

Synapse is a self-hosted platform for running AI agents in production. Connect Telegram bots, Discord bots, WhatsApp, API endpoints, and a built-in web chat to a unified backend with conversation memory, tool execution, analytics, and real-time monitoring.

Built for people who run AI agents and need a single place to manage them all.

## Features

### 🌐 Multi-Gateway Architecture
Run multiple AI gateways, each with their own model configuration, system prompts, tool sets, and knowledge bases. Switch between gateways instantly.

### 📡 Multi-Channel Support
Connect any gateway to multiple channels simultaneously:
- **Web Chat** - Built-in glass-themed chat UI
- **Telegram** - Full bot integration via grammY
- **Discord** - Bot support with slash commands
- **WhatsApp** - Business API integration
- **API** - Programmatic access for custom integrations

### 🤖 Multi-Agent System
Sub-agents with parallel execution, abort control, and per-agent cost tracking. Agents can delegate tasks to other agents across gateways via A2A messaging.

### 🧰 24+ Built-in Tools
Web search, code execution, file management, image generation, and more. Agents can create new tools at runtime through self-modification.

### 🧠 Knowledge & Memory
Semantic vector search over uploaded documents. Agents maintain conversation context across sessions with automatic summarization and decision tracking.

### 📊 Analytics Dashboard
Track token usage, costs, response times, and conversation patterns across all gateways and channels. Export data for deeper analysis.

### 🔔 Webhooks & Scheduled Messages
HMAC-signed webhook delivery for external integrations. Schedule messages and recurring tasks with cron-like precision.

### 📱 PWA with Push Notifications
Install as a native app on desktop and mobile. Receive push notifications for agent events, approvals, and mentions.

### 🎨 Themes & Customization
Dark glassmorphism UI with customizable accent colors. Multiple theme options and a premium Apple-glass aesthetic.

### 🔒 Security & Access Control
Role-based permissions, invite-only registration, rate limiting, circuit breakers, 10-layer prompt injection defense, and audit logging.

### 📋 Admin Console
User management, PM2 process dashboard, gateway configuration, usage monitoring, and system health at a glance.

### 📁 File & Project Management
Upload, organize, and edit files from the browser. Manage code projects with syntax-highlighted editing.

## Quick Start

### With Docker (Recommended)

```bash
docker pull ghcr.io/thechimaeraco/synapse:latest
docker run -d -p 3000:3000 --env-file .env.local synapse
```

### With npm

```bash
# Clone the repository
git clone https://github.com/TheChimaeraCo/synapse.git
cd synapse

# Install dependencies
npm install

# Run the interactive setup (walks you through everything)
npm run init
```

The init script handles Convex setup, environment configuration, and first-user creation.

### Manual Setup

```bash
cp .env.example .env.local
# Edit .env.local with your values

# Push the Convex schema
npx convex deploy

# Build and start
npm run build
npm run synapse
```

## Architecture

```
Synapse
├── Next.js 16 (App Router)     - Frontend + API routes
├── Convex                       - Real-time database + serverless functions
├── pi-ai                        - AI model routing (OpenAI, Anthropic, etc.)
├── grammY                       - Telegram bot framework
└── Auth.js v5                   - Authentication
```

Synapse uses a **gateway / channel / session** model:

```
Gateway (model + tools + system prompt + knowledge)
  ├── Channel (Telegram, Discord, Web, API, WhatsApp)
  │     └── Session (per-user conversation with full history)
  └── Channel ...
```

**Gateways** define how an AI agent behaves. **Channels** are the interfaces users interact through. A single gateway can serve multiple channels simultaneously. Convex handles real-time sync, so changes in the admin console reflect instantly everywhere.

## API Access

Synapse exposes a REST API for programmatic access. Create an API channel in your gateway settings, then use the provided API key:

```bash
curl -X POST https://your-synapse.example.com/api/sessions/SESSION_ID/messages \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello from the API"}'
```

See the API channel settings page for full endpoint documentation.

## Configuration

Core settings live in `.env.local`. See `.env.example` for all available options. Most configuration happens through the web UI:

- **Gateway settings** - Model, temperature, tools, system prompt, knowledge
- **Channel settings** - Platform-specific configuration per channel
- **User management** - Roles, permissions, invites
- **Webhooks** - External integration endpoints with HMAC signing
- **Scheduled messages** - Cron-style recurring tasks

## Documentation

- [Getting Started](./docs/getting-started.md) - Full setup guide
- [Architecture](./docs/architecture.md) - How it works under the hood
- [Configuration](./docs/configuration.md) - All configuration options
- [Tools](./docs/tools.md) - Built-in tools reference
- [Channels](./docs/channels.md) - Channel setup guides
- [Licensing](./docs/licensing.md) - License tiers and details
- [Roadmap](./ROADMAP.md) - What's built and what's planned

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for:
- Development setup
- Project structure overview
- How to add tools, settings tabs, and channel types
- Code style guidelines

## Security

Found a vulnerability? See [SECURITY.md](./SECURITY.md) for our disclosure policy.

## License

Synapse is source-available under the [Functional Source License (FSL)](https://fsl.software/).

- **Personal use** (up to 5 users): Free
- **Commercial use**: Requires a license from The Chimaera Company LLC

See [LICENSE](./LICENSE) for full terms.

---

<p align="center">
  Built by <a href="https://chimaeraco.dev"><strong>The Chimaera Company</strong></a>
</p>
