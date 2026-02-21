import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extractBearerToken, safeEqualSecret } from "@/lib/security";

const MODELS: Record<string, string> = {
  anthropic: "claude-sonnet-4-20250514",
  openrouter: "anthropic/claude-sonnet-4-20250514",
  openai: "gpt-4o",
  google: "gemini-2.0-flash",
};

async function getAiConfig(gatewayId?: string) {
  const getConfig = async (k: string) => {
    if (gatewayId) {
      try {
        const r = await convexClient.query(
          api.functions.gatewayConfig.getWithInheritance,
          { gatewayId: gatewayId as any, key: k }
        );
        if (r?.value) return r.value;
      } catch {}
    }
    const sysVal = await convexClient.query(api.functions.config.get, { key: k });
    if (sysVal) return sysVal;
    // Fall back to first gateway's config
    if (!gatewayId) {
      try {
        const gateways = await convexClient.query(api.functions.gateways.list, {});
        if (gateways?.length) {
          const r = await convexClient.query(
            api.functions.gatewayConfig.getWithInheritance,
            { gatewayId: gateways[0]._id, key: k }
          );
          if (r?.value) return r.value;
        }
      } catch {}
    }
    return null;
  };
  const [providerSlug, apiKey] = await Promise.all([
    getConfig("ai_provider"),
    getConfig("ai_api_key"),
  ]);
  return {
    provider: providerSlug || "anthropic",
    apiKey: apiKey || process.env.ANTHROPIC_API_KEY || "",
  };
}

function extractPdfText(buffer: Buffer): { text: string; numPages: number } {
  const tmpPath = join(
    tmpdir(),
    `parse-pdf-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`,
  );
  writeFileSync(tmpPath, buffer);
  try {
    const extractorScript = `
const fs = require("fs");
const pdf = require("pdf-parse");
(async () => {
  try {
    const filePath = process.argv[1];
    const data = await pdf(fs.readFileSync(filePath));
    process.stdout.write(JSON.stringify({
      text: data?.text || "",
      numPages: data?.numpages || 0
    }));
  } catch (err) {
    process.stdout.write(JSON.stringify({ error: err?.message || String(err) }));
    process.exitCode = 1;
  }
})();
`;

    const result = execFileSync(process.execPath, ["-e", extractorScript, tmpPath], {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    }).toString();
    const parsed = JSON.parse(result);
    if (parsed.error) throw new Error(parsed.error);
    return { text: parsed.text, numPages: parsed.numPages };
  } finally {
    try { unlinkSync(tmpPath); } catch {}
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  const expectedKey = process.env.PARSE_API_KEY;
  const bearer = extractBearerToken(request.headers.get("authorization"));

  if (expectedKey) {
    const hasValidApiKey = safeEqualSecret(bearer, expectedKey);
    if (!hasValidApiKey) {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      }
    }
  } else {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const schemaStr = formData.get("schema") as string | null;
    const promptStr = formData.get("prompt") as string | null;
    const gatewayId = formData.get("gatewayId") as string | null;

    if (!file) return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    if (!schemaStr) return NextResponse.json({ success: false, error: "No schema provided" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length === 0) return NextResponse.json({ success: false, error: "Empty file" }, { status: 400 });

    // Check if this is a text file (pre-extracted) or actual PDF
    const fileName = file.name || "";
    const fileType = file.type || "";
    const isText = fileType.includes("text") || fileName.endsWith(".txt");

    let pdfText: string;
    let numPages: number;

    if (isText) {
      // Text already extracted - use directly
      pdfText = buffer.toString("utf-8");
      numPages = 1;
    } else {
      // Extract text from PDF via child process
      try {
        const result = extractPdfText(buffer);
        pdfText = result.text;
        numPages = result.numPages;
      } catch (e: any) {
        return NextResponse.json({ success: false, error: "PDF extraction failed: " + e.message }, { status: 422 });
      }
    }

    if (!pdfText?.trim()) {
      return NextResponse.json({ success: false, error: "No text extracted from document" }, { status: 422 });
    }

    // AI config
    const { provider, apiKey } = await getAiConfig(gatewayId || undefined);
    if (!apiKey) return NextResponse.json({ success: false, error: "No AI API key configured" }, { status: 500 });

    const envMap: Record<string, string> = {
      anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY",
      google: "GEMINI_API_KEY", openrouter: "OPENROUTER_API_KEY",
    };
    if (envMap[provider]) process.env[envMap[provider]] = apiKey;

    const { registerBuiltInApiProviders, getModel, streamSimple } = await import("@mariozechner/pi-ai");
    registerBuiltInApiProviders();

    const modelId = MODELS[provider] || MODELS.anthropic;
    const model = getModel(provider as any, modelId as any);
    if (!model) return NextResponse.json({ success: false, error: `Model not found: ${modelId}` }, { status: 500 });

    const extraPrompt = promptStr ? `\n\nAdditional instructions: ${promptStr}` : "";
    const context = {
      systemPrompt: `You are a document parser. Extract data from the following document text and return ONLY valid JSON matching the provided schema. No explanation, no markdown, no code blocks. Raw JSON only.

Rules:
- If a field cannot be determined, use null
- Include ALL line items found, do not skip any
- Monetary values as numbers (6.80 not "$6.80")
- Dates in ISO 8601 (YYYY-MM-DD) where possible${extraPrompt}`,
      messages: [{
        role: "user" as const,
        content: `SCHEMA:\n${schemaStr}\n\nDOCUMENT TEXT:\n${pdfText.slice(0, 30000)}`,
        timestamp: Date.now(),
      }],
    };

    let aiResult = "";
    const stream = streamSimple(model, context, { maxTokens: 8192, apiKey });
    for await (const event of stream) {
      if (event.type === "text_delta") aiResult += event.delta;
    }

    const jsonMatch = aiResult.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ success: false, error: "AI did not return valid JSON", rawResponse: aiResult.slice(0, 500) }, { status: 422 });
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json({ success: false, error: "AI returned invalid JSON", rawResponse: aiResult.slice(0, 500) }, { status: 422 });
    }

    const processingMs = Date.now() - startTime;

    // Count items extracted
    let itemCount: number | undefined;
    if (parsed) {
      const vals = Object.values(parsed);
      const arr = vals.find((v) => Array.isArray(v));
      if (arr) itemCount = (arr as any[]).length;
    }

    // Log to parse history
    try {
      let logGatewayId = gatewayId;
      if (!logGatewayId) {
        const gateways = await convexClient.query(api.functions.gateways.list, {});
        if (gateways?.length) logGatewayId = gateways[0]._id;
      }
      if (logGatewayId) {
        await convexClient.mutation(api.functions.parseHistory.create, {
          gatewayId: logGatewayId as any,
          fileName: fileName || "unknown",
          fileSize: buffer.length,
          textLength: pdfText.length,
          schema: schemaStr,
          prompt: promptStr || undefined,
          result: JSON.stringify(parsed),
          status: "success" as const,
          model: modelId,
          provider,
          processingMs,
          itemCount,
          sourceIp: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined,
        });
      }
    } catch (logErr) {
      console.error("[parse-pdf] Failed to log parse history:", logErr);
    }

    return NextResponse.json({
      success: true,
      data: parsed,
      metadata: { pages: numPages, textLength: pdfText.length, model: modelId, provider, processingMs },
    });
  } catch (err: any) {
    console.error("[parse-pdf] Error:", err);

    // Log error to parse history
    try {
      const formData2 = await request.clone().formData().catch(() => null);
      const gatewayId2 = formData2?.get("gatewayId") as string | null;
      let logGatewayId = gatewayId2;
      if (!logGatewayId) {
        const gateways = await convexClient.query(api.functions.gateways.list, {});
        if (gateways?.length) logGatewayId = gateways[0]._id;
      }
      if (logGatewayId) {
        await convexClient.mutation(api.functions.parseHistory.create, {
          gatewayId: logGatewayId as any,
          fileName: "unknown",
          fileSize: 0,
          textLength: 0,
          schema: "",
          status: "error" as const,
          error: err.message || "Internal server error",
          processingMs: Date.now() - startTime,
          sourceIp: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined,
        });
      }
    } catch (logErr) {
      console.error("[parse-pdf] Failed to log error to parse history:", logErr);
    }

    return NextResponse.json({ success: false, error: err.message || "Internal server error" }, { status: 500 });
  }
}
