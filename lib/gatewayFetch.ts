/**
 * Gateway-aware fetch utility.
 * Wraps native fetch to include X-Gateway-Id header from localStorage.
 */

const STORAGE_KEY = "synapse-active-gateway";

export function gatewayFetch(url: string, init?: RequestInit): Promise<Response> {
  const gatewayId = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;

  const headers = new Headers(init?.headers);
  if (gatewayId && !headers.has("X-Gateway-Id")) {
    headers.set("X-Gateway-Id", gatewayId);
  }

  return fetch(url, { ...init, headers });
}
