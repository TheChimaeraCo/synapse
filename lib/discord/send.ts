// lib/discord/send.ts - Discord message sending with chunking

const MAX_LENGTH = 2000;

/**
 * Split text into chunks respecting Discord's 2000 char limit.
 * Tries to split at newlines, falls back to hard cut.
 */
export function splitMessage(text: string, maxLen = MAX_LENGTH): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    // Try to split at a newline
    let splitIdx = remaining.lastIndexOf("\n", maxLen);
    if (splitIdx < maxLen / 2) splitIdx = maxLen;
    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx);
  }
  return chunks;
}
