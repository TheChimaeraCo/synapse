import { createHmac } from "crypto";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export type WebhookEvent = "message.created" | "session.created" | "tool.executed" | "agent.error";

export async function fireWebhook(
  gatewayId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const webhooks = await convexClient.query(api.functions.webhooks.getEnabled, {
      gatewayId: gatewayId as Id<"gateways">,
      event,
    });

    if (!webhooks.length) return;

    const body = JSON.stringify({ event, timestamp: Date.now(), data: payload });

    await Promise.allSettled(
      webhooks.map(async (webhook) => {
        const signature = createHmac("sha256", webhook.secret).update(body).digest("hex");
        try {
          const res = await fetch(webhook.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Synapse-Event": event,
              "X-Synapse-Signature": `sha256=${signature}`,
            },
            body,
            signal: AbortSignal.timeout(10000),
          });
          await convexClient.mutation(api.functions.webhooks.updateLastTriggered, {
            id: webhook._id,
            status: res.status,
          });
        } catch (err) {
          console.error(`Webhook ${webhook.url} failed:`, err);
          await convexClient.mutation(api.functions.webhooks.updateLastTriggered, {
            id: webhook._id,
            status: 0,
          });
        }
      })
    );
  } catch (err) {
    console.error("fireWebhook error:", err);
  }
}
