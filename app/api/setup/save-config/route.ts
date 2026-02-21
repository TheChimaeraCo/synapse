import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const SECRET_KEY_PATTERN = /(api[_-]?key|token|secret|password|private[_-]?key)/i;

/** Map config keys to Convex environment variable names */
const SECRET_ENV_MAP: Record<string, string> = {
  ai_api_key: "ANTHROPIC_API_KEY",
  anthropic_api_key: "ANTHROPIC_API_KEY",
  openai_api_key: "OPENAI_API_KEY",
  gemini_api_key: "GEMINI_API_KEY",
  telegram_bot_token: "TELEGRAM_BOT_TOKEN",
  slack_bot_token: "SLACK_BOT_TOKEN",
  slack_signing_secret: "SLACK_SIGNING_SECRET",
  whatsapp_access_token: "WHATSAPP_ACCESS_TOKEN",
};

/** Write a key=value to .env.local (for Next.js process.env on restart) */
function writeEnvLocal(name: string, value: string) {
  const envPath = join(process.cwd(), ".env.local");
  let content = "";
  try { content = readFileSync(envPath, "utf8"); } catch {}
  const regex = new RegExp(`^${name}=.*$`, "m");
  if (regex.test(content)) {
    content = content.replace(regex, `${name}=${value}`);
  } else {
    content = content.trimEnd() + `\n${name}=${value}\n`;
  }
  writeFileSync(envPath, content);
}

/** Set a Convex environment variable via the backend admin API */
async function setConvexEnvVar(name: string, value: string) {
  const url = process.env.CONVEX_SELF_HOSTED_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
  const adminKey = process.env.CONVEX_SELF_HOSTED_ADMIN_KEY;
  if (!url || !adminKey) throw new Error("Convex self-hosted URL or admin key not configured");

  const res = await fetch(`${url}/api/update_environment_variables`, {
    method: "POST",
    headers: {
      "Authorization": `Convex ${adminKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ changes: [{ name, value }] }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to set Convex env var "${name}": ${res.status} ${text}`);
  }
}

/**
 * POST /api/setup/save-config
 * Save gateway config during setup without requiring full gateway context.
 * Secrets go to Convex environment variables, non-secrets go to Convex DB.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await getAuthContext();
    const { gatewayId, key, value } = await req.json();

    if (!gatewayId || !key || value === undefined) {
      return NextResponse.json(
        { error: "gatewayId, key, and value are required" },
        { status: 400 }
      );
    }

    // Verify the user owns this gateway
    const gateway = await convexClient.query(api.functions.gateways.get, {
      id: gatewayId as Id<"gateways">,
    });

    if (!gateway) {
      return NextResponse.json({ error: "Gateway not found" }, { status: 404 });
    }

    if (gateway.ownerId !== userId) {
      return NextResponse.json({ error: "Not the gateway owner" }, { status: 403 });
    }

    // Secret keys go to Convex env vars + .env.local + process.env (for Next.js)
    if (SECRET_ENV_MAP[key]) {
      const envName = SECRET_ENV_MAP[key];
      await setConvexEnvVar(envName, value);
      writeEnvLocal(envName, value);
      process.env[envName] = value;
      return NextResponse.json({ success: true, storage: "convex_env" });
    }

    if (SECRET_KEY_PATTERN.test(key)) {
      const envName = key.toUpperCase();
      await setConvexEnvVar(envName, value);
      writeEnvLocal(envName, value);
      process.env[envName] = value;
      return NextResponse.json({ success: true, storage: "convex_env" });
    }

    // Non-secret: save to Convex DB
    await convexClient.mutation(api.functions.gatewayConfig.set, {
      gatewayId: gatewayId as Id<"gateways">,
      key,
      value,
    });

    return NextResponse.json({ success: true, storage: "db" });
  } catch (err: any) {
    return handleGatewayError(err);
  }
}
