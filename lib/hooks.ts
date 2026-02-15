"use client";
import { useState, useEffect, useCallback } from "react";
import { gatewayFetch } from "@/lib/gatewayFetch";

export function useFetch<T>(url: string | null, refreshInterval?: number) {
  const [data, setData] = useState<T | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!url) { setLoading(false); return; }
    try {
      const res = await gatewayFetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
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
      return () => clearInterval(interval);
    }
  }, [refetch, refreshInterval, url]);

  return { data, loading, error, refetch };
}
