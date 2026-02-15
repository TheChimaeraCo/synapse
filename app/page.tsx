"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useFetch } from "@/lib/hooks";
import { useGateway } from "@/contexts/GatewayContext";
import { AppShell } from "@/components/layout/AppShell";
import { StatsCards, StatsCardsSkeleton } from "@/components/dashboard/StatsCards";
import { ActivityChart } from "@/components/dashboard/ActivityChart";
import { GatewayOverview } from "@/components/dashboard/GatewayOverview";
import { ChannelGrid } from "@/components/dashboard/ChannelGrid";
import { HealthStrip } from "@/components/dashboard/HealthStrip";
import { RecentConversations } from "@/components/dashboard/RecentConversations";
import { PM2Panel } from "@/components/dashboard/PM2Panel";

interface DetailedStats {
  messagesToday: number;
  messagesWeek: number;
  messagesMonth: number;
  activeSessions: number;
  avgResponseTime: number;
  costToday: number;
  costWeek: number;
  costMonth: number;
  dailyMessages: { date: string; count: number }[];
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { activeGateway } = useGateway();

  const { data: setupData } = useFetch<{ complete: boolean }>("/api/config/setup-complete");
  const isSetupComplete = setupData?.complete;

  useEffect(() => {
    if (isSetupComplete === false) {
      router.replace("/setup");
    } else if (isSetupComplete === true && status === "unauthenticated") {
      router.replace("/login");
    }
  }, [isSetupComplete, status, router]);

  const gatewayId = (session?.user as any)?.gatewayId;

  const { data: stats } = useFetch<DetailedStats>(
    gatewayId ? "/api/dashboard/stats" : null, 30000
  );

  const ownerName = (session?.user as any)?.name || "there";
  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <AppShell title="Dashboard">
      <div className="p-4 lg:p-8 overflow-auto h-full">
        <div className="flex flex-col gap-6 max-w-7xl mx-auto">

          {/* Welcome Header */}
          <div className="mb-2">
            <h1 className="text-2xl lg:text-3xl font-bold text-zinc-100">
              {getGreeting()}, {ownerName.split(" ")[0]}
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              {activeGateway?.name ? `${activeGateway.name} - ` : ""}{dateStr}
            </p>
          </div>

          {/* Hero Stats Row */}
          {!stats ? <StatsCardsSkeleton /> : <StatsCards stats={stats} />}

          {/* Chart + Gateway Overview */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              {stats?.dailyMessages ? (
                <ActivityChart data={stats.dailyMessages} />
              ) : (
                <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl h-64 animate-pulse" />
              )}
            </div>
            <GatewayOverview />
          </div>

          {/* Channels + Recent Activity */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ChannelGrid />
            </div>
            <RecentConversations />
          </div>

          {/* Health Strip + PM2 */}
          <HealthStrip />
          <PM2Panel />
        </div>
      </div>
    </AppShell>
  );
}
