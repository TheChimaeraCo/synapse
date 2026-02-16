"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { GatewayProvider } from "@/contexts/GatewayContext";
import { ThemeProvider } from "@/contexts/ThemeContext";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <GatewayProvider>
          <ServiceWorkerRegistration />
          {children}
        </GatewayProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
