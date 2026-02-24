import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { AgentInboundAttachment, ResolveAttachmentFn, StoredAttachmentRef } from "./types";

function buildFileRef(file: StoredAttachmentRef): string {
  return `[file:${file.id}:${file.filename}]`;
}

export function mergeContentWithFileRefs(content: string, files: StoredAttachmentRef[]): string {
  const refs = files.map(buildFileRef);
  if (refs.length === 0) return content.trim();
  const text = content.trim();
  return text ? `${refs.join("\n")}\n${text}` : refs.join("\n");
}

export async function ingestInboundAttachments(params: {
  convex: ConvexHttpClient;
  gatewayId: Id<"gateways">;
  sessionId: Id<"sessions">;
  conversationId?: Id<"conversations">;
  attachments: AgentInboundAttachment[];
  resolveAttachment: ResolveAttachmentFn;
}): Promise<{ files: StoredAttachmentRef[]; failed: number }> {
  const { convex, gatewayId, sessionId, conversationId, attachments, resolveAttachment } = params;
  const files: StoredAttachmentRef[] = [];
  let failed = 0;

  for (const attachment of attachments) {
    try {
      const resolved = await resolveAttachment(attachment);
      if (!resolved) {
        failed += 1;
        continue;
      }

      const uploadUrl = await convex.mutation(api.functions.files.generateUploadUrl, {});
      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": resolved.mimeType },
        body: resolved.data,
      });
      if (!uploadRes.ok) {
        failed += 1;
        continue;
      }

      const uploadJson = await uploadRes.json();
      const storageId = String(uploadJson.storageId || "");
      if (!storageId) {
        failed += 1;
        continue;
      }

      const fileId = await convex.mutation(api.functions.files.create, {
        gatewayId,
        sessionId,
        conversationId,
        filename: resolved.filename,
        mimeType: resolved.mimeType,
        size: resolved.data.byteLength,
        storageId,
      });

      files.push({
        id: fileId as Id<"files">,
        filename: resolved.filename,
        mimeType: resolved.mimeType,
        size: resolved.data.byteLength,
      });
    } catch {
      failed += 1;
    }
  }

  return { files, failed };
}
