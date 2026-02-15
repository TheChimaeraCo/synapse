# Getting Started with Synapse

This guide walks you through setting up Synapse from scratch.

## Prerequisites

- **Node.js 20+** - [Download](https://nodejs.org/)
- **A Convex account** - [Sign up](https://convex.dev) (free tier available) or run self-hosted
- **A domain** (for production) - Synapse needs HTTPS for Auth.js and push notifications
- Optional: Telegram bot token (from [@BotFather](https://t.me/BotFather))

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/TheChimaeraCo/synapse.git
cd synapse
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Quick Setup (Recommended)

Run the interactive setup wizard:

```bash
npm run init
```

This walks you through Convex configuration, environment variables, and initial deployment. Skip to [First Run](#first-run) after completing it.

### 4. Manual Setup

If you prefer to configure things yourself:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your values:

#### Convex (Backend)

```env
# For Convex Cloud:
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud

# For self-hosted Convex:
CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3220
CONVEX_SITE_URL=http://127.0.0.1:3221
NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3220
CONVEX_SELF_HOSTED_ADMIN_KEY=your-admin-key
```

#### Authentication

```env
# Generate secrets with: openssl rand -hex 32
AUTH_SECRET=your-generated-secret
NEXTAUTH_SECRET=your-generated-secret

# Your public URL
AUTH_URL=https://your-synapse-domain.example.com
NEXTAUTH_URL=https://your-synapse-domain.example.com
AUTH_TRUST_HOST=true
```

#### Optional Services

```env
# Brave Search API (for web search tool)
BRAVE_SEARCH_API_KEY=your-key

# Push notifications (generate with: npx web-push generate-vapid-keys)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your-public-key
VAPID_PRIVATE_KEY=your-private-key
```

#### Deploy the Schema

```bash
# Convex Cloud
npx convex deploy

# Self-hosted
npx convex deploy --url http://127.0.0.1:3220 --admin-key your-key
```

#### Start the Dev Server

```bash
npm run dev
```

## First Run

When you open Synapse for the first time, the setup wizard guides you through four steps:

### Step 1: Create Your Account
Register your user account. **The first user automatically becomes the global admin.**

### Step 2: Create a Gateway
Set up your first AI gateway. Give it a name and optional description. **The first gateway becomes the master gateway** and holds the default configuration that other gateways inherit from.

### Step 3: Configure an AI Provider
Add your AI provider credentials (OpenAI, Anthropic, etc.). Choose your default model and set parameters like temperature.

### Step 4: Connect a Channel (Optional)
Connect a Telegram bot or other channel. You can skip this and use the built-in web chat.

That's it. You're ready to start chatting with your AI agent.

## Running in Production

```bash
# Build the Next.js app
npm run build

# Start with PM2 (recommended)
npm run synapse
```

This starts Synapse as a managed PM2 process with automatic restarts and log management.

## Next Steps

- [Architecture](./architecture.md) - Understand how Synapse works
- [Configuration](./configuration.md) - All configuration options
- [Channels](./channels.md) - Connect Telegram, Discord, and more
- [Tools](./tools.md) - Builtin tools and how to create your own
- [Licensing](./licensing.md) - License tiers and pricing

---

Built by [The Chimaera Company LLC](https://chimaeraco.dev)
