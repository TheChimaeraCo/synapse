/**
 * Workspace path resolution for gateway file operations.
 * Supports per-gateway paths with multi-level fallback and caching.
 */
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const DEFAULT_WORKSPACE = "/root/clawd";
let _cached: string | null = null;
let _cacheTime = 0;
const _gwCache: Record<string, { value: string; time: number }> = {};

/**
 * Get workspace path. If gatewayId is provided:
 * 1. Check gateways table for workspacePath field
 * 2. Fall back to gatewayConfig for workspace_path key
 * 3. Fall back to systemConfig global workspace_path
 * 4. Default: /root/clawd
 */
export async function getWorkspacePath(gatewayId?: string): Promise<string> {
  // Per-gateway workspace
  if (gatewayId) {
    const cached = _gwCache[gatewayId];
    if (cached && Date.now() - cached.time < 60000) return cached.value;
    try {
      const convex = new ConvexHttpClient(process.env.CONVEX_SELF_HOSTED_URL || "http://127.0.0.1:3220");
      
      // 1. Check gateways table workspacePath field
      const gateway = await convex.query(api.functions.gateways.get, {
        id: gatewayId as Id<"gateways">,
      });
      if (gateway?.workspacePath) {
        _gwCache[gatewayId] = { value: gateway.workspacePath, time: Date.now() };
        return gateway.workspacePath;
      }
      
      // 2. Fall back to gatewayConfig
      const result = await convex.query(api.functions.gatewayConfig.getWithInheritance, {
        gatewayId: gatewayId as Id<"gateways">,
        key: "identity.workspace_path",
      });
      if (result?.value) {
        _gwCache[gatewayId] = { value: result.value, time: Date.now() };
        return result.value;
      }
      const legacyResult = await convex.query(api.functions.gatewayConfig.getWithInheritance, {
        gatewayId: gatewayId as Id<"gateways">,
        key: "workspace_path",
      });
      if (legacyResult?.value) {
        _gwCache[gatewayId] = { value: legacyResult.value, time: Date.now() };
        return legacyResult.value;
      }
    } catch {}
    // Fall through to global
  }

  // Global workspace path
  if (_cached && Date.now() - _cacheTime < 60000) return _cached;
  try {
    const convex = new ConvexHttpClient(process.env.CONVEX_SELF_HOSTED_URL || "http://127.0.0.1:3220");
    const namespaced = await convex.query(api.functions.config.get, { key: "identity.workspace_path" });
    const legacy = await convex.query(api.functions.config.get, { key: "workspace_path" });
    _cached = (namespaced as string) || (legacy as string) || DEFAULT_WORKSPACE;
    _cacheTime = Date.now();
    return _cached;
  } catch {
    return _cached || DEFAULT_WORKSPACE;
  }
}

/**
 * Synchronous version - uses cache or default. For places that can't await.
 */
export function getWorkspacePathSync(gatewayId?: string): string {
  if (gatewayId) {
    const cached = _gwCache[gatewayId];
    if (cached && Date.now() - cached.time < 60000) return cached.value;
  }
  return _cached || DEFAULT_WORKSPACE;
}

/**
 * Get gateway slug by ID. Cached.
 */
const _slugCache: Record<string, { value: string; time: number }> = {};
export async function getGatewaySlug(gatewayId: string): Promise<string | null> {
  const cached = _slugCache[gatewayId];
  if (cached && Date.now() - cached.time < 60000) return cached.value;
  try {
    const convex = new ConvexHttpClient(process.env.CONVEX_SELF_HOSTED_URL || "http://127.0.0.1:3220");
    const gateway = await convex.query(api.functions.gateways.get, {
      id: gatewayId as Id<"gateways">,
    });
    if (gateway?.slug) {
      _slugCache[gatewayId] = { value: gateway.slug, time: Date.now() };
      return gateway.slug;
    }
  } catch {}
  return null;
}
