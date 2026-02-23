"use client";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { gatewayFetch } from "@/lib/gatewayFetch";

export function useConfigSettings(prefix: string) {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let res = await gatewayFetch(`/api/config/bulk?prefix=${prefix}`);
      if (!res.ok && (res.status === 401 || res.status === 403)) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        res = await gatewayFetch(`/api/config/bulk?prefix=${prefix}`);
      }
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, [prefix]);

  useEffect(() => {
    void load();
    const onGatewayChanged = () => { void load(); };
    window.addEventListener("synapse:gateway-changed", onGatewayChanged);
    return () => {
      window.removeEventListener("synapse:gateway-changed", onGatewayChanged);
    };
  }, [load]);

  const get = (key: string, defaultValue = "") => config[`${prefix}${key}`] ?? defaultValue;
  const set = (key: string, value: string) => setConfig(prev => ({ ...prev, [`${prefix}${key}`]: value }));

  const save = async () => {
    setSaving(true);
    try {
      let res = await gatewayFetch("/api/config/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok && (res.status === 401 || res.status === 403)) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        res = await gatewayFetch("/api/config/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
        });
      }
      if (!res.ok) throw new Error();
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return { get, set, save, saving, loading, config, loaded: !loading };
}
