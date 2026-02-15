"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { GatewayProvider } from "@/contexts/GatewayContext";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <GatewayProvider>
        <ServiceWorkerRegistration />
        {children}
      </GatewayProvider>
    </SessionProvider>
  );
}
