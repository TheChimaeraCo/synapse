// lib/channelFormatter.ts - Format outbound messages per platform

interface FormatOptions {
  maxLength?: number;
  format?: string; // "markdown" | "plain" | "html"
}

/**
 * Escape special characters for Telegram MarkdownV2.
 * Characters that must be escaped: _ * [ ] ( ) ~ ` > # + - = | { } . !
 * But preserve code blocks and bold/italic formatting.
 */
export function escapeTelegramMarkdownV2(text: string): string {
  // Preserve code blocks first
  const codeBlocks: string[] = [];
  let processed = text.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match);
    return `__CODEBLOCK_${codeBlocks.length - 1}__`;
  });

  // Preserve inline code
  const inlineCode: string[] = [];
  processed = processed.replace(/`[^`]+`/g, (match) => {
    inlineCode.push(match);
    return `__INLINECODE_${inlineCode.length - 1}__`;
  });

  // Escape special chars (but not * and _ which are formatting)
  const specialChars = /([[\]()~>#+\-=|{}.!\\])/g;
  processed = processed.replace(specialChars, "\\$1");

  // Restore code blocks and inline code
  codeBlocks.forEach((block, i) => {
    processed = processed.replace(`__CODEBLOCK_${i}__`, block);
  });
  inlineCode.forEach((code, i) => {
    processed = processed.replace(`__INLINECODE_${i}__`, code);
  });

  return processed;
}

/**
 * Strip markdown for plain text platforms.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/, "").replace(/```$/, ""))
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

/**
 * Split a message into chunks that fit within platform limits.
 */
export function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    // Try to split at last newline before limit
    let splitIdx = remaining.lastIndexOf("\n", maxLen);
    if (splitIdx < maxLen / 2) splitIdx = maxLen;
    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).trimStart();
  }
  return chunks;
}

/**
 * Format content for a specific platform.
 */
export function formatForPlatform(
  platform: string,
  content: string,
  options: FormatOptions = {}
): string[] {
  const maxLen = options.maxLength || getDefaultMaxLength(platform);

  switch (platform) {
    case "telegram":
      // Don't escape for MarkdownV2 by default - use plain Markdown mode
      // which is more forgiving. MarkdownV2 escaping breaks too easily.
      return splitMessage(content, maxLen);

    case "hub":
      // Hub renders markdown natively in browser, pass through
      return [content];

    case "plain":
      return splitMessage(stripMarkdown(content), maxLen);

    default:
      return splitMessage(content, maxLen);
  }
}

function getDefaultMaxLength(platform: string): number {
  switch (platform) {
    case "telegram":
      return 4096;
    case "discord":
      return 2000;
    case "whatsapp":
      return 4096;
    case "hub":
      return Infinity;
    default:
      return 4096;
  }
}
