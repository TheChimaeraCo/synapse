#!/usr/bin/env node
// Synapse Dev Script - Run Convex + Next.js dev in one command

const { execSync, spawn } = require('child_process');
const path = require('path');
const http = require('http');
const convexEnv = require('./convex-env');

const ROOT = path.resolve(__dirname, '..');
const COMPOSE = path.join(ROOT, 'docker', 'docker-compose.yml');
const c = { reset: '\x1b[0m', bold: '\x1b[1m', cyan: '\x1b[36m', dim: '\x1b[2m', yellow: '\x1b[33m', green: '\x1b[32m', red: '\x1b[31m' };

// Parse args
let port = 3000;
let cloud = false;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port') port = parseInt(args[++i], 10) || 3000;
  if (args[i] === '--cloud') cloud = true;
}

function runCapture(cmd) {
  try { return execSync(cmd, { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' }).trim(); }
  catch { return null; }
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.setTimeout(3000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function ensureConvexBackend() {
  if (cloud) return;

  // Check if backend is already responding
  try {
    const res = await httpGet('http://127.0.0.1:3220/version');
    if (res.status === 200) {
      console.log(`  ${c.green}✓${c.reset} Convex backend already running`);
      return;
    }
  } catch { /* not running */ }

  // Start it
  console.log(`  ${c.yellow}Starting Convex backend...${c.reset}`);
  try {
    execSync(`docker-compose -f ${COMPOSE} up -d`, { cwd: ROOT, stdio: 'pipe' });
  } catch (e) {
    console.error(`  ${c.red}Failed to start Convex backend${c.reset}`);
    console.error(`  ${c.dim}Run: docker-compose -f docker/docker-compose.yml up -d${c.reset}`);
    process.exit(1);
  }

  // Wait for healthy
  const start = Date.now();
  while (Date.now() - start < 60000) {
    try {
      const res = await httpGet('http://127.0.0.1:3220/version');
      if (res.status === 200) {
        console.log(`  ${c.green}✓${c.reset} Convex backend started`);
        return;
      }
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 2000));
  }
  console.error(`  ${c.red}Convex backend did not become healthy in 60s${c.reset}`);
  process.exit(1);
}

async function main() {
  console.log(`
  ${c.cyan}${c.bold}Synapse Dev Mode${c.reset}
  ${c.dim}Convex + Next.js on port ${port}${c.reset}
`);

  try {
    const pulled = convexEnv.loadProcessEnvFromConvex({ silent: true, writeFile: true });
    const count = Object.keys(pulled).length;
    if (count > 0) {
      console.log(`  ${c.green}✓${c.reset} Loaded ${count} env vars from Convex`);
    } else {
      console.log(`  ${c.dim}No Convex env vars pulled (using existing process/.env.local values)${c.reset}`);
    }
  } catch (e) {
    console.log(`  ${c.dim}Convex env pull skipped: ${(e && e.message) || e}${c.reset}`);
  }

  await ensureConvexBackend();

  // Start Convex dev (background)
  const convex = spawn('npx', ['convex', 'dev'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  convex.stdout.on('data', (d) => {
    process.stdout.write(`${c.yellow}[convex]${c.reset} ${d}`);
  });
  convex.stderr.on('data', (d) => {
    process.stderr.write(`${c.yellow}[convex]${c.reset} ${d}`);
  });

  // Start Next.js dev (foreground)
  const next = spawn('npx', ['next', 'dev', '-H', '0.0.0.0', '-p', String(port)], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, PORT: String(port) },
  });

  const cleanup = () => {
    convex.kill('SIGTERM');
    next.kill('SIGTERM');
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  next.on('exit', (code) => {
    convex.kill('SIGTERM');
    process.exit(code || 0);
  });

  convex.on('exit', () => {
    console.log(`\n  ${c.yellow}Convex process exited${c.reset}`);
  });
}

main();
