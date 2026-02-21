#!/usr/bin/env node
// Convex env utilities for Synapse.
// Source of truth: Convex deployment env vars.
// Runtime compatibility: mirror pulled vars into .env.local.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_ENV_PATH = path.join(ROOT, '.env.local');
const EXAMPLE_ENV_PATH = path.join(ROOT, '.env.example');
const CONVEX_CLI_PATH = path.join(ROOT, 'node_modules', 'convex', 'bin', 'main.js');

function parseEnvLines(content) {
  const vars = {};
  if (!content) return vars;
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1);
    if (key) vars[key] = value;
  });
  return vars;
}

function readEnvFile(envPath = DEFAULT_ENV_PATH) {
  if (!fs.existsSync(envPath)) return {};
  return parseEnvLines(fs.readFileSync(envPath, 'utf8'));
}

function writeEnvFile(vars, envPath = DEFAULT_ENV_PATH) {
  const keys = Object.keys(vars).sort();
  const content = `${keys.map((k) => `${k}=${String(vars[k])}`).join('\n')}\n`;
  fs.writeFileSync(envPath, content);
}

function mergeEnvFile(partial, envPath = DEFAULT_ENV_PATH) {
  const merged = { ...readEnvFile(envPath), ...partial };
  writeEnvFile(merged, envPath);
  return merged;
}

function collectCandidateKeys(envPath = DEFAULT_ENV_PATH) {
  const keys = new Set();
  const current = readEnvFile(envPath);
  Object.keys(current).forEach((k) => keys.add(k));

  if (fs.existsSync(EXAMPLE_ENV_PATH)) {
    const example = parseEnvLines(fs.readFileSync(EXAMPLE_ENV_PATH, 'utf8'));
    Object.keys(example).forEach((k) => keys.add(k));
  }

  [
    'CONVEX_DEPLOYMENT',
    'CONVEX_SELF_HOSTED_URL',
    'CONVEX_SELF_HOSTED_ADMIN_KEY',
    'NEXT_PUBLIC_CONVEX_URL',
    'AUTH_SECRET',
    'AUTH_URL',
    'NEXTAUTH_SECRET',
    'NEXTAUTH_URL',
    'ENCRYPTION_SECRET',
    'AUTH_TRUST_HOST',
  ].forEach((k) => keys.add(k));

  return Array.from(keys).sort();
}

function buildConvexContext(envPath = DEFAULT_ENV_PATH, extra = {}) {
  const fromFile = readEnvFile(envPath);
  const context = { ...extra };
  const keys = [
    'CONVEX_DEPLOYMENT',
    'CONVEX_SELF_HOSTED_URL',
    'CONVEX_SELF_HOSTED_ADMIN_KEY',
    'NEXT_PUBLIC_CONVEX_URL',
    'CONVEX_URL',
    'CONVEX_SITE_URL',
  ];
  for (const key of keys) {
    if (fromFile[key]) context[key] = fromFile[key];
    if (process.env[key]) context[key] = process.env[key];
  }
  return context;
}

function shellQuote(value) {
  const raw = String(value);
  if (process.platform === 'win32') {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return `'${raw.replace(/'/g, `'\\''`)}'`;
}

function runConvex(args, opts = {}) {
  if (!fs.existsSync(CONVEX_CLI_PATH)) {
    throw new Error(`Convex CLI not found at ${CONVEX_CLI_PATH}. Run npm install first.`);
  }
  const cmd = [process.execPath, CONVEX_CLI_PATH, ...args].map(shellQuote).join(' ');
  return execSync(cmd, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: opts.timeoutMs || 15000,
    env: { ...process.env, ...(opts.env || {}) },
  });
}

function parseListOutput(raw) {
  const vars = {};
  const lines = String(raw || '').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('Usage:')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1);
      if (/^[A-Z0-9_]+$/.test(key)) vars[key] = value;
    }
  }
  return vars;
}

function getVarFromConvex(key, opts = {}) {
  try {
    const out = runConvex(['env', 'get', key], opts);
    const value = String(out || '').trim();
    if (!value) return null;
    return value;
  } catch (err) {
    const stderr = String(err?.stderr || err?.message || '');
    if (
      /No CONVEX_DEPLOYMENT set/i.test(stderr) ||
      /not set/i.test(stderr) ||
      /not found/i.test(stderr) ||
      /does not exist/i.test(stderr)
    ) {
      return null;
    }
    throw err;
  }
}

function pullEnvFromConvex(opts = {}) {
  const silent = !!opts.silent;
  const envPath = opts.envPath || DEFAULT_ENV_PATH;
  const context = buildConvexContext(envPath, opts.contextEnv || {});
  const timeoutMs = opts.timeoutMs || 15000;

  let pulled = {};
  let listError = '';
  try {
    const listOutput = runConvex(['env', 'list'], { timeoutMs, env: context });
    pulled = parseListOutput(listOutput);
  } catch (err) {
    listError = String(err?.stderr || err?.message || '');
    if (!silent) {
      console.log(`[convex-env] env list unavailable, falling back to key-by-key get: ${listError.split('\n')[0]}`);
    }
  }

  const fatalNoContext =
    /No CONVEX_DEPLOYMENT set/i.test(listError) &&
    !context.CONVEX_DEPLOYMENT &&
    !context.CONVEX_SELF_HOSTED_URL;
  if (fatalNoContext) return pulled;

  if (Object.keys(pulled).length === 0) {
    const keys = opts.keys || collectCandidateKeys(envPath);
    for (const key of keys) {
      const value = getVarFromConvex(key, { timeoutMs: Math.min(timeoutMs, 8000), env: context });
      if (value !== null) pulled[key] = value;
    }
  }

  return pulled;
}

function loadProcessEnvFromConvex(opts = {}) {
  const overwrite = !!opts.overwrite;
  const writeFile = opts.writeFile !== false;
  const envPath = opts.envPath || DEFAULT_ENV_PATH;
  const silent = !!opts.silent;

  const pulled = pullEnvFromConvex(opts);
  for (const [key, value] of Object.entries(pulled)) {
    if (overwrite || !process.env[key]) {
      process.env[key] = String(value);
    }
  }
  if (writeFile && Object.keys(pulled).length > 0) {
    mergeEnvFile(pulled, envPath);
  }
  if (!silent) {
    console.log(`[convex-env] loaded ${Object.keys(pulled).length} variables from Convex`);
  }
  return pulled;
}

function syncEnvFileToConvex(opts = {}) {
  const envPath = opts.envPath || DEFAULT_ENV_PATH;
  const silent = !!opts.silent;
  const timeoutMs = opts.timeoutMs || 15000;
  const sourceVars = opts.vars || readEnvFile(envPath);
  const entries = Object.entries(sourceVars)
    .map(([key, value]) => [key, String(value || '')])
    .filter(([, value]) => value.trim().length > 0);

  const context = buildConvexContext(envPath, opts.contextEnv || sourceVars);
  for (const [key, value] of entries) {
    runConvex(['env', 'set', key, value], { timeoutMs, env: context });
    if (!silent) {
      console.log(`[convex-env] synced ${key}`);
    }
  }
  return { count: entries.length };
}

function parseCliArgs(argv) {
  const args = [...argv];
  const out = { command: 'pull', silent: false, writeFile: true, overwrite: false, timeoutMs: 15000 };
  if (args[0] && !args[0].startsWith('-')) {
    out.command = args.shift();
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--silent') out.silent = true;
    if (a === '--no-write') out.writeFile = false;
    if (a === '--overwrite') out.overwrite = true;
    if (a === '--timeout-ms') out.timeoutMs = parseInt(args[++i], 10) || 15000;
    if (a === '--env-file') out.envPath = path.resolve(ROOT, args[++i]);
  }
  return out;
}

function main() {
  const opts = parseCliArgs(process.argv.slice(2));
  if (opts.command === 'push') {
    const result = syncEnvFileToConvex(opts);
    if (!opts.silent) console.log(`[convex-env] pushed ${result.count} variables to Convex`);
    return;
  }
  if (opts.command === 'pull') {
    const pulled = loadProcessEnvFromConvex(opts);
    if (!opts.silent) console.log(`[convex-env] pull complete (${Object.keys(pulled).length} vars)`);
    return;
  }
  console.error(`Unknown command "${opts.command}". Use "pull" or "push".`);
  process.exit(1);
}

module.exports = {
  readEnvFile,
  writeEnvFile,
  mergeEnvFile,
  pullEnvFromConvex,
  loadProcessEnvFromConvex,
  syncEnvFileToConvex,
};

if (require.main === module) {
  try {
    main();
  } catch (err) {
    const stderr = String(err?.stderr || err?.message || err);
    console.error(`[convex-env] ${stderr}`);
    process.exit(1);
  }
}
