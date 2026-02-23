"use client";
import { useState, useEffect, useCallback } from "react";
import { gatewayFetch } from "@/lib/gatewayFetch";

export function useFetch<T>(url: string | null, refreshInterval?: number) {
  const [data, setData] = useState<T | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!url) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await gatewayFetch(url);
      if (!res.ok) {
        // Session/gateway cookie can lag right after auth or gateway switch.
        if (res.status === 401 || res.status === 403) {
          await new Promise((resolve) => setTimeout(resolve, 350));
          const retry = await gatewayFetch(url);
          if (!retry.ok) throw new Error(`${retry.status}`);
          const retryJson = await retry.json();
          setData(retryJson);
          setError(null);
          return;
        }
        throw new Error(`${res.status}`);
      }
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    refetch();
    if (refreshInterval && url) {
      const interval = setInterval(refetch, refreshInterval);
      const onGatewayChanged = () => { void refetch(); };
      window.addEventListener("synapse:gateway-changed", onGatewayChanged);
      return () => {
        clearInterval(interval);
        window.removeEventListener("synapse:gateway-changed", onGatewayChanged);
      };
    }

    const onGatewayChanged = () => { void refetch(); };
    window.addEventListener("synapse:gateway-changed", onGatewayChanged);
    return () => {
      window.removeEventListener("synapse:gateway-changed", onGatewayChanged);
    };
  }, [refetch, refreshInterval, url]);

  return { data, loading, error, refetch };
}
