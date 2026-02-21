#!/usr/bin/env node
// Strict deploy pipeline for Synapse:
// codegen -> typecheck -> tests -> build -> convex deploy

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function run(step, command, opts = {}) {
  console.log(`\n[deploy] ${step}`);
  try {
    execSync(command, {
      stdio: "inherit",
      env: { ...process.env, ...(opts.env || {}) },
      cwd: opts.cwd || process.cwd(),
    });
  } catch (err) {
    console.error(`\n[deploy] FAILED at step: ${step}`);
    process.exit(1);
  }
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function hasDeployTarget() {
  return (
    !!process.env.CONVEX_DEPLOY_KEY ||
    !!process.env.CONVEX_DEPLOYMENT ||
    !!process.env.CONVEX_SELF_HOSTED_URL
  );
}

function ensureDeployTarget() {
  if (!hasDeployTarget()) {
    console.error(
      "[deploy] No Convex deployment target found. Set CONVEX_DEPLOY_KEY, CONVEX_DEPLOYMENT, or CONVEX_SELF_HOSTED_URL."
    );
    process.exit(1);
  }
}

function ensureGeneratedFilesPresent() {
  const required = [
    "convex/_generated/api.d.ts",
    "convex/_generated/dataModel.d.ts",
    "convex/_generated/server.d.ts",
  ];
  const missing = required.filter((file) => !fs.existsSync(path.resolve(process.cwd(), file)));
  if (missing.length > 0) {
    console.error(
      `[deploy] Missing generated Convex files: ${missing.join(", ")}. Configure Convex target and run codegen first.`
    );
    process.exit(1);
  }
  console.log("[deploy] Convex generated files present.");
}

function runCodegen(verifyOnly) {
  if (hasDeployTarget()) {
    run("Generate Convex code", "pnpm exec convex codegen --typecheck disable");
    return;
  }
  if (verifyOnly) {
    console.log("\n[deploy] Skipping Convex codegen (no deployment target in environment).");
    ensureGeneratedFilesPresent();
    return;
  }
  ensureDeployTarget();
}

function main() {
  const verifyOnly = hasFlag("--verify-only");
  const skipTests = hasFlag("--skip-tests");
  const dryRun = hasFlag("--dry-run");

  runCodegen(verifyOnly);
  run("Typecheck", "pnpm exec tsc --noEmit");
  if (!skipTests) {
    run("Run tests", "pnpm test");
  }

  // Build without requiring Convex env pull in CI.
  run("Build app", "pnpm exec next build", {
    env: { SKIP_CONVEX_ENV_PULL: "1" },
  });

  if (verifyOnly) {
    console.log("\n[deploy] Verify-only pipeline complete.");
    return;
  }

  ensureDeployTarget();
  run(
    "Deploy Convex functions",
    `pnpm exec convex deploy -y --typecheck enable --codegen disable${dryRun ? " --dry-run" : ""}`
  );

  console.log("\n[deploy] Deployment pipeline complete.");
}

main();
