#!/usr/bin/env node
/**
 * Echo Collaboration CLI
 *
 * Usage:
 *   node scripts/echo-collab.js --message "What should we improve next?"
 *   node scripts/echo-collab.js --message "Plan this as milestones" --stream
 *
 * Env vars:
 *   ECHO_API_URL       (default: https://synapse.chimaeraco.dev/api/channels/api-message)
 *   ECHO_CHANNEL_ID    (required unless --channel provided)
 *   ECHO_API_KEY       (required unless --key provided)
 */

const DEFAULT_URL = "https://synapse.chimaeraco.dev/api/channels/api-message";

function parseArgs(argv) {
  const out = {
    stream: false,
    message: "",
    sessionId: undefined,
    externalUserId: undefined,
    metadata: undefined,
    url: process.env.ECHO_API_URL || DEFAULT_URL,
    channelId: process.env.ECHO_CHANNEL_ID || "",
    apiKey: process.env.ECHO_API_KEY || "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }
    if (arg === "--stream") {
      out.stream = true;
      continue;
    }
    if ((arg === "--message" || arg === "-m") && next) {
      out.message = next;
      i += 1;
      continue;
    }
    if ((arg === "--session" || arg === "-s") && next) {
      out.sessionId = next;
      i += 1;
      continue;
    }
    if ((arg === "--external-user" || arg === "-u") && next) {
      out.externalUserId = next;
      i += 1;
      continue;
    }
    if (arg === "--metadata" && next) {
      out.metadata = next;
      i += 1;
      continue;
    }
    if (arg === "--url" && next) {
      out.url = next;
      i += 1;
      continue;
    }
    if ((arg === "--channel" || arg === "-c") && next) {
      out.channelId = next;
      i += 1;
      continue;
    }
    if ((arg === "--key" || arg === "-k") && next) {
      out.apiKey = next;
      i += 1;
      continue;
    }
  }

  return out;
}

function printHelp() {
  console.log(`Echo Collaboration CLI

Required:
  --message, -m       Message for Echo

Optional:
  --stream            Use SSE streaming and print live tokens
  --session, -s       Continue an existing session ID
  --external-user, -u External user ID (defaults to api-user server-side)
  --metadata          JSON object string (example: '{"topic":"ledger"}')
  --url               Override API URL
  --channel, -c       Override channel ID
  --key, -k           Override API key
  --help, -h          Show this help

Env:
  ECHO_API_URL
  ECHO_CHANNEL_ID
  ECHO_API_KEY
`);
}

function requireField(value, name) {
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required ${name}`);
  }
}

async function parseSseStream(response) {
  if (!response.body) {
    throw new Error("No response body for streaming request");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let doneReceived = false;

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      const line = part
        .split("\n")
        .find((l) => l.startsWith("data: "));
      if (!line) continue;
      const raw = line.slice(6);

      let event;
      try {
        event = JSON.parse(raw);
      } catch {
        process.stderr.write(`[echo-collab] Non-JSON event: ${raw}\n`);
        continue;
      }

      if (event.type === "token" && typeof event.content === "string") {
        process.stdout.write(event.content);
      } else if (event.type === "done") {
        doneReceived = true;
        process.stdout.write("\n");
      } else if (event.type === "error") {
        process.stderr.write(`\n[echo-collab] Stream error: ${event.message || "unknown"}\n`);
      } else if (event.type === "tool_use") {
        const tools = Array.isArray(event.tools) ? event.tools.join(", ") : "unknown";
        process.stderr.write(`\n[echo-collab] Tool calls: ${tools}\n`);
      }
    }
  }

  if (!doneReceived) {
    process.stdout.write("\n");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  requireField(args.message, "--message");
  requireField(args.channelId, "channel ID (--channel or ECHO_CHANNEL_ID)");
  requireField(args.apiKey, "API key (--key or ECHO_API_KEY)");

  let parsedMetadata;
  if (args.metadata) {
    try {
      parsedMetadata = JSON.parse(args.metadata);
    } catch (err) {
      throw new Error(`Invalid --metadata JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const payload = {
    channelId: args.channelId,
    message: args.message,
    stream: args.stream || undefined,
    sessionId: args.sessionId,
    externalUserId: args.externalUserId,
    metadata: parsedMetadata,
  };

  const response = await fetch(args.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  if (args.stream) {
    await parseSseStream(response);
    return;
  }

  const json = await response.json();
  process.stdout.write(`${JSON.stringify(json, null, 2)}\n`);
}

main().catch((err) => {
  process.stderr.write(`[echo-collab] ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
