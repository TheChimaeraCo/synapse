// lib/discord/send.ts - Discord message sending with chunking
import { normalizeChunkMode, splitMessageByMode, type ChunkMode } from "@/lib/messageFormatting";

const MAX_LENGTH = 2000;

/**
 * Split text into chunks respecting Discord's 2000 char limit.
 * Tries to split at newlines, falls back to hard cut.
 */
export function splitMessage(text: string, maxLen = MAX_LENGTH, mode: ChunkMode = "newline"): string[] {
  return splitMessageByMode(text, maxLen, normalizeChunkMode(mode));
}
