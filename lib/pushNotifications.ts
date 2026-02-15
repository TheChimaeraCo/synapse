export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch (e) {
    console.error('SW registration failed:', e);
    return null;
  }
}

export async function subscribeToPush(): Promise<PushSubscription | null> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  const reg = await registerServiceWorker();
  if (!reg) return null;

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) { console.error('No VAPID key'); return null; }

  const sub = await reg.pushManager.subscribe({
    userVisuallyRequested: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  } as any);

  // Save to backend
  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub.toJSON()),
  });

  return sub;
}

export async function unsubscribeFromPush(): Promise<void> {
  const reg = await navigator.serviceWorker?.ready;
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;

  await fetch('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  await sub.unsubscribe();
}

export async function getSubscriptionStatus(): Promise<'granted' | 'denied' | 'default' | 'unsupported'> {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function isSubscribed(): Promise<boolean> {
  const reg = await navigator.serviceWorker?.ready;
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
