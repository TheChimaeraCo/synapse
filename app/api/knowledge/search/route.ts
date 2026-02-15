import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { searchByEmbedding } from "@/lib/embeddings";
import type { Id } from "@/convex/_generated/dataModel";

export async function POST(req: NextRequest) {
  try {
    await getGatewayContext(req);
    const body = await req.json();
    const { query, agentId, userId, topK = 10 } = body;

    if (!query || !agentId) {
      return NextResponse.json({ error: "query and agentId are required" }, { status: 400 });
    }

    const knowledge = await convexClient.query(api.functions.knowledge.getWithEmbeddings, {
      agentId: agentId as Id<"agents">,
      userId,
    });

    if (!knowledge || knowledge.length === 0) {
      return NextResponse.json({ results: [], total: 0 });
    }

    let openaiKey: string | undefined;
    try {
      openaiKey = (await convexClient.query(api.functions.config.get, { key: "openai_api_key" })) || undefined;
    } catch {}

    const results = await searchByEmbedding(
      query,
      knowledge.map((k: any) => ({
        content: `${k.key} ${k.value}`,
        embedding: k.embedding,
        _id: k._id.toString(),
      })),
      { openaiKey, topK }
    );

    const enriched = results.map((r) => {
      const entry = knowledge.find((k: any) => k._id.toString() === r.id);
      return { ...r, category: entry?.category, key: entry?.key, value: entry?.value, confidence: entry?.confidence };
    });

    return NextResponse.json({
      results: enriched,
      total: knowledge.length,
      hasEmbeddings: knowledge.filter((k: any) => k.embedding?.length > 0).length,
    });
  } catch (err) {
    return handleGatewayError(err);
  }
}
