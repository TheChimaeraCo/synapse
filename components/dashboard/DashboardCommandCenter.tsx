"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Circle,
  Clock3,
  Cpu,
  Gauge,
  Layers,
  MessageSquare,
  PlayCircle,
  ShieldAlert,
  Sparkles,
  Wallet,
  Workflow,
} from "lucide-react";
import { formatCost, formatRelativeTime } from "@/lib/utils";
import { QuickActions } from "@/components/dashboard/QuickActions";

export interface DashboardStats {
  messagesToday: number;
  messagesWeek: number;
  messagesMonth: number;
  activeSessions: number;
  avgResponseTime: number;
  costToday: number;
  costWeek: number;
  costMonth: number;
  dailyMessages: { date: string; count: number }[];
  taskCounts?: {
    todo: number;
    inProgress: number;
    blocked: number;
    done: number;
    total: number;
  };
  activeWorkers?: number;
  pendingApprovals?: number;
  autonomy?: {
    enabled?: boolean;
    lastTickAt?: number | null;
    lastDispatchAt?: number | null;
  };
}

export interface HealthData {
  convex: string;
  ai: { status: string; lastSuccess: number | null };
  channels: {
    id: string;
    name: string;
    platform: string;
    isActive: boolean;
    lastActivity: number | null;
  }[];
}

export interface ActivityEvent {
  id: string;
  type: string;
  content: string;
  role: string;
  sessionTitle: string;
  sessionId: string;
  cost?: number;
  latencyMs?: number;
  timestamp: number;
}

export interface ChannelRow {
  _id: string;
  name: string;
  platform: string;
  isActive: boolean;
  lastActivityAt?: number;
}

export interface TaskRow {
  _id: string;
  title: string;
  status: "todo" | "in_progress" | "blocked" | "done";
  priority: number;
  dueDate?: number;
}

export interface ApprovalRow {
  _id: string;
  toolName: string;
  status: "pending" | "approved" | "denied";
  requestedAt: number;
}

export interface PM2Process {
  name: string;
  pm_id: number;
  monit?: {
    cpu?: number;
    memory?: number;
  };
  pm2_env?: {
    status?: string;
    pm_uptime?: number;
    restart_time?: number;
  };
}

export interface ActiveAgent {
  _id: string;
  label?: string;
  status?: string;
  progress?: number;
  createdAt?: number;
}

interface DashboardCommandCenterProps {
  ownerFirstName: string;
  dateStr: string;
  gatewayName?: string;
  stats?: DashboardStats;
  statsError?: string | null;
  health?: HealthData;
  channels?: ChannelRow[];
  tasks?: TaskRow[];
  approvals?: { approvals: ApprovalRow[] };
  activity?: ActivityEvent[];
  pm2?: PM2Process[];
  activeAgents?: { agents: ActiveAgent[] };
}

function healthTone(status: string): string {
  if (status === "healthy" || status === "active" || status === "online") return "text-emerald-300 border-emerald-400/30 bg-emerald-500/10";
  if (status === "degraded" || status === "stale") return "text-amber-300 border-amber-400/30 bg-amber-500/10";
  return "text-red-300 border-red-400/30 bg-red-500/10";
}

function shortDateLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

function calcPercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

export function DashboardCommandCenter({
  ownerFirstName,
  dateStr,
  gatewayName,
  stats,
  statsError,
  health,
  channels,
  tasks,
  approvals,
  activity,
  pm2,
  activeAgents,
}: DashboardCommandCenterProps) {
  const daily = stats?.dailyMessages ?? [];
  const maxDaily = Math.max(...daily.map((d) => d.count), 1);

  const pendingApprovals = approvals?.approvals?.length ?? stats?.pendingApprovals ?? 0;
  const runningWorkers = stats?.activeWorkers ?? 0;
  const taskCounts = stats?.taskCounts;

  const currentTasks = (tasks ?? []).filter((task) => task.status !== "done");
  const urgentTasks = currentTasks
    .filter((task) => Boolean(task.dueDate) && (task.dueDate as number) <= Date.now() + 24 * 60 * 60 * 1000)
    .sort((a, b) => (a.dueDate ?? Number.MAX_SAFE_INTEGER) - (b.dueDate ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 4);

  const channelRows = channels ?? [];
  const activeChannelCount = channelRows.filter((ch) => ch.isActive).length;

  const pm2Rows = pm2 ?? [];
  const onlineProcesses = pm2Rows.filter((proc) => proc.pm2_env?.status === "online").length;

  const feed = (activity ?? []).slice(0, 8);
  const agents = (activeAgents?.agents ?? []).filter((agent) => agent.status === "running" || agent.status === "active");

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-3xl border border-white/[0.12] bg-[linear-gradient(145deg,rgba(16,185,129,0.16),rgba(6,182,212,0.08)_34%,rgba(15,23,42,0.72))] px-5 py-5 shadow-[0_18px_45px_rgba(5,10,24,0.38)] sm:px-7 sm:py-7">
        <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr] xl:items-end">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-cyan-100/90">
              <Sparkles className="h-3.5 w-3.5" />
              Mission Control
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              {ownerFirstName}, here&apos;s your operations board.
            </h1>
            <p className="mt-2 text-sm text-zinc-200/85">
              {gatewayName ? `${gatewayName} - ` : ""}{dateStr}
            </p>
            {statsError ? (
              <p className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                <AlertTriangle className="h-4 w-4" />
                Stats feed is currently unavailable.
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-3">
              <p className="text-[11px] text-zinc-400">Messages Today</p>
              <p className="mt-1 text-2xl font-semibold text-white">{stats?.messagesToday ?? "-"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-3">
              <p className="text-[11px] text-zinc-400">Active Sessions</p>
              <p className="mt-1 text-2xl font-semibold text-white">{stats?.activeSessions ?? "-"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-3">
              <p className="text-[11px] text-zinc-400">Run Cost Today</p>
              <p className="mt-1 text-2xl font-semibold text-white">{typeof stats?.costToday === "number" ? formatCost(stats.costToday) : "-"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-3">
              <p className="text-[11px] text-zinc-400">Avg Latency</p>
              <p className="mt-1 text-2xl font-semibold text-white">{typeof stats?.avgResponseTime === "number" ? `${stats.avgResponseTime}ms` : "-"}</p>
            </div>
          </div>
        </div>
      </section>

      <QuickActions />

      <section className="grid gap-4 xl:grid-cols-12">
        <article className="xl:col-span-8 rounded-3xl border border-white/[0.1] bg-white/[0.04] p-5 shadow-[0_10px_32px_rgba(3,8,20,0.32)] sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-zinc-400">Throughput</p>
              <h2 className="mt-1 text-lg font-semibold text-zinc-100">Message Velocity</h2>
            </div>
            <span className="rounded-full border border-cyan-300/25 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-200">
              {stats?.messagesWeek ?? 0} this week
            </span>
          </div>

          <div className="h-44 rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-4">
            {daily.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">No message history yet.</div>
            ) : (
              <div className="flex h-full items-end gap-2">
                {daily.map((point) => {
                  const barHeight = Math.max(8, Math.round((point.count / maxDaily) * 100));
                  return (
                    <div key={point.date} className="flex flex-1 flex-col items-center gap-2">
                      <div className="relative flex h-32 w-full items-end">
                        <div
                          className="w-full rounded-t-md bg-[linear-gradient(180deg,rgba(56,189,248,0.95),rgba(16,185,129,0.82))]"
                          style={{ height: `${barHeight}%` }}
                          title={`${point.count} messages`}
                        />
                      </div>
                      <span className="text-[10px] uppercase tracking-wide text-zinc-500">{shortDateLabel(point.date)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <MetricChip icon={MessageSquare} label="Month" value={`${stats?.messagesMonth ?? 0}`} />
            <MetricChip icon={Wallet} label="Week Cost" value={typeof stats?.costWeek === "number" ? formatCost(stats.costWeek) : "-"} />
            <MetricChip icon={Clock3} label="Autonomy Tick" value={stats?.autonomy?.lastTickAt ? formatRelativeTime(stats.autonomy.lastTickAt) : "idle"} />
          </div>
        </article>

        <article className="xl:col-span-4 rounded-3xl border border-white/[0.1] bg-white/[0.04] p-5 shadow-[0_10px_32px_rgba(3,8,20,0.32)] sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-zinc-400">Execution State</p>
              <h2 className="mt-1 text-lg font-semibold text-zinc-100">Operations Pulse</h2>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] ${stats?.autonomy?.enabled ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200" : "border-zinc-500/35 bg-zinc-500/10 text-zinc-300"}`}>
              {stats?.autonomy?.enabled ? "Autonomy ON" : "Autonomy OFF"}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            <StateRow icon={Workflow} label="Pending approvals" value={String(pendingApprovals)} tone={pendingApprovals > 0 ? "warn" : "ok"} />
            <StateRow icon={Bot} label="Running agents" value={String(runningWorkers)} tone={runningWorkers > 0 ? "ok" : "neutral"} />
            <StateRow icon={Layers} label="Active channels" value={`${activeChannelCount}/${channelRows.length || 0}`} tone={activeChannelCount > 0 ? "ok" : "warn"} />
            <StateRow icon={Cpu} label="PM2 online" value={`${onlineProcesses}/${pm2Rows.length || 0}`} tone={onlineProcesses > 0 ? "ok" : "warn"} />
          </div>

          {taskCounts ? (
            <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/45 p-3">
              <p className="text-xs text-zinc-400">Task Pipeline</p>
              <div className="mt-2 space-y-2">
                <ProgressLine label="In Progress" value={taskCounts.inProgress} total={taskCounts.total} color="from-cyan-400 to-sky-400" />
                <ProgressLine label="Blocked" value={taskCounts.blocked} total={taskCounts.total} color="from-amber-400 to-orange-400" />
                <ProgressLine label="Done" value={taskCounts.done} total={taskCounts.total} color="from-emerald-400 to-teal-400" />
              </div>
            </div>
          ) : null}
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="rounded-3xl border border-white/[0.1] bg-white/[0.04] p-5 shadow-[0_10px_32px_rgba(3,8,20,0.32)] sm:p-6">
          <header className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-zinc-100">Queue Risk</h3>
            <ShieldAlert className="h-4 w-4 text-amber-300" />
          </header>
          {urgentTasks.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-slate-950/45 px-3 py-3 text-sm text-zinc-400">No urgent due dates in the next 24 hours.</p>
          ) : (
            <div className="space-y-2">
              {urgentTasks.map((task) => (
                <div key={task._id} className="rounded-xl border border-amber-300/20 bg-amber-500/10 px-3 py-2">
                  <p className="text-sm font-medium text-amber-100">{task.title}</p>
                  <p className="text-xs text-amber-200/80">Due {task.dueDate ? formatRelativeTime(task.dueDate) : "soon"}</p>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="rounded-3xl border border-white/[0.1] bg-white/[0.04] p-5 shadow-[0_10px_32px_rgba(3,8,20,0.32)] sm:p-6">
          <header className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-zinc-100">Channel Readiness</h3>
            <Gauge className="h-4 w-4 text-cyan-300" />
          </header>
          <div className="space-y-2">
            {channelRows.slice(0, 6).map((channel) => (
              <div key={channel._id} className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/45 px-3 py-2">
                <div>
                  <p className="text-sm text-zinc-200">{channel.name}</p>
                  <p className="text-xs uppercase tracking-wide text-zinc-500">{channel.platform}</p>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] ${channel.isActive ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200" : "border-zinc-500/35 bg-zinc-500/10 text-zinc-300"}`}>
                  {channel.isActive ? "active" : "paused"}
                </span>
              </div>
            ))}
            {channelRows.length === 0 ? (
              <p className="text-sm text-zinc-500">No channels configured.</p>
            ) : null}
          </div>
        </article>

        <article className="rounded-3xl border border-white/[0.1] bg-white/[0.04] p-5 shadow-[0_10px_32px_rgba(3,8,20,0.32)] sm:p-6">
          <header className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-zinc-100">Runtime Health</h3>
            <Activity className="h-4 w-4 text-emerald-300" />
          </header>

          <div className="space-y-2">
            <HealthPill label="Database" status={health?.convex ?? "unknown"} />
            <HealthPill label="AI Provider" status={health?.ai?.status ?? "unknown"} sub={health?.ai?.lastSuccess ? `Last success ${formatRelativeTime(health.ai.lastSuccess)}` : undefined} />
            <HealthPill label="PM2" status={onlineProcesses > 0 ? "online" : "offline"} sub={`${onlineProcesses}/${pm2Rows.length || 0} online`} />
          </div>

          <Link href="/settings" className="mt-4 inline-flex items-center gap-2 text-xs text-cyan-200 transition-colors hover:text-cyan-100">
            Open runtime settings
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-12">
        <article className="xl:col-span-8 rounded-3xl border border-white/[0.1] bg-white/[0.04] p-5 shadow-[0_10px_32px_rgba(3,8,20,0.32)] sm:p-6">
          <header className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-zinc-100">Live Ops Feed</h3>
            <PlayCircle className="h-4 w-4 text-cyan-300" />
          </header>
          {feed.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-slate-950/45 px-3 py-3 text-sm text-zinc-500">No recent events yet.</p>
          ) : (
            <div className="space-y-2">
              {feed.map((event) => (
                <div key={event.id} className="rounded-xl border border-white/10 bg-slate-950/45 px-3 py-2.5">
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                    <span className={`rounded-full border px-1.5 py-0.5 ${event.role === "assistant" ? "border-cyan-300/30 bg-cyan-500/10 text-cyan-200" : "border-zinc-500/30 bg-zinc-500/10 text-zinc-300"}`}>
                      {event.role}
                    </span>
                    <span>{event.sessionTitle}</span>
                    <span>•</span>
                    <span>{formatRelativeTime(event.timestamp)}</span>
                  </div>
                  <p className="mt-1 text-sm text-zinc-200">{event.content}</p>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="xl:col-span-4 rounded-3xl border border-white/[0.1] bg-white/[0.04] p-5 shadow-[0_10px_32px_rgba(3,8,20,0.32)] sm:p-6">
          <header className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-zinc-100">Active Agents</h3>
            <Bot className="h-4 w-4 text-cyan-300" />
          </header>
          {agents.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-slate-950/45 px-3 py-3 text-sm text-zinc-500">No agents currently running.</p>
          ) : (
            <div className="space-y-2">
              {agents.slice(0, 6).map((agent) => (
                <div key={agent._id} className="rounded-xl border border-cyan-300/20 bg-cyan-500/10 px-3 py-2.5">
                  <p className="text-sm font-medium text-cyan-100">{agent.label || "Worker"}</p>
                  <p className="text-xs text-cyan-200/85">
                    {typeof agent.progress === "number" ? `${Math.round(agent.progress)}% progress` : "Running"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}

function MetricChip({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/45 px-3 py-2">
      <p className="flex items-center gap-1 text-[11px] text-zinc-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-zinc-100">{value}</p>
    </div>
  );
}

function StateRow({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: "ok" | "warn" | "neutral";
}) {
  const toneClass =
    tone === "ok"
      ? "text-emerald-200"
      : tone === "warn"
        ? "text-amber-200"
        : "text-zinc-300";

  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/45 px-3 py-2">
      <p className="flex items-center gap-2 text-sm text-zinc-300">
        <Icon className="h-4 w-4 text-zinc-500" />
        {label}
      </p>
      <p className={`text-sm font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function ProgressLine({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = calcPercent(value, total);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-400">
        <span>{label}</span>
        <span>{value} ({pct}%)</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-800/70">
        <div className={`h-full bg-gradient-to-r ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function HealthPill({
  label,
  status,
  sub,
}: {
  label: string;
  status: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/45 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-zinc-300">{label}</p>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] capitalize ${healthTone(status)}`}>
          <Circle className="h-2.5 w-2.5 fill-current" />
          {status}
        </span>
      </div>
      {sub ? <p className="mt-1 text-[11px] text-zinc-500">{sub}</p> : null}
    </div>
  );
}
