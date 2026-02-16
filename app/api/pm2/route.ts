import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getGatewaySlug } from "@/lib/workspace";

function isGatewayProcess(name: string, slug: string): boolean {
  return name.startsWith(`${slug}-`) || name === slug;
}

export async function GET(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const slug = await getGatewaySlug(gatewayId);

    const raw = execSync("pm2 jlist", { encoding: "utf-8", timeout: 10000 });
    const procs = JSON.parse(raw);

    // Filter to gateway's processes if slug is available
    if (slug) {
      const filtered = procs.filter((p: any) => isGatewayProcess(p.name, slug));
      return NextResponse.json(filtered);
    }

    return NextResponse.json(procs);
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const slug = await getGatewaySlug(gatewayId);

    const body = await req.json();
    const { action, name, script, cwd, interpreter, args: scriptArgs } = body;

    // Verify process belongs to this gateway
    if (slug && name && !isGatewayProcess(name, slug)) {
      return NextResponse.json({ error: "Process does not belong to this gateway" }, { status: 403 });
    }

    let cmd: string;
    switch (action) {
      case "stop":
        cmd = `pm2 stop ${JSON.stringify(name)}`;
        break;
      case "restart":
        cmd = `pm2 restart ${JSON.stringify(name)}`;
        break;
      case "delete":
        cmd = `pm2 delete ${JSON.stringify(name)}`;
        break;
      case "start": {
        // Auto-prefix name with gateway slug if not already prefixed
        let processName = body.name || name;
        if (slug && processName && !processName.startsWith(`${slug}-`)) {
          processName = `${slug}-${processName}`;
        }
        // Validate inputs to prevent command injection
        const safePattern = /^[a-zA-Z0-9._\-\/]+$/;
        if (script && !safePattern.test(script)) {
          return NextResponse.json({ error: "Invalid script path" }, { status: 400 });
        }
        if (processName && !safePattern.test(processName)) {
          return NextResponse.json({ error: "Invalid process name" }, { status: 400 });
        }
        if (cwd && !safePattern.test(cwd)) {
          return NextResponse.json({ error: "Invalid cwd path" }, { status: 400 });
        }
        if (interpreter && !safePattern.test(interpreter)) {
          return NextResponse.json({ error: "Invalid interpreter" }, { status: 400 });
        }
        cmd = `pm2 start ${JSON.stringify(script || name)}`;
        if (processName && script) cmd += ` --name ${JSON.stringify(processName)}`;
        if (cwd) cmd += ` --cwd ${JSON.stringify(cwd)}`;
        if (interpreter) cmd += ` --interpreter ${JSON.stringify(interpreter)}`;
        // scriptArgs intentionally excluded - too dangerous for injection
        break;
      }
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const result = execSync(cmd, { encoding: "utf-8", timeout: 15000 });
    return NextResponse.json({ ok: true, output: result });
  } catch (err: any) {
    if (err.statusCode) return handleGatewayError(err);
    return NextResponse.json({ error: err.stderr || err.message }, { status: 500 });
  }
}
