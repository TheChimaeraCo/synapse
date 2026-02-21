# Synapse Post-Phase Audit Checklist

Run after every build phase completes.

## Build Verification
- [ ] `npx convex dev --once` passes clean (no errors)
- [ ] `npm run build` passes clean (no type errors, no missing imports)
- [ ] pm2 process starts without crash loops (`pm2 show synapse-hub`)

## Architecture Rules
- [ ] No `NEXT_PUBLIC_CONVEX_URL` or direct Convex imports in any `app/` or `components/` file
- [ ] All frontend data fetching via `/api/` routes
- [ ] No `useQuery`/`useMutation` from `convex/react` anywhere
- [ ] New Convex functions use correct visibility (mutation vs internalMutation)

## Regression Check
- [ ] Hub chat still works (send message, get AI response)
- [ ] Settings page loads (all tabs)
- [ ] Setup wizard accessible at /setup
- [ ] Login/auth flow works
- [ ] Dashboard loads

## Code Quality
- [ ] No hardcoded API keys or secrets
- [ ] New files follow existing patterns
- [ ] TypeScript types defined (no untyped `any` in public interfaces)

## Commands
```bash
cd /root/clawd/projects/chimera-gateway/synapse
npx convex dev --once 2>&1 | tail -5
npm run build 2>&1 | tail -10
pm2 show synapse-hub | grep -E "status|restart|uptime"
grep -r "NEXT_PUBLIC_CONVEX_URL\|useQuery\|useMutation" app/ components/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next"
curl -s http://127.0.0.1:3020/api/config/setup-complete
curl -s http://127.0.0.1:3020/api/dashboard | head -c 200
```
