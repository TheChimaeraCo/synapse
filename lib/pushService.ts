import webpush from 'web-push';

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY!;
const VAPID_SUBJECT = process.env.NEXTAUTH_URL || 'https://localhost:3000';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(`mailto:admin@${new URL(VAPID_SUBJECT).hostname}`, VAPID_PUBLIC, VAPID_PRIVATE);
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

export async function sendPushToAll(payload: PushPayload): Promise<{ sent: number; failed: number }> {
  // Fetch all subscriptions from Convex
  const convexUrl = process.env.CONVEX_SELF_HOSTED_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
  const adminKey = process.env.CONVEX_SELF_HOSTED_ADMIN_KEY;
  if (!convexUrl || !adminKey) return { sent: 0, failed: 0 };

  const res = await fetch(`${convexUrl}/api/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Convex ${adminKey}`,
    },
    body: JSON.stringify({
      path: 'functions/pushSubscriptions:getAll',
      args: {},
    }),
  });

  if (!res.ok) return { sent: 0, failed: 0 };
  const data = await res.json();
  const subs = data.value || [];

  let sent = 0, failed = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        JSON.stringify(payload)
      );
      sent++;
    } catch (e: any) {
      failed++;
      // Remove invalid subscriptions (410 Gone)
      if (e.statusCode === 410 || e.statusCode === 404) {
        try {
          await fetch(`${convexUrl}/api/mutation`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Convex ${adminKey}`,
            },
            body: JSON.stringify({
              path: 'functions/pushSubscriptions:unsubscribe',
              args: { endpoint: sub.endpoint },
            }),
          });
        } catch {}
      }
    }
  }
  return { sent, failed };
}
