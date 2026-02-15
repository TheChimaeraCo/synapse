import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";

export async function GET(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const convex = getConvexClient();
    const projectId = req.nextUrl.searchParams.get("projectId");
    const status = req.nextUrl.searchParams.get("status") || undefined;
    if (projectId) {
      const tasks = await convex.query(api.functions.tasks.getByProject, { projectId: projectId as any });
      return NextResponse.json(tasks);
    }
    const tasks = await convex.query(api.functions.tasks.list, { gatewayId, status });
    return NextResponse.json(tasks);
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const convex = getConvexClient();
    const body = await req.json();
    const id = await convex.mutation(api.functions.tasks.create, {
      projectId: body.projectId,
      title: body.title,
      description: body.description || "",
      status: body.status || "todo",
      priority: body.priority ?? 3,
      assignee: body.assignee,
      dueDate: body.dueDate,
      gatewayId,
    });
    return NextResponse.json({ id });
  } catch (err) {
    return handleGatewayError(err);
  }
}
