import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { AiCapability, RouteTarget } from "@/lib/aiRoutingConfig";
import { resolveAiSelection } from "@/lib/aiRouting";

const TEXT_EXT_RE = /\.(txt|md|markdown|csv|json|js|ts|tsx|jsx|py|rb|go|rs|java|c|cpp|h|hpp|xml|yml|yaml|ini|conf|log)$/i;
const IMAGE_EXT_RE = /\.(jpg|jpeg|png|gif|webp|svg)$/i;
const EXCEL_EXT_RE = /\.(xls|xlsx|xlsm|xlsb|ods|csv|tsv)$/i;

function isTextLike(mimeType: string, filename: string): boolean {
  const mime = (mimeType || "").toLowerCase();
  if (mime.startsWith("text/")) return true;
  if (mime.includes("json") || mime.includes("xml") || mime.includes("javascript")) return true;
  return TEXT_EXT_RE.test(filename || "");
}

function isImageLike(mimeType: string, filename: string): boolean {
  const mime = (mimeType || "").toLowerCase();
  return mime.startsWith("image/") || IMAGE_EXT_RE.test(filename || "");
}

function isPdfLike(mimeType: string, filename: string): boolean {
  const mime = (mimeType || "").toLowerCase();
  return mime.includes("pdf") || /\.pdf$/i.test(filename || "");
}

function isExcelLike(mimeType: string, filename: string): boolean {
  const mime = (mimeType || "").toLowerCase();
  if (EXCEL_EXT_RE.test(filename || "")) return true;
  return (
    mime.includes("spreadsheetml")
    || mime.includes("vnd.ms-excel")
    || mime.includes("application/vnd.oasis.opendocument.spreadsheet")
    || mime.includes("application/vnd.apple.numbers")
  );
}

function pickFileReadCapability(
  filename: string,
  mimeType: string,
  extractedMode: "text" | "pdf" | "image" | "binary" | undefined
): AiCapability {
  if (extractedMode === "image" || isImageLike(mimeType, filename)) return "image_read";
  if (extractedMode === "pdf" || isPdfLike(mimeType, filename)) return "pdf_read";
  if (isExcelLike(mimeType, filename)) return "excel_read";
  return "file_read";
}

export function extractFileRefs(content: string): string[] {
  if (!content || !content.includes("[file:")) return [];
  const re = /\[file:([^\]:]+):([^\]]+)\]/g;
  const ids: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    if (match[1]) ids.push(match[1]);
  }
  return Array.from(new Set(ids));
}

export async function getFileWithFreshUrl(fileId: Id<"files">) {
  const file = await convexClient.query(api.functions.files.get, { id: fileId });
  if (!file) return null;
  let url = file.url || "";
  if (!url && file.storageId) {
    url = (await convexClient.query(api.functions.files.getUrl, { storageId: file.storageId })) || "";
  }
  return { file, url };
}

export async function extractReadableText(
  file: { filename: string; mimeType: string },
  url: string,
  maxChars = 120_000
): Promise<{ mode: "text" | "pdf" | "image" | "binary"; text?: string; truncated?: boolean }> {
  if (!url) return { mode: "binary" };
  const res = await fetch(url);
  if (!res.ok) return { mode: "binary" };
  const bytes = Buffer.from(await res.arrayBuffer());
  const mime = (file.mimeType || "").toLowerCase();

  if (isTextLike(mime, file.filename)) {
    const text = bytes.toString("utf-8");
    return {
      mode: "text",
      text: text.slice(0, maxChars),
      truncated: text.length > maxChars,
    };
  }

  if (mime.includes("pdf") || /\.pdf$/i.test(file.filename || "")) {
    try {
      const pdfParseMod = await import("pdf-parse");
      const pdfParseFn: any = (pdfParseMod as any).default || (pdfParseMod as any);
      const parsed = await pdfParseFn(bytes);
      const text = String(parsed?.text || "");
      return {
        mode: "pdf",
        text: text.slice(0, maxChars),
        truncated: text.length > maxChars,
      };
    } catch {
      return { mode: "binary" };
    }
  }

  if (isImageLike(mime, file.filename)) {
    return { mode: "image" };
  }

  return { mode: "binary" };
}

export async function runFileReaderModel(opts: {
  gatewayId: Id<"gateways">;
  filename: string;
  mimeType: string;
  fileUrl: string;
  extracted?: { mode: "text" | "pdf" | "image" | "binary"; text?: string; truncated?: boolean };
  question?: string;
  routeOverride?: RouteTarget;
}) {
  const capability = pickFileReadCapability(
    opts.filename,
    opts.mimeType,
    opts.extracted?.mode,
  );
  const selection = await resolveAiSelection({
    gatewayId: opts.gatewayId,
    capability,
    message: opts.question || `Read file ${opts.filename}`,
    routeOverride: opts.routeOverride,
  });
  if (!selection.apiKey) throw new Error("No AI key configured for file reader");

  const { registerBuiltInApiProviders, getModel, streamSimple } = await import("@mariozechner/pi-ai");
  registerBuiltInApiProviders();
  const model = getModel(selection.provider as any, selection.model as any);
  if (!model) throw new Error(`Model "${selection.model}" not found for provider "${selection.provider}"`);

  let text = "";
  const question = opts.question?.trim() || "Summarize this file and list important details.";

  const systemPrompt = `You are a file-reading assistant. Read the provided file content and answer accurately.
- Be concise and factual.
- If data is missing in the file, say so.
- Never invent values.
- If the content is ambiguous, mention uncertainty.`;

  const messages: any[] = [];
  if (opts.extracted?.mode === "image") {
    messages.push({
      role: "user",
      content: [
        { type: "image", source: { type: "url", url: opts.fileUrl } },
        { type: "text", text: `Filename: ${opts.filename}\nMIME: ${opts.mimeType}\nQuestion: ${question}` },
      ],
      timestamp: Date.now(),
    });
  } else {
    const docText = opts.extracted?.text || "";
    messages.push({
      role: "user",
      content: `Filename: ${opts.filename}
MIME: ${opts.mimeType}
Question: ${question}

Document content:
${docText}`,
      timestamp: Date.now(),
    });
  }

  const stream = streamSimple(model, { systemPrompt, messages }, { maxTokens: 1400, apiKey: selection.apiKey });
  for await (const event of stream) {
    if (event.type === "text_delta") text += event.delta;
  }

  return {
    provider: selection.provider,
    model: selection.model,
    text: text.trim(),
  };
}
