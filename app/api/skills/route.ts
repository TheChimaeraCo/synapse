import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { BUILTIN_SKILLS } from "@/lib/builtinSkills";

export async function GET(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const status = req.nextUrl.searchParams.get("status") || undefined;
    const category = req.nextUrl.searchParams.get("category") || undefined;

    let skills = await convexClient.query(api.functions.skills.list, { gatewayId, status, category });

    if (skills.length === 0) {
      for (const skill of BUILTIN_SKILLS) {
        await convexClient.mutation(api.functions.skills.create, {
          name: skill.name,
          description: skill.description,
          version: skill.version,
          author: skill.author,
          category: skill.category,
          status: "available",
          functions: skill.functions.map((f) => ({ name: f.name, description: f.description, parameters: f.parameters })),
          triggers: skill.triggers,
          gatewayId,
        });
      }
      skills = await convexClient.query(api.functions.skills.list, { gatewayId, status, category });
    }

    return NextResponse.json({ skills });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const body = await req.json();
    const { action, id, ...data } = body;

    if (action === "install") {
      await convexClient.mutation(api.functions.skills.install, { id });
      return NextResponse.json({ success: true });
    }
    if (action === "uninstall") {
      await convexClient.mutation(api.functions.skills.uninstall, { id });
      return NextResponse.json({ success: true });
    }

    const skillId = await convexClient.mutation(api.functions.skills.create, {
      ...data,
      gatewayId,
      status: "available",
    });
    return NextResponse.json({ id: skillId });
  } catch (err) {
    return handleGatewayError(err);
  }
}
