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

export function formatStreamingMarkdown(content: string): string {
  if (!content) return "";
  let out = preprocessMarkdownTables(content);

  // Keep partial fenced blocks renderable while the stream is in-flight.
  const fenceCount = (out.match(/```/g) || []).length;
  if (fenceCount % 2 === 1) {
    out += "\n```";
  }

  return out;
}
