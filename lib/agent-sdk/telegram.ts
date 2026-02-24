import type { AgentInboundAttachment, ResolveAttachmentFn, ResolvedAttachment } from "./types";

const TELEGRAM_API = "https://api.telegram.org";

function fallbackFilename(attachment: AgentInboundAttachment): string {
  if (attachment.filename) return attachment.filename;
  if (attachment.type === "photo") return "photo.jpg";
  if (attachment.type === "voice") return "voice.ogg";
  return "file";
}

function fallbackMimeType(attachment: AgentInboundAttachment): string {
  if (attachment.mimeType) return attachment.mimeType;
  if (attachment.type === "photo") return "image/jpeg";
  if (attachment.type === "voice") return "audio/ogg";
  return "application/octet-stream";
}

function mimeFromFilename(filename: string): string | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  return null;
}

function isGenericMimeType(mimeType?: string | null): boolean {
  if (!mimeType) return true;
  const value = mimeType.toLowerCase().trim();
  return value === "application/octet-stream" || value === "binary/octet-stream";
}

export function createTelegramAttachmentResolver(botToken: string): ResolveAttachmentFn {
  return async (attachment: AgentInboundAttachment): Promise<ResolvedAttachment | null> => {
    const fileInfoRes = await fetch(`${TELEGRAM_API}/bot${botToken}/getFile?file_id=${encodeURIComponent(attachment.fileId)}`);
    if (!fileInfoRes.ok) return null;

    const fileInfo = await fileInfoRes.json();
    const filePath = fileInfo?.result?.file_path;
    if (!filePath) return null;
    const pathName = String(filePath).split("/").pop() || "";
    const filename = fallbackFilename({
      ...attachment,
      filename: attachment.filename || pathName,
    });

    const fileRes = await fetch(`${TELEGRAM_API}/file/bot${botToken}/${filePath}`);
    if (!fileRes.ok) return null;

    const data = await fileRes.arrayBuffer();
    const contentType = fileRes.headers.get("content-type");
    const mimeType = isGenericMimeType(contentType)
      ? (mimeFromFilename(filename) || fallbackMimeType(attachment))
      : contentType!;

    return {
      filename,
      mimeType,
      data,
    };
  };
}
