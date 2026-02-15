#!/usr/bin/env node
// Synapse Stop Script - Gracefully shut down all services

const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const COMPOSE = path.join(ROOT, 'docker', 'docker-compose.yml');
const c = { reset: '\x1b[0m', bold: '\x1b[1m', green: '\x1b[32m', cyan: '\x1b[36m', dim: '\x1b[2m', yellow: '\x1b[33m' };

console.log(`\n  ${c.cyan}${c.bold}Stopping Synapse...${c.reset}\n`);

// Kill Next.js (find by port or process name)
try {
  const pids = execSync("pgrep -f 'next (start|dev)' || true", { encoding: 'utf8' }).trim();
  if (pids) {
    execSync(`kill ${pids.split('\n').join(' ')}`, { stdio: 'pipe' });
    console.log(`  ${c.green}✓${c.reset} Next.js stopped`);
  } else {
    console.log(`  ${c.dim}  Next.js not running${c.reset}`);
  }
} catch { /* ignore */ }

// Stop Docker containers
try {
  execSync(`docker-compose -f ${COMPOSE} down`, { cwd: ROOT, stdio: 'pipe' });
  console.log(`  ${c.green}✓${c.reset} Convex backend stopped`);
  console.log(`  ${c.green}✓${c.reset} Convex dashboard stopped`);
} catch {
  console.log(`  ${c.dim}  Docker containers not running${c.reset}`);
}

console.log(`\n  ${c.green}${c.bold}Synapse stopped.${c.reset}\n`);
