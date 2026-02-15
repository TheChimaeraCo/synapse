# Synapse

**Your AI command center.**

Synapse is a self-hosted platform for managing AI agents across multiple channels. Connect Telegram bots, Discord bots, and web interfaces to a unified backend with conversation memory, tool execution, and real-time monitoring.

Built for people who run AI agents in production and need a single place to manage them.

## Features

- **Multi-gateway architecture** - Run multiple AI gateways, each with their own model configuration, system prompts, and tool sets
- **Multi-channel support** - Connect Telegram, Discord, and a built-in web chat to any gateway
- **Conversation chains** - Agents maintain context across sessions with persistent conversation history
- **Sub-agents** - Spawn task-specific agents from a parent agent session
- **Tool execution** - Extensible tool system with sandboxed execution
- **Semantic memory** - Vector-based knowledge storage for long-term agent recall
- **A2A messaging** - Agent-to-agent communication protocol for multi-agent coordination
- **File manager** - Upload, organize, and attach files to agent contexts
- **PM2 integration** - Manage agent processes directly from the dashboard
- **PWA** - Install as a native app on desktop and mobile with push notifications
- **Admin console** - User management, invite system, gateway configuration, and usage monitoring

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Backend:** Convex (real-time database + serverless functions)
- **Auth:** Auth.js v5
- **Telegram:** grammY
- **UI:** Tailwind CSS, Radix UI, shadcn/ui
- **Process management:** PM2

## Quick Start

### Prerequisites

- Node.js 20+
- A Convex account or self-hosted Convex instance
- (Optional) Telegram bot token, Discord bot token

### Setup

```bash
# Clone the repository
git clone https://github.com/chimaera-co/synapse.git
cd synapse

# Install dependencies
npm install

# Run the interactive setup
npm run init
```

The init script walks you through Convex setup, environment configuration, and first-user creation.

### Manual Setup

```bash
# Copy environment template
cp .env.example .env.local

# Edit .env.local with your values (see comments in the file)

# Push the Convex schema
npx convex deploy

# Start the dev server
npm run dev
```

### Running in Production

```bash
# Build and start with PM2
npm run build
npm run synapse
```

## Architecture

Synapse uses a **gateway/channel/agent** model:

```
Gateway (model config + tools + system prompt)
  |
  +-- Channel (Telegram bot, Discord bot, or web chat)
  |     |
  |     +-- Session (per-user conversation)
  |           |
  |           +-- Messages (with tool calls, attachments, etc.)
  |
  +-- Channel ...
```

**Gateways** define how an AI agent behaves - which model it uses, what tools are available, and what system prompt it follows.

**Channels** are the interfaces users interact through. A single gateway can serve multiple channels simultaneously.

**Sessions** track per-user conversations with full history, enabling context-aware responses across interactions.

Convex handles real-time data sync, so changes in the admin console reflect instantly across all connected channels.

## License

Synapse is source-available under the [Functional Source License (FSL)](https://fsl.software/).

- **Personal use** (up to 5 users): Free
- **Commercial use**: Requires a license from The Chimaera Company LLC

See [LICENSE](./LICENSE) for full terms.

## Links

- **The Chimaera Company LLC** - [chimaeraco.dev](https://chimaeraco.dev)
