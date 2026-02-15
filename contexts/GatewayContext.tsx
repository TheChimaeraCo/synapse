"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

export interface Gateway {
  _id: string;
  name: string;
  slug: string;
  icon?: string;
  isMaster?: boolean;
  status: string;
  role?: string;
  memberCount?: number;
  messageCount?: number;
}

interface GatewayContextType {
  gateways: Gateway[];
  activeGateway: Gateway | null;
  activeRole: string | null;
  loading: boolean;
  switchGateway: (gatewayId: string) => Promise<void>;
  refreshGateways: () => Promise<void>;
}

const GatewayContext = createContext<GatewayContextType>({
  gateways: [],
  activeGateway: null,
  activeRole: null,
  loading: true,
  switchGateway: async () => {},
  refreshGateways: async () => {},
});

const STORAGE_KEY = "synapse-active-gateway";

// Routes that don't require a gateway
const NO_GATEWAY_ROUTES = ["/gateways", "/setup", "/login", "/register", "/invite", "/onboarding"];

export function GatewayProvider({ children }: { children: ReactNode }) {
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [activeGateway, setActiveGateway] = useState<Gateway | null>(null);
  const [activeRole, setActiveRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  const fetchGateways = useCallback(async () => {
    try {
      const res = await fetch("/api/gateways");
      if (!res.ok) return;
      const data = await res.json();
      const list: Gateway[] = data.gateways || [];
      setGateways(list);

      // Resolve active gateway
      const savedId = localStorage.getItem(STORAGE_KEY);
      const match = savedId ? list.find((g) => g._id === savedId) : null;

      if (match) {
        setActiveGateway(match);
        setActiveRole(match.role || null);
      } else if (list.length === 1) {
        // Auto-select the only gateway
        const gw = list[0];
        setActiveGateway(gw);
        setActiveRole(gw.role || null);
        localStorage.setItem(STORAGE_KEY, gw._id);
        document.cookie = `synapse-active-gateway=${gw._id}; path=/; max-age=31536000; samesite=lax`;
      } else if (list.length > 1) {
        // Multiple gateways, try master or first
        const master = list.find((g) => g.isMaster) || list[0];
        setActiveGateway(master);
        setActiveRole(master.role || null);
        localStorage.setItem(STORAGE_KEY, master._id);
        document.cookie = `synapse-active-gateway=${master._id}; path=/; max-age=31536000; samesite=lax`;
      }
      // If list.length === 0 and not on a no-gateway route, redirect handled below
    } catch {
      // Silently fail - user may not be authenticated yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGateways();
  }, [fetchGateways]);

  // Redirect to /gateways if no gateways and not on a no-gateway route
  useEffect(() => {
    if (loading) return;
    const isNoGatewayRoute = NO_GATEWAY_ROUTES.some(r => pathname.startsWith(r));
    if (isNoGatewayRoute) return;

    if (gateways.length === 0 && !activeGateway) {
      router.push("/gateways");
    }
  }, [loading, gateways, activeGateway, pathname, router]);

  const switchGateway = useCallback(async (gatewayId: string) => {
    try {
      await fetch("/api/gateways/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gatewayId }),
      });
    } catch {}

    localStorage.setItem(STORAGE_KEY, gatewayId);
    document.cookie = `synapse-active-gateway=${gatewayId}; path=/; max-age=31536000; samesite=lax`;

    const gw = gateways.find((g) => g._id === gatewayId) || null;
    setActiveGateway(gw);
    setActiveRole(gw?.role || null);

    window.dispatchEvent(new CustomEvent("synapse:gateway-changed", { detail: { gatewayId } }));
  }, [gateways]);

  const refreshGateways = useCallback(async () => {
    await fetchGateways();
  }, [fetchGateways]);

  return (
    <GatewayContext.Provider value={{ gateways, activeGateway, activeRole, loading, switchGateway, refreshGateways }}>
      {children}
    </GatewayContext.Provider>
  );
}

export function useGateway() {
  return useContext(GatewayContext);
}

/**
 * Get the active gateway ID from localStorage (for use outside React context).
 */
export function getActiveGatewayId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}
