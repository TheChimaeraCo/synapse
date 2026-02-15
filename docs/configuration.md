# Configuration

All the configuration options available in Synapse.

## Environment Variables

These are set in `.env.local` (never committed to version control).

### Convex (Required)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_CONVEX_URL` | Your Convex deployment URL |
| `CONVEX_SELF_HOSTED_URL` | Self-hosted Convex backend URL |
| `CONVEX_SITE_URL` | Self-hosted Convex site URL |
| `CONVEX_SELF_HOSTED_ADMIN_KEY` | Admin key for self-hosted Convex |

### Authentication (Required)

| Variable | Description |
|----------|-------------|
| `AUTH_SECRET` | Secret for Auth.js session encryption. Generate with `openssl rand -hex 32` |
| `NEXTAUTH_SECRET` | Same as AUTH_SECRET (legacy compatibility) |
| `AUTH_URL` | Public URL where Synapse is hosted |
| `NEXTAUTH_URL` | Same as AUTH_URL (legacy compatibility) |
| `AUTH_TRUST_HOST` | Set to `true` when behind a reverse proxy |

### Search (Optional)

| Variable | Description |
|----------|-------------|
| `BRAVE_SEARCH_API_KEY` | API key for web search tool. Get one at [brave.com/search/api](https://brave.com/search/api/) |

### Push Notifications (Optional)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID public key for web push |
| `VAPID_PRIVATE_KEY` | VAPID private key for web push |

Generate VAPID keys with:

```bash
npx web-push generate-vapid-keys
```

## Gateway Settings

Configured through the Synapse UI under Gateway Settings.

### General

- **Name** - Display name for the gateway
- **Description** - Optional description shown in the gateway list
- **Workspace Path** - Root directory for file operations (file manager, shell commands)

### AI Provider

- **Provider** - Which AI service to use (OpenAI, Anthropic, Google, etc.)
- **API Key** - Your provider API key
- **Model** - Default model for conversations
- **Temperature** - Creativity level (0.0 = deterministic, 1.0 = creative)
- **Max Tokens** - Maximum response length

### Model Routing

Synapse can automatically select different models based on the task:
- Simple questions get faster, cheaper models
- Complex reasoning gets more capable models
- Configure routing rules per gateway

### Agent Soul

- **Personality** - Define how the AI communicates
- **System Prompt** - Base instructions for the agent
- **User Profiles** - Per-user context the agent remembers

## Channel Configuration

### Telegram

- **Bot Token** - Get from [@BotFather](https://t.me/BotFather) on Telegram
- **Access Mode** - Open (anyone can use) or approval-required
- Uses grammY with long polling (no webhook setup needed)

### Discord

- **Bot Token** - From the Discord Developer Portal
- **Application ID** - Your Discord application ID
- Status: In progress

### WhatsApp

- Status: In progress

## License Key

Enter your license key in the admin panel under Settings. See [Licensing](./licensing.md) for details on tiers and what's included.

## PM2 Integration

Synapse integrates with PM2 for process management:

- **Dashboard Panel** - View process status, CPU, and memory usage
- **Popout Console** - Interactive terminal for the Synapse process
- **Log Viewer** - Stream logs in real-time
- **Settings** - Configure PM2 behavior

Start Synapse with PM2:

```bash
npm run synapse
```

## File Manager

The file manager serves files from the gateway's configured workspace path. Set this to the directory where you want the AI agent to have read/write access.

The file manager provides:
- File browsing and navigation
- In-browser file editing
- File upload and download
- Directory creation

Access it at `/files` in the Synapse UI.

---

Built by [The Chimaera Company LLC](https://chimaeraco.dev)
