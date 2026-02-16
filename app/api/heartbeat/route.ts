import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";

export async function GET(req: NextRequest) {
  try {
    // Allow gatewayId from query param (backward compat) or from gateway context
    let gatewayId = req.nextUrl.searchParams.get("gatewayId");
    if (!gatewayId) {
      const ctx = await getGatewayContext(req);
      gatewayId = ctx.gatewayId;
    }

    const [modules, runs, cronJobs] = await Promise.all([
      convexClient.query(api.functions.heartbeat.list, { gatewayId: gatewayId as any }),
      convexClient.query(api.functions.heartbeat.getRuns, { gatewayId: gatewayId as any, limit: 10 }),
      convexClient.query(api.functions.heartbeat.getCronJobs, { gatewayId: gatewayId as any }),
    ]);

    return NextResponse.json({ modules, runs, cronJobs });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, ...data } = body;

    if (type === "module") {
      const id = await convexClient.mutation(api.functions.heartbeat.createModule, data);
      return NextResponse.json({ id });
    } else if (type === "cronJob") {
      const id = await convexClient.mutation(api.functions.heartbeat.upsertCronJob, data);
      return NextResponse.json({ id });
    }
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, ...data } = body;

    if (type === "module") {
      await convexClient.mutation(api.functions.heartbeat.updateModule, data);
      return NextResponse.json({ ok: true });
    } else if (type === "cronJob") {
      await convexClient.mutation(api.functions.heartbeat.upsertCronJob, data);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, id } = body;

    if (type === "module") {
      await convexClient.mutation(api.functions.heartbeat.deleteModule, { id });
    } else if (type === "cronJob") {
      await convexClient.mutation(api.functions.heartbeat.deleteCronJob, { id });
    } else {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleGatewayError(err);
  }
}
