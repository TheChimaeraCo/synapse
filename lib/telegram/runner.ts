// lib/telegram/runner.ts - Long polling runner using @grammyjs/runner
import { run, type RunnerHandle } from "@grammyjs/runner";
import type { Bot } from "grammy";

let runnerHandle: RunnerHandle | null = null;
let lastUpdateTime: number | null = null;
let startTime: number | null = null;

const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Start the long polling runner for the bot.
 * grammY's run() automatically deletes any existing webhook.
 */
export function startRunner(bot: Bot): RunnerHandle {
  if (runnerHandle) {
    console.warn("[telegram] Runner already started, stopping previous instance");
    runnerHandle.stop();
  }

  startTime = Date.now();
  lastUpdateTime = Date.now();

  runnerHandle = run(bot, {
    runner: {
      fetch: {
        allowed_updates: [
          "message",
          "callback_query",
          "message_reaction",
          "edited_message",
        ],
      },
    },
  });

  // Health monitoring
  const healthInterval = setInterval(() => {
    if (!runnerHandle?.isRunning()) {
      console.warn("[telegram] Runner is not running!");
      clearInterval(healthInterval);
      return;
    }
    const elapsed = Date.now() - (lastUpdateTime || Date.now());
    if (elapsed > HEALTH_CHECK_INTERVAL_MS) {
      console.warn(`[telegram] No updates received in ${Math.round(elapsed / 60000)} minutes`);
    }
  }, HEALTH_CHECK_INTERVAL_MS);

  // Track updates
  bot.use(async (_ctx, next) => {
    lastUpdateTime = Date.now();
    await next();
  });

  console.log("[telegram] Long polling runner started");
  return runnerHandle;
}

/**
 * Stop the runner gracefully.
 */
export async function stopRunner(): Promise<void> {
  if (!runnerHandle) return;
  console.log("[telegram] Stopping runner...");
  runnerHandle.stop();
  runnerHandle = null;
  startTime = null;
  lastUpdateTime = null;
  console.log("[telegram] Runner stopped");
}

/**
 * Get runner status for health checks.
 */
export function getRunnerStatus(): {
  running: boolean;
  uptime: number | null;
  lastUpdateAt: number | null;
} {
  return {
    running: runnerHandle?.isRunning() ?? false,
    uptime: startTime ? Date.now() - startTime : null,
    lastUpdateAt: lastUpdateTime,
  };
}
