# Channels

Channels are how users interact with Synapse. Each channel connects a communication platform to a gateway's AI agent.

## Key Concepts

- **Each channel is an independent AI session.** A Telegram conversation and a web chat are separate, even for the same user.
- **Platform channels are read-only from the web.** You can view Telegram conversations in the Synapse UI, but you can't reply from there - responses go through Telegram.
- **Multiple channels per gateway.** One gateway can serve web chat, Telegram, and Discord simultaneously.

## Web Chat

**Status: Available**

The built-in web chat is always available. No setup required.

- Accessible at the main Synapse URL
- Supports file attachments and image uploads
- Full conversation history
- Real-time streaming (coming in v0.2)

## Telegram

**Status: Available**

Synapse connects to Telegram using [grammY](https://grammy.dev/) with long polling (no webhook configuration needed).

### Setup

1. Create a bot with [@BotFather](https://t.me/BotFather) on Telegram
2. Copy the bot token
3. In Synapse, go to Gateway Settings and add a Telegram channel
4. Paste your bot token
5. The bot starts listening immediately

### Access Control

Telegram channels support an approval system:
- **Open mode** - Anyone who messages the bot gets access
- **Approval mode** - New users must be approved by a gateway admin before they can chat

### How It Works

- Uses long polling, so no public URL or webhook setup is needed
- Each Telegram user gets their own conversation session
- Messages sync to the Synapse UI in real-time
- Supports text, images, and file attachments

## Discord

**Status: In Progress**

Discord integration is being improved for the v0.2 release.

## WhatsApp

**Status: In Progress**

WhatsApp support is under development.

## Channel Isolation

Channels are intentionally isolated from each other:

- A user's web chat and Telegram conversations are separate sessions
- Each channel maintains its own conversation history
- The AI agent starts fresh in each channel (no cross-channel context bleed)
- This is by design - different channels serve different use cases

## Cross-Channel Features

While conversations are isolated, some features work across channels:

- **Quoting** - Reference messages from other channels
- **A2A messaging** - Agents can communicate across gateways regardless of channel
- **Unified admin view** - See all channel activity in the Synapse dashboard

---

Built by [The Chimaera Company LLC](https://chimaeraco.dev)
