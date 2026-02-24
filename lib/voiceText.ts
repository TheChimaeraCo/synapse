export function prepareTextForSpeech(input: string, maxChars = 5000): string {
  if (!input) return "";

  let text = input;

  // Remove internal file markers and fenced code blocks.
  text = text.replace(/\[file:[^\]]+\]/g, " ");
  text = text.replace(/```[\s\S]*?```/g, " code snippet ");

  // Convert markdown links to visible label text and remove bare URLs.
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1");
  text = text.replace(/https?:\/\/\S+/g, " ");

  // Remove lightweight markdown syntax that sounds bad in TTS.
  const lines = text.split(/\r?\n/).map((line) => {
    let out = line;
    out = out.replace(/^\s{0,3}#{1,6}\s+/, "");
    out = out.replace(/^\s{0,3}>\s?/, "");
    out = out.replace(/^\s{0,3}(?:[-*+]\s+|\d+\.\s+)/, "");
    out = out.replace(/\*\*([^*]+)\*\*/g, "$1");
    out = out.replace(/\*([^*]+)\*/g, "$1");
    out = out.replace(/_([^_]+)_/g, "$1");
    out = out.replace(/`([^`]+)`/g, "$1");
    out = out.replace(/\|/g, " ");
    return out;
  });

  text = lines.join(" ");
  text = text.replace(/\s+/g, " ").trim();

  if (text.length > maxChars) {
    text = text.slice(0, maxChars).trim();
  }

  return text;
}
