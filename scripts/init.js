#!/usr/bin/env node
// Synapse Init Script - Bootstrap the entire system from scratch
// Pure Node.js, no external dependencies

const { execSync, spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const http = require('http');
const readline = require('readline');
const convexEnv = require('./convex-env');

// ── ANSI Colors ──────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

const ok = (msg) => console.log(`        ${c.green}✓${c.reset} ${msg}`);
const fail = (msg) => console.log(`        ${c.red}✗${c.reset} ${msg}`);
const warn = (msg) => console.log(`        ${c.yellow}⚠${c.reset} ${msg}`);
const info = (msg) => console.log(`        ${c.cyan}ℹ${c.reset} ${msg}`);
const step = (n, total, msg) => console.log(`\n  ${c.bold}[${n}/${total}]${c.reset} ${msg}`);

// ── CLI Argument Parsing ─────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { port: 3000, dev: false, skipBuild: false, skipInstall: false, mode: null };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--port': opts.port = parseInt(args[++i], 10) || 3000; break;
      case '--dev': opts.dev = true; break;
      case '--skip-build': opts.skipBuild = true; break;
      case '--skip-install': opts.skipInstall = true; break;
      case '--cloud': opts.mode = 'cloud'; break;
      case '--self-hosted':
      case '--selfhosted':
      case '--local':
        opts.mode = 'self-hosted';
        break;
    }
  }
  return opts;
}

// ── Helpers ──────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..');
const COMPOSE = path.join(ROOT, 'docker', 'docker-compose.yml');

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, stdio: opts.silent ? 'pipe' : 'inherit', encoding: 'utf8', ...opts });
}

function runCapture(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' }).trim();
  } catch { return null; }
}

function readEnvFile() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return {};
  const vars = {};
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) vars[m[1].trim()] = m[2].trim();
  });
  return vars;
}

function writeEnvFile(vars) {
  const envPath = path.join(ROOT, '.env.local');
  const content = Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  fs.writeFileSync(envPath, content);
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

async function waitForHealthy(url, timeoutSecs = 60) {
  const start = Date.now();
  while (Date.now() - start < timeoutSecs * 1000) {
    try {
      const res = await httpGet(url);
      if (res.status === 200) return true;
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 2000));
  }
  return false;
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function resolveMode(opts) {
  if (opts.mode === 'cloud') return true;
  if (opts.mode === 'self-hosted') return false;

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    warn('No interactive terminal detected. Defaulting to self-hosted mode (use --cloud to override).');
    return false;
  }

  console.log(`
  ${c.bold}Select deployment mode:${c.reset}
    ${c.cyan}1${c.reset}) Self-hosted Convex (Docker, local data)
    ${c.cyan}2${c.reset}) Convex Cloud (managed backend)
`);
  const answer = String(await ask('  Choose 1 or 2 [default: 1]: ')).trim().toLowerCase();
  return answer === '2' || answer === 'cloud' || answer === 'c';
}

// ── Banner ───────────────────────────────────────────────────
function banner(cloud) {
  const mode = cloud ? 'Cloud' : 'Self-Hosted';
  console.log(`
  ${c.cyan}╔═══════════════════════════════════╗
  ║${c.bold}${c.white}          SYNAPSE v0.1.0           ${c.reset}${c.cyan}║
  ║${c.dim}    Convex-Native AI Gateway       ${c.reset}${c.cyan}║
  ╚═══════════════════════════════════╝${c.reset}
  ${c.dim}Mode: ${mode}${c.reset}

  Initializing...`);
}

// ── Steps ────────────────────────────────────────────────────

function checkDeps(cloud, total) {
  step(1, total, 'Checking dependencies...');

  // Node.js version
  const nodeVer = process.version;
  const major = parseInt(nodeVer.slice(1), 10);
  if (major < 18) {
    fail(`Node.js ${nodeVer} - requires >= 18`);
    console.log(`\n  ${c.red}Please upgrade Node.js: https://nodejs.org${c.reset}\n`);
    process.exit(1);
  }
  ok(`Node.js ${nodeVer}`);

  // npm
  const npmVer = runCapture('npm --version');
  if (!npmVer) { fail('npm not found'); process.exit(1); }
  ok(`npm v${npmVer}`);

  if (!cloud) {
    // Docker
    const dockerVer = runCapture('docker --version');
    if (!dockerVer) {
      fail('Docker not found');
      console.log(`\n  ${c.red}Docker is required for self-hosted Convex.${c.reset}`);
      console.log(`  ${c.dim}Install: https://docs.docker.com/get-docker/${c.reset}`);
      console.log(`  ${c.dim}Or use --cloud flag for Convex cloud instead.${c.reset}\n`);
      process.exit(1);
    }
    ok('Docker installed');

    // Docker daemon running
    const dockerRunning = runCapture('docker info');
    if (!dockerRunning) {
      fail('Docker daemon not running');
      console.log(`\n  ${c.red}Start Docker and try again.${c.reset}\n`);
      process.exit(1);
    }
    ok('Docker running');
  }
}

async function startConvexBackend(total) {
  step(2, total, 'Starting Convex backend...');

  if (!fs.existsSync(COMPOSE)) {
    fail(`docker-compose.yml not found at ${COMPOSE}`);
    process.exit(1);
  }

  // Check if already running
  const running = runCapture(`docker-compose -f ${COMPOSE} ps --status running -q`);
  if (running) {
    ok('Convex containers already running');
  } else {
    info('Pulling Convex images...');
    try {
      run(`docker-compose -f ${COMPOSE} pull`, { silent: true });
      ok('Images pulled');
    } catch {
      warn('Image pull failed - will try with cached images');
    }

    try {
      run(`docker-compose -f ${COMPOSE} up -d`, { silent: true });
      ok('Containers started');
    } catch (e) {
      fail('Failed to start Convex containers');
      console.log(`\n  ${c.red}${e.stderr || e.message}${c.reset}`);
      console.log(`  ${c.dim}Check if ports 3210, 3211, 6791 are available.${c.reset}\n`);
      process.exit(1);
    }
  }

  // Wait for healthy
  info('Waiting for backend to be healthy...');
  const healthy = await waitForHealthy('http://127.0.0.1:3220/version', 60);
  if (!healthy) {
    fail('Convex backend did not become healthy within 60s');
    console.log(`  ${c.dim}Check logs: docker-compose -f ${COMPOSE} logs backend${c.reset}\n`);
    process.exit(1);
  }
  ok('Convex backend running on localhost:3220');
  ok('Convex dashboard on localhost:6792');

  // Generate admin key
  info('Generating admin key...');
  let adminKey;
  try {
    adminKey = runCapture(`docker-compose -f ${COMPOSE} exec -T backend ./generate_admin_key.sh`);
    if (!adminKey) throw new Error('Empty output');
    // The script may output multiple lines; the key is typically the last non-empty line
    const lines = adminKey.split('\n').filter(l => l.trim());
    adminKey = lines[lines.length - 1].trim();
    ok('Admin key generated');
  } catch (e) {
    fail('Failed to generate admin key');
    console.log(`  ${c.dim}${e.message}${c.reset}\n`);
    process.exit(1);
  }

  return adminKey;
}

function installPackages(skip, total, cloud) {
  step(cloud ? 2 : 3, total, 'Installing packages...');
  if (skip) { warn('Skipped (--skip-install)'); return; }

  const nmPath = path.join(ROOT, 'node_modules');
  if (fs.existsSync(nmPath) && fs.existsSync(path.join(nmPath, '.package-lock.json'))) {
    ok('Dependencies already installed');
    return;
  }

  try {
    run('npm install', { silent: true });
    ok('Dependencies installed');
  } catch (e) {
    fail('npm install failed');
    console.log(`\n  ${c.red}${e.message}${c.reset}\n`);
    process.exit(1);
  }
}

function setupConvexSelfHosted(adminKey, total) {
  step(4, total, 'Configuring Convex...');

  const env = readEnvFile();
  env['CONVEX_SELF_HOSTED_URL'] = 'http://127.0.0.1:3220';
  env['CONVEX_SELF_HOSTED_ADMIN_KEY'] = adminKey;
  env['NEXT_PUBLIC_CONVEX_URL'] = 'http://127.0.0.1:3220';
  // Remove cloud deployment var - conflicts with self-hosted
  delete env['CONVEX_DEPLOYMENT'];
  writeEnvFile(env);
  ok('.env.local written');

  // Deploy schema and functions
  try {
    run('npx convex dev --once', { silent: true });
    ok('Schema deployed');
    ok('Functions ready');
  } catch (e) {
    fail('Convex deploy failed');
    console.log(`\n  ${c.red}Check your Convex configuration and try again.${c.reset}`);
    console.log(`  ${c.dim}${e.stderr || e.message}${c.reset}\n`);
    process.exit(1);
  }
}

function setupConvexCloud(total) {
  step(3, total, 'Setting up Convex (cloud)...');

  const env = readEnvFile();
  const hasConvex = !!env['NEXT_PUBLIC_CONVEX_URL'] && !!env['CONVEX_DEPLOYMENT'];

  if (!hasConvex) {
    info('No Convex cloud deployment found - initializing project...');
    try {
      run('npx convex init');
      ok('Convex project initialized');
    } catch (e) {
      fail('Convex init failed - you may need to run: npx convex login');
      console.log(`\n  ${c.yellow}Run "npx convex login" first, then try again.${c.reset}\n`);
      process.exit(1);
    }
  } else {
    ok('Convex project already configured');
  }

  // Remove self-hosted vars when using cloud to avoid endpoint conflicts
  const refreshedEnv = readEnvFile();
  let changed = false;
  if (refreshedEnv['CONVEX_SELF_HOSTED_URL']) {
    delete refreshedEnv['CONVEX_SELF_HOSTED_URL'];
    changed = true;
  }
  if (refreshedEnv['CONVEX_SELF_HOSTED_ADMIN_KEY']) {
    delete refreshedEnv['CONVEX_SELF_HOSTED_ADMIN_KEY'];
    changed = true;
  }
  if (changed) {
    writeEnvFile(refreshedEnv);
    ok('Removed self-hosted Convex variables from .env.local');
  }

  // Deploy schema and functions
  try {
    run('npx convex dev --once', { silent: true });
    ok('Schema deployed');
    ok('Functions ready');
  } catch (e) {
    fail('Convex deploy failed');
    console.log(`\n  ${c.red}${e.stderr || e.message}${c.reset}`);
    console.log(`  ${c.dim}${e.stderr || e.message}${c.reset}\n`);
    process.exit(1);
  }
}

function configureAuth(port, total, cloud) {
  const stepNum = cloud ? 4 : 5;
  step(stepNum, total, 'Configuring authentication...');

  const env = readEnvFile();

  if (!env['AUTH_SECRET']) {
    env['AUTH_SECRET'] = crypto.randomBytes(32).toString('hex');
    ok('AUTH_SECRET generated');
  } else {
    ok('AUTH_SECRET already set');
  }

  if (!env['AUTH_URL']) {
    env['AUTH_URL'] = `http://localhost:${port}`;
    ok(`AUTH_URL set to http://localhost:${port}`);
  } else {
    ok(`AUTH_URL: ${env['AUTH_URL']}`);
  }

  if (!env['NEXTAUTH_SECRET']) {
    env['NEXTAUTH_SECRET'] = env['AUTH_SECRET'];
    ok('NEXTAUTH_SECRET synchronized with AUTH_SECRET');
  }

  if (!env['NEXTAUTH_URL']) {
    env['NEXTAUTH_URL'] = env['AUTH_URL'];
    ok('NEXTAUTH_URL synchronized with AUTH_URL');
  }

  if (!env['ENCRYPTION_SECRET']) {
    env['ENCRYPTION_SECRET'] = env['AUTH_SECRET'];
    ok('ENCRYPTION_SECRET initialized from AUTH_SECRET');
  }

  if (!env['AUTH_TRUST_HOST']) {
    env['AUTH_TRUST_HOST'] = 'true';
    ok('AUTH_TRUST_HOST set to true');
  }

  writeEnvFile(env);
  ok('.env.local written');
}

function syncEnvToConvex(total, cloud) {
  const stepNum = cloud ? 5 : 6;
  step(stepNum, total, 'Syncing environment variables to Convex...');

  const env = readEnvFile();
  if (Object.keys(env).length === 0) {
    warn('No environment variables found in .env.local to sync');
    return;
  }

  try {
    const result = convexEnv.syncEnvFileToConvex({
      vars: env,
      contextEnv: env,
      timeoutMs: 20000,
      silent: true,
    });
    ok(`${result.count} variables synced to Convex env`);
  } catch (e) {
    fail('Failed to sync environment variables to Convex');
    console.log(`  ${c.dim}${e.stderr || e.message}${c.reset}\n`);
    process.exit(1);
  }
}

function buildFrontend(skip, total, cloud) {
  const stepNum = cloud ? 6 : 7;
  step(stepNum, total, 'Building frontend...');
  if (skip) { warn('Skipped (--skip-build)'); return; }

  try {
    run('npm run build', { silent: true });
    ok('Next.js build complete');
  } catch (e) {
    fail('Build failed');
    const output = (e.stdout || '') + (e.stderr || '');
    if (output) {
      console.log(`\n${c.dim}${output.slice(-500)}${c.reset}\n`);
    }
    process.exit(1);
  }
}

function startHub(port, dev, total, cloud) {
  const stepNum = total;
  step(stepNum, total, 'Starting Synapse Hub...');

  const cmd = dev
    ? ['npx', 'next', 'dev', '-H', '0.0.0.0', '-p', String(port)]
    : ['npx', 'next', 'start', '-H', '0.0.0.0', '-p', String(port)];

  const mode = dev ? 'development' : 'production';
  ok(`Starting in ${mode} mode on port ${port}...`);

  const selfHostedInfo = cloud ? '' : `
  Convex dashboard: ${c.cyan}http://localhost:6792${c.reset}`;
  const modeLabel = cloud ? '' : ' (100% self-hosted)';

  console.log(`
  ${c.cyan}════════════════════════════════════════${c.reset}

  ${c.bold}${c.green}Synapse is ready!${c.reset}${modeLabel}

  Open ${c.cyan}http://localhost:${port}${c.reset} to complete setup.${selfHostedInfo}

  ${c.cyan}════════════════════════════════════════${c.reset}
`);

  const child = spawn(cmd[0], cmd.slice(1), {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, PORT: String(port) },
  });

  const cleanup = () => {
    console.log(`\n  ${c.dim}Shutting down Synapse...${c.reset}`);
    child.kill('SIGTERM');
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs();
  const cloud = await resolveMode(opts);
  const total = cloud ? 7 : 8;
  banner(cloud);

  checkDeps(cloud, total);

  if (cloud) {
    // Cloud flow: 7 steps
    installPackages(opts.skipInstall, total, true);
    setupConvexCloud(total);
    configureAuth(opts.port, total, true);
    syncEnvToConvex(total, true);
    buildFrontend(opts.skipBuild, total, true);
    startHub(opts.port, opts.dev, total, true);
  } else {
    // Self-hosted flow: 8 steps
    const adminKey = await startConvexBackend(total);
    installPackages(opts.skipInstall, total, false);
    setupConvexSelfHosted(adminKey, total);
    configureAuth(opts.port, total, false);
    syncEnvToConvex(total, false);
    buildFrontend(opts.skipBuild, total, false);
    startHub(opts.port, opts.dev, total, false);
  }
}

main().catch((e) => {
  console.error(`\n  ${c.red}Fatal error: ${e.message}${c.reset}\n`);
  process.exit(1);
});
