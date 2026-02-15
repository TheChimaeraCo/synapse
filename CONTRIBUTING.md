# Contributing to Synapse

Thanks for your interest in contributing. Here's what you need to know.

## Development Setup

```bash
git clone https://github.com/chimaera-co/synapse.git
cd synapse
npm install
cp .env.example .env.local
# Fill in .env.local (see comments in the file)
npm run dev
```

You'll need a Convex instance running (self-hosted or cloud). See the [README](./README.md) for details.

## Code Style

- TypeScript throughout. No `any` unless absolutely necessary.
- Use the existing patterns - check similar files before creating new ones.
- Tailwind for styling. No CSS modules or styled-components.
- Convex functions go in `convex/`. React components in `app/` and `components/`.

## Pull Requests

1. Fork the repo and create a feature branch from `main`.
2. Keep PRs focused - one feature or fix per PR.
3. Include a clear description of what changed and why.
4. Make sure `npm run build` passes before submitting.
5. If you're adding a new feature, update relevant documentation.

## Reporting Issues

Open an issue with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Environment details (OS, Node version, browser)

## License

By contributing, you agree that your contributions will be licensed under the same terms as the project (FSL). See [LICENSE](./LICENSE) for details.
