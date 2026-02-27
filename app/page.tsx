"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useFetch } from "@/lib/hooks";
import { useGateway } from "@/contexts/GatewayContext";
import { AppShell } from "@/components/layout/AppShell";
import {
  ActiveAgent,
  ActivityEvent,
  ApprovalRow,
  ChannelRow,
  DashboardCommandCenter,
  DashboardStats,
  HealthData,
  PM2Process,
  TaskRow,
} from "@/components/dashboard/DashboardCommandCenter";
import { PM2Panel } from "@/components/dashboard/PM2Panel";

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

  const gatewayId = (session?.user as { gatewayId?: string } | undefined)?.gatewayId;

  const { data: stats, error: statsError } = useFetch<DashboardStats>(
    gatewayId ? "/api/dashboard/stats" : null,
    30000,
  );
  const { data: health } = useFetch<HealthData>(gatewayId ? "/api/dashboard/health" : null, 30000);
  const { data: channels } = useFetch<ChannelRow[]>(gatewayId ? "/api/channels" : null, 30000);
  const { data: tasks } = useFetch<TaskRow[]>(gatewayId ? "/api/tasks" : null, 30000);
  const { data: approvals } = useFetch<{ approvals: ApprovalRow[] }>(gatewayId ? "/api/approvals" : null, 30000);
  const { data: activity } = useFetch<ActivityEvent[]>(gatewayId ? "/api/dashboard/activity" : null, 30000);
  const { data: pm2 } = useFetch<PM2Process[]>(gatewayId ? "/api/pm2" : null, 30000);
  const { data: activeAgents } = useFetch<{ agents: ActiveAgent[] }>(gatewayId ? "/api/agents/active" : null, 15000);

  const ownerName = (session?.user as { name?: string } | undefined)?.name || "there";
  const firstName = ownerName.split(" ")[0] || ownerName;
  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <AppShell title="Dashboard">
      <div className="h-full overflow-auto p-4 lg:p-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 animate-fade-in">
          <DashboardCommandCenter
            ownerFirstName={`${getGreeting()}, ${firstName}`}
            dateStr={dateStr}
            gatewayName={activeGateway?.name}
            stats={stats}
            statsError={statsError}
            health={health}
            channels={channels}
            tasks={tasks}
            approvals={approvals}
            activity={activity}
            pm2={pm2}
            activeAgents={activeAgents}
          />

          <section className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-3 sm:p-4">
            <PM2Panel />
          </section>
        </div>
      </div>
    </AppShell>
  );
}
