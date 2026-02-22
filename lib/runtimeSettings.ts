import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const RUNTIME_KEYS = [
  "gateway.name",
  "gateway.mode",
  "gateway.bind",
  "gateway.port",
  "gateway.rate_limit",
  "gateway.hot_reload",
  "gateway.mdns_broadcast",
  "gateway.dns_sd",
  "gateway.tailscale",
  "gateway.isolation_id",
  "gateway.cors_origins",
  "gateway.auth_token",
  "browser.mode",
  "browser.headless",
  "browser.proxy_url",
  "browser.proxy_user",
  "browser.proxy_pass",
  "browser.relay_enabled",
  "browser.relay_port",
  "logging.level",
  "logging.style",
  "logging.file_path",
  "logging.redact_sensitive",
  "logging.redact_patterns",
  "env.shell_loading",
  "env.dotenv_path",
  "env.vars",
  "plugins.list",
  "messages.ack_emoji",
  "messages.ack_scope",
  "messages.remove_ack_after_reply",
  "models.image_model",
  "sandbox.cpu_limit",
  "sandbox.memory_limit",
  "sandbox.disk_limit",
  "sandbox.docker_image",
  "sandbox.scope",
] as const;

async function getGatewayRuntimeConfig(gatewayId: Id<"gateways">): Promise<Record<string, string>> {
  try {
    return await convexClient.query(api.functions.gatewayConfig.getMultiple, {
      gatewayId,
      keys: [...RUNTIME_KEYS],
    });
  } catch {
    return await convexClient.query(api.functions.config.getMultiple, {
      keys: [...RUNTIME_KEYS],
    });
  }
}

export async function buildRuntimeSettingsSummary(gatewayId: Id<"gateways">): Promise<string> {
  let cfg: Record<string, string>;
  try {
    cfg = await getGatewayRuntimeConfig(gatewayId);
  } catch {
    return "";
  }

  const lines: string[] = [];
  const bool = (v?: string) => v === "true";
  const nonEmpty = (v?: string) => (v || "").trim();

  const gwName = nonEmpty(cfg["gateway.name"]);
  const gwMode = nonEmpty(cfg["gateway.mode"]) || "local";
  const gwBind = nonEmpty(cfg["gateway.bind"]) || "0.0.0.0";
  const gwPort = nonEmpty(cfg["gateway.port"]) || "3020";
  const gwRate = nonEmpty(cfg["gateway.rate_limit"]) || "0";
  lines.push(`Gateway: ${gwName || "synapse"} (${gwMode}), bind ${gwBind}:${gwPort}, rate limit ${gwRate}/min`);
  lines.push(`Gateway networking: hot_reload=${bool(cfg["gateway.hot_reload"])}, mdns=${bool(cfg["gateway.mdns_broadcast"])}, dns_sd=${bool(cfg["gateway.dns_sd"])}, tailscale=${bool(cfg["gateway.tailscale"])}`);
  if (nonEmpty(cfg["gateway.isolation_id"])) lines.push(`Gateway isolation id: ${cfg["gateway.isolation_id"]}`);
  if (nonEmpty(cfg["gateway.cors_origins"])) lines.push(`Gateway CORS origins configured`);
  if (nonEmpty(cfg["gateway.auth_token"])) lines.push(`Gateway auth token configured`);

  const browserMode = nonEmpty(cfg["browser.mode"]) || "chromium";
  lines.push(`Browser automation: mode=${browserMode}, headless=${cfg["browser.headless"] !== "false"}, relay=${bool(cfg["browser.relay_enabled"])}`);
  if (nonEmpty(cfg["browser.proxy_url"])) lines.push(`Browser proxy configured`);
  if (nonEmpty(cfg["browser.proxy_user"]) || nonEmpty(cfg["browser.proxy_pass"])) lines.push(`Browser proxy credentials configured`);
  if (nonEmpty(cfg["browser.relay_port"])) lines.push(`Browser relay port=${cfg["browser.relay_port"]}`);

  const logLevel = nonEmpty(cfg["logging.level"]) || "info";
  const logStyle = nonEmpty(cfg["logging.style"]) || "pretty";
  lines.push(`Logging: level=${logLevel}, style=${logStyle}, redact_sensitive=${cfg["logging.redact_sensitive"] !== "false"}`);
  if (nonEmpty(cfg["logging.file_path"])) lines.push(`Logging file output configured`);
  if (nonEmpty(cfg["logging.redact_patterns"])) lines.push(`Custom log redaction patterns configured`);

  const envVarsRaw = nonEmpty(cfg["env.vars"]);
  let envVarCount = 0;
  if (envVarsRaw) {
    try {
      const parsed = JSON.parse(envVarsRaw);
      if (Array.isArray(parsed)) envVarCount = parsed.length;
    } catch {}
  }
  lines.push(`Environment: shell_loading=${cfg["env.shell_loading"] !== "false"}, dotenv_path=${nonEmpty(cfg["env.dotenv_path"]) ? "custom" : "default"}, vars=${envVarCount}`);

  const pluginsRaw = nonEmpty(cfg["plugins.list"]);
  let pluginCount = 0;
  let pluginEnabled = 0;
  if (pluginsRaw) {
    try {
      const parsed = JSON.parse(pluginsRaw);
      if (Array.isArray(parsed)) {
        pluginCount = parsed.length;
        pluginEnabled = parsed.filter((p: any) => p?.enabled !== false).length;
      }
    } catch {}
  }
  lines.push(`Plugins: installed=${pluginCount}, enabled=${pluginEnabled}`);

  lines.push(`Channel acknowledgements: emoji=${nonEmpty(cfg["messages.ack_emoji"]) || "default"}, scope=${nonEmpty(cfg["messages.ack_scope"]) || "all"}, remove_after_reply=${cfg["messages.remove_ack_after_reply"] !== "false"}`);
  if (nonEmpty(cfg["models.image_model"])) lines.push(`Image model override configured`);

  const sandboxCpu = nonEmpty(cfg["sandbox.cpu_limit"]) || "2";
  const sandboxMem = nonEmpty(cfg["sandbox.memory_limit"]) || "512";
  const sandboxDisk = nonEmpty(cfg["sandbox.disk_limit"]) || "1024";
  const sandboxScope = nonEmpty(cfg["sandbox.scope"]) || "session";
  lines.push(`Sandbox resources: cpu=${sandboxCpu}, memory=${sandboxMem}MB, disk=${sandboxDisk}MB, scope=${sandboxScope}`);
  if (nonEmpty(cfg["sandbox.docker_image"])) lines.push(`Sandbox docker image configured`);

  return `\n\n## Runtime Settings Snapshot\n${lines.map((line) => `- ${line}`).join("\n")}`;
}
