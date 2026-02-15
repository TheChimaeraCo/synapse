"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type ConnectionStatus = "connected" | "slow" | "disconnected" | "reconnecting";

interface ConnectionState {
  status: ConnectionStatus;
  latencyMs: number | null;
  lastChecked: Date | null;
}

export function useConnectionStatus(intervalMs = 30000) {
  const [state, setState] = useState<ConnectionState>({
    status: "connected",
    latencyMs: null,
    lastChecked: null,
  });
  const failCount = useRef(0);
  const backoffMs = useRef(intervalMs);

  const check = useCallback(async () => {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch("/api/health/ping", { signal: controller.signal });
      clearTimeout(timeout);

      if (res.ok) {
        const latency = Date.now() - start;
        failCount.current = 0;
        backoffMs.current = intervalMs;
        setState({
          status: latency > 2000 ? "slow" : "connected",
          latencyMs: latency,
          lastChecked: new Date(),
        });
      } else {
        throw new Error("Non-OK");
      }
    } catch {
      failCount.current++;
      backoffMs.current = Math.min(intervalMs * Math.pow(2, failCount.current), 300000);
      setState((prev) => ({
        ...prev,
        status: failCount.current >= 3 ? "disconnected" : "reconnecting",
        lastChecked: new Date(),
      }));
    }
  }, [intervalMs]);

  useEffect(() => {
    check();
    let timer: NodeJS.Timeout;
    const schedule = () => {
      timer = setTimeout(() => {
        check().then(schedule);
      }, backoffMs.current);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [check]);

  return state;
}
