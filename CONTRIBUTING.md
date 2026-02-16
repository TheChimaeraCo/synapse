# Contributing to Synapse

Thanks for your interest in contributing! Here's everything you need to get started.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/TheChimaeraCo/synapse.git
cd synapse
npm install

# Copy environment template
cp .env.example .env.local
# Fill in required values (see comments in the file)

# Set up Convex (self-hosted or cloud)
npx convex dev --once

# Start the dev server
npm run dev
```

You'll need a Convex instance running. For self-hosted Convex, set `CONVEX_SELF_HOSTED_URL` and `CONVEX_SELF_HOSTED_ADMIN_KEY` in your environment.

## Project Structure

```
synapse/
├── app/                    # Next.js App Router pages
│   ├── api/                # REST API routes
│   ├── chat/               # Chat UI
│   ├── analytics/          # Analytics dashboard
│   ├── console/            # PM2 admin console
│   ├── knowledge/          # Knowledge base management
│   ├── settings/           # Settings page
│   └── ...
├── components/
│   ├── auth/               # Login/registration components
│   ├── chat/               # Chat UI components (sidebar, messages, input)
│   ├── dashboard/          # Dashboard widgets
│   ├── knowledge/          # Knowledge base UI
│   ├── layout/             # App shell, navigation
│   ├── settings/           # Settings tab components (~27 tabs)
│   └── ui/                 # Shared UI primitives (shadcn/ui)
├── convex/
│   ├── schema.ts           # Database schema
│   ├── functions/          # Convex queries and mutations (~42 modules)
│   ├── actions/            # Convex actions (AI, Telegram, embeddings, etc.)
│   ├── lib/                # Shared Convex utilities
│   └── http.ts             # HTTP endpoint handlers
├── lib/                    # Client-side utilities
├── public/                 # Static assets, PWA manifest
└── scripts/                # Init, dev, and deployment scripts
```

## Code Style

- **TypeScript** throughout. Avoid `any` unless absolutely necessary.
- **Tailwind CSS** for all styling. No CSS modules or styled-components.
- **Glass design system** - Dark glassmorphism aesthetic:
  - Glass panels: `bg-white/[0.04]`, elevated: `bg-white/[0.07]`
  - Borders: `border-white/10`
  - Blur: `backdrop-blur-xl` or `backdrop-blur-2xl`
  - Rounded corners: `rounded-xl` (inputs), `rounded-2xl` (panels)
  - Accent gradient: `from-blue-500 to-blue-600` (buttons)
  - Do NOT use hardcoded hex colors like `#0a0a0f`
- **`gatewayFetch`** - Always use `gatewayFetch()` from `@/lib/gatewayFetch` instead of bare `fetch()` for API calls. It automatically adds the `X-Gateway-Id` header.
- **Convex patterns** - Queries in `convex/functions/`, actions in `convex/actions/`. Follow existing module patterns.

## How to Add a New Tool

1. Define the tool in the gateway's tool configuration (via the Settings UI or directly in `convex/functions/`)
2. Add the tool handler in `convex/actions/ai.ts` or the appropriate action module
3. Tools receive a context object with the current session, gateway config, and message history
4. Return results as structured data - the framework handles formatting for the model

## How to Add a New Settings Tab

1. Create a new component in `components/settings/` (e.g., `MyFeatureTab.tsx`)
2. Follow the glass panel pattern from existing tabs:
   ```tsx
   <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-6">
     {/* Tab content */}
   </div>
   ```
3. Register the tab in the settings page's tab list (`app/settings/page.tsx` or the settings layout component)
4. Use `gatewayFetch` for any API calls

## How to Add a New Channel Type

1. Add the channel type to `ChannelPlatform` in `lib/types.ts`
2. Create the channel handler (see `convex/actions/telegram.ts` as an example)
3. Add channel configuration UI in `components/settings/`
4. Update `components/chat/ChannelSidebar.tsx` to group the new channel type appropriately
5. Add an HTTP endpoint in `convex/http.ts` if the channel needs incoming webhooks

## Pull Requests

1. Fork the repo and create a feature branch from `main`
2. Keep PRs focused - one feature or fix per PR
3. Include a clear description of what changed and why
4. Make sure `npm run build` passes before submitting
5. Update relevant documentation if adding new features

## Reporting Issues

Open an issue with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Environment details (OS, Node version, browser)

## License

By contributing, you agree that your contributions will be licensed under the same terms as the project (FSL). See [LICENSE](./LICENSE) for details.
