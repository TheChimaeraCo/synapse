"use client";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { gatewayFetch } from "@/lib/gatewayFetch";

export function useConfigSettings(prefix: string) {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await gatewayFetch(`/api/config/bulk?prefix=${prefix}`);
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, [prefix]);

  useEffect(() => { load(); }, [load]);

  const get = (key: string, defaultValue = "") => config[`${prefix}${key}`] ?? defaultValue;
  const set = (key: string, value: string) => setConfig(prev => ({ ...prev, [`${prefix}${key}`]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await gatewayFetch("/api/config/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
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
