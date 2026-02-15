// lib/telegram/index.ts - Public API
export { createBot, type BotConfig } from "./bot";
export { startRunner, stopRunner, getRunnerStatus } from "./runner";
export { startTelegramBot, stopTelegramBot, getTelegramBotStatus } from "./startup";
export {
  sendMessage,
  sendPhoto,
  sendDocument,
  sendTypingAction,
  editMessage,
  downloadFile,
  splitMessage,
} from "./send";
export { getTelegramToken, getConfig, getClient } from "./config";
