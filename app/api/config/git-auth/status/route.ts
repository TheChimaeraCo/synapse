import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getGitAuthConfig, getGitHubAppInstallationToken } from "@/lib/githubAuth";

function firstLine(value: string): string {
  return String(value || "").split(/\r?\n/).map((l) => l.trim()).find(Boolean) || "";
}

export async function GET(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const config = await getGitAuthConfig(gatewayId);

    if (config.mode === "github_app") {
      const missing: string[] = [];
      if (!config.githubAppId) missing.push("git.github_app_id");
      if (!config.githubAppInstallationId) missing.push("git.github_app_installation_id");
      if (!config.githubAppPrivateKey) missing.push("git.github_app_private_key");

      if (missing.length > 0) {
        return NextResponse.json({
          mode: config.mode,
          configured: false,
          ready: false,
          missing,
        });
      }

      try {
        const token = await getGitHubAppInstallationToken(config);
        return NextResponse.json({
          mode: config.mode,
          configured: true,
          ready: true,
          host: token.host,
          tokenExpiresAt: token.expiresAt,
        });
      } catch (err: any) {
        return NextResponse.json({
          mode: config.mode,
          configured: true,
          ready: false,
          error: err?.message || "Failed to mint installation token",
        });
      }
    }

    // cli_oauth mode
    let ghInstalled = false;
    let ghConnected = false;
    let ghMessage = "";
    try {
      execSync("gh --version", { encoding: "utf-8", timeout: 5000, stdio: ["ignore", "pipe", "pipe"] });
      ghInstalled = true;
    } catch (err: any) {
      ghMessage = firstLine(err?.stderr || err?.message || "GitHub CLI not installed");
    }

    if (ghInstalled) {
      try {
        const out = execSync("gh auth status --hostname github.com", {
          encoding: "utf-8",
          timeout: 7000,
          stdio: ["ignore", "pipe", "pipe"],
        });
        ghConnected = true;
        ghMessage = firstLine(out) || "Authenticated with GitHub CLI.";
      } catch (err: any) {
        ghMessage = firstLine(err?.stderr || err?.message || "Not authenticated");
      }
    }

    return NextResponse.json({
      mode: config.mode,
      configured: ghInstalled,
      ready: ghInstalled && ghConnected,
      ghInstalled,
      ghConnected,
      message: ghMessage,
    });
  } catch (err) {
    return handleGatewayError(err);
  }
}
