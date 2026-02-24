import type { Id } from "@/convex/_generated/dataModel";

export type AgentAttachmentType = "photo" | "document" | "voice";

export interface AgentInboundAttachment {
  type: AgentAttachmentType;
  fileId: string;
  filename?: string;
  mimeType?: string;
}

export interface ResolvedAttachment {
  filename: string;
  mimeType: string;
  data: ArrayBuffer;
}

export type ResolveAttachmentFn = (
  attachment: AgentInboundAttachment
) => Promise<ResolvedAttachment | null>;

export interface StoredAttachmentRef {
  id: Id<"files">;
  filename: string;
  mimeType: string;
  size: number;
}
