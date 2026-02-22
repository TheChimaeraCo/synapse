export type ChunkMode = "newline" | "length";

export function normalizeChunkMode(value?: string | null): ChunkMode {
  return value === "length" ? "length" : "newline";
}

export function parseChunkLimit(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function applyResponsePrefix(content: string, prefix?: string | null): string {
  const trimmedPrefix = (prefix || "").trim();
  if (!trimmedPrefix) return content;
  const normalized = content || "";
  if (normalized.startsWith(trimmedPrefix)) return normalized;
  return `${trimmedPrefix} ${normalized}`.trim();
}

export function splitMessageByMode(
  text: string,
  maxLen: number,
  mode: ChunkMode = "newline",
): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitIdx = maxLen;
    if (mode === "newline") {
      const newlineIdx = remaining.lastIndexOf("\n", maxLen);
      if (newlineIdx >= maxLen / 2) splitIdx = newlineIdx;
    }
    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx);
  }
  return chunks;
}
