export function preprocessMarkdownTables(content: string): string {
  const lines = content.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    result.push(line);

    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cols = trimmed.split("|").filter((c) => c.trim() !== "").length;
      if (cols <= 0) continue;

      const nextLine = i + 1 < lines.length ? lines[i + 1]?.trim() : "";
      const isSeparator = /^\|[\s\-:|]+\|$/.test(nextLine);
      const prevLine = i > 0 ? lines[i - 1]?.trim() : "";
      const prevIsPipe = prevLine.startsWith("|") && prevLine.endsWith("|");

      if (!isSeparator && !prevIsPipe) {
        result.push("|" + " --- |".repeat(cols));
      }
    }
  }

  return result.join("\n");
}

const IMAGE_URL_RE = /^<?(https?:\/\/[^\s>]+\.(?:png|jpe?g|gif|webp|svg)(?:\?[^\s>]*)?)>?$/i;

function normalizeImageEmbedLine(line: string): string {
  const trimmed = line.trim();
  const match = trimmed.match(IMAGE_URL_RE);
  if (!match) return line;
  const url = match[1];
  return `![image](${url})`;
}

export function autoEmbedImageUrls(content: string): string {
  if (!content) return "";
  const lines = content.split("\n");
  const out: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    out.push(inFence ? line : normalizeImageEmbedLine(line));
  }

  return out.join("\n");
}

export function formatMessageMarkdown(content: string): string {
  return preprocessMarkdownTables(autoEmbedImageUrls(content || ""));
}

export function formatStreamingMarkdown(content: string): string {
  if (!content) return "";
  let out = formatMessageMarkdown(content);

  // Keep partial fenced blocks renderable while the stream is in-flight.
  const fenceCount = (out.match(/```/g) || []).length;
  if (fenceCount % 2 === 1) {
    out += "\n```";
  }

  return out;
}
