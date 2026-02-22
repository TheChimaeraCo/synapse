import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await getGatewayContext(req);
    const { id } = await params;
    const includeChain = req.nextUrl.searchParams.get("includeChain") !== "false";

    const rootConvoId = id as Id<"conversations">;
    let convoIds: Array<Id<"conversations">> = [rootConvoId];

    if (includeChain) {
      const chain = await convexClient.query(api.functions.conversations.getChain, {
        conversationId: rootConvoId,
        maxDepth: 10,
      });
      if (chain.length > 0) {
        convoIds = chain.map((c: any) => c._id as Id<"conversations">);
      }
    }

    const fileMap = new Map<string, any>();
    for (const convoId of convoIds) {
      const files = await convexClient.query(api.functions.files.listByConversation, {
        conversationId: convoId,
        limit: 100,
      });
      for (const file of files) {
        fileMap.set(String(file._id), file);
      }
    }

    const out = Array.from(fileMap.values())
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .map((file) => ({
        _id: file._id,
        filename: file.filename,
        mimeType: file.mimeType,
        size: file.size,
        conversationId: file.conversationId,
        messageId: file.messageId,
        createdAt: file.createdAt,
        url: file.url,
      }));

    return NextResponse.json({ files: out });
  } catch (err) {
    return handleGatewayError(err);
  }
}

