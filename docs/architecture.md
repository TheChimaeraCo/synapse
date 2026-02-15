# Architecture

How Synapse works under the hood.

## Overview

```
┌─────────────────────────────────────────────────┐
│                    Synapse                        │
│                                                   │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐          │
│  │ Web Chat │  │Telegram │  │ Discord │  ...      │
│  └────┬─────┘  └────┬────┘  └────┬────┘          │
│       │              │            │                │
│       └──────────────┼────────────┘                │
│                      │                             │
│              ┌───────▼───────┐                     │
│              │    Gateway    │                      │
│              │  (AI Config)  │                      │
│              └───────┬───────┘                     │
│                      │                             │
│              ┌───────▼───────┐                     │
│              │  Agent System │                      │
│              │  ┌─────────┐  │                     │
│              │  │Main Agent│  │                     │
│              │  └────┬────┘  │                     │
│              │       │       │                     │
│              │  ┌────▼────┐  │                     │
│              │  │Sub-Agent│  │                     │
│              │  │Sub-Agent│  │                     │
│              │  └─────────┘  │                     │
│              └───────┬───────┘                     │
│                      │                             │
│              ┌───────▼───────┐                     │
│              │    Convex     │                      │
│              │  (Database)   │                      │
│              └───────────────┘                     │
└─────────────────────────────────────────────────┘
```

## Gateway Model

Gateways are the core organizational unit. Each gateway defines:

- **AI model** and provider (OpenAI, Anthropic, etc.)
- **System prompt** and agent soul (personality)
- **Available tools** and permissions
- **Workspace path** for file operations
- **Channel connections**

### Master Gateway

The first gateway created becomes the **master gateway**. It holds the default configuration that other gateways can inherit from. Each gateway operates in isolation - different models, different tools, different personalities.

### Gateway Membership

Users join gateways through an invite system. Each gateway has its own member list with roles:
- **Owner** - Full control, can delete the gateway
- **Admin** - Can manage settings and members
- **Member** - Can chat and use tools

## Channel System

Channels are the interfaces through which users interact with a gateway's AI agent.

### Key Concepts

- Each channel creates an **independent AI session**
- A Telegram conversation and a web chat conversation are separate, even for the same user on the same gateway
- Platform channels (Telegram, Discord) are **read-only from the web interface** - you can view the conversation but responses go through the platform
- Web chat is always available as the default channel

### Supported Channels

| Channel | Protocol | Status |
|---------|----------|--------|
| Web Chat | Built-in | Available |
| Telegram | grammY (long polling) | Available |
| Discord | Discord.js | In progress |
| WhatsApp | Baileys | In progress |

## Agent System

### Main Agent

Every conversation has a main agent that:
1. Receives the user's message
2. Builds context (conversation history, memory, system prompt)
3. Calls the AI model
4. Executes any tool calls
5. Returns the response

### Tool Execution Loop

The agent runs tools in a loop with a configurable maximum (default: 5 rounds). Each round:

1. AI model returns a response (possibly with tool calls)
2. Each tool call is executed
3. Results are fed back to the model
4. Model decides whether to make more tool calls or respond

This allows the agent to chain operations - search the web, read the results, summarize, and respond - all in a single turn.

### Sub-Agents (Workers)

The main agent can spawn sub-agents for parallel work:

- Sub-agents run independently with their own context
- Multiple sub-agents can run simultaneously
- The parent agent can abort sub-agents
- Cost tracking is maintained per-agent
- Results flow back to the parent when complete

### Agent Souls

Each gateway can define an agent "soul" - a personality configuration that shapes how the AI responds. This goes beyond a system prompt to include:
- Communication style preferences
- Knowledge domain emphasis
- Response format defaults
- Behavioral guidelines

## Conversation Chains

Conversations are organized as chains of messages with metadata:

- **Messages** are immutable once created
- **Decisions** capture key points and context summaries
- When context gets long, the system creates summaries
- The **latest decisions win** when rebuilding context
- Smart context building targets 3-5k tokens per turn to balance cost and quality

## Memory System

Synapse includes a semantic memory system:

- **Embeddings** are generated for important information
- **Semantic search** finds relevant memories based on meaning, not just keywords
- Memory is per-gateway, so different gateways maintain separate knowledge
- The knowledge management system organizes information into retrievable chunks

## Authentication Flow

1. User visits Synapse and authenticates via Auth.js
2. Auth.js supports multiple providers (credentials, OAuth, etc.)
3. After authentication, the user's gateway memberships determine what they can access
4. Each API call validates both authentication and gateway-level authorization
5. The first registered user becomes the global admin automatically

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router) |
| Backend | Convex (real-time database + serverless) |
| Auth | Auth.js v5 |
| Telegram | grammY |
| UI | Tailwind CSS, Radix UI, shadcn/ui |
| Process Mgmt | PM2 |

---

Built by [The Chimaera Company LLC](https://chimaeraco.dev)
