// instrumentation.ts - Next.js 14+ instrumentation hook
// Starts the Telegram bot when the Next.js server starts

export async function register() {
  // Only run on the server side, not during build
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Validate environment variables
    const { validateEnv } = await import("./lib/env");
    validateEnv();
    try {
      const { initLicenseValidation } = await import("./lib/license");
      initLicenseValidation();
    } catch (err) {
      console.error("[instrumentation] Failed to start license validation:", err);
    }
    // Delay slightly to let Convex backend fully initialize
    setTimeout(async () => {
      try {
        const { startTelegramBot } = await import("./lib/telegram/startup");
        await startTelegramBot();
        console.log("[instrumentation] Telegram bot started via Next.js instrumentation");
      } catch (err) {
        console.error("[instrumentation] Failed to start Telegram bot:", err);
        // Don't crash Next.js - the bot can be started manually later
      }
    }, 5000);

    // Graceful shutdown handlers for PM2 restart cycles
    const shutdown = async (signal: string) => {
      console.log(`[instrumentation] Received ${signal}, shutting down gracefully...`);
      try {
        const { stopTelegramBot } = await import("./lib/telegram/startup");
        await stopTelegramBot();
        console.log("[instrumentation] Telegram bot stopped");
      } catch (err) {
        console.error("[instrumentation] Error stopping Telegram bot:", err);
      }
      try {
        const { stopLicenseValidation } = await import("./lib/license");
        stopLicenseValidation();
      } catch (err) {
        console.error("[instrumentation] Error stopping license validation:", err);
      }
      console.log("[instrumentation] Shutdown complete");
      process.exit(0);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  }
}
