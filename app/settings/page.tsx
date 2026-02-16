"use client";

import { useState, useEffect, Suspense } from "react";
import dynamic from "next/dynamic";
import { AppShell } from "@/components/layout/AppShell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// --- Tab skeleton for lazy loading ---
function TabSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-white/[0.06] rounded-lg" />
      <div className="h-4 w-72 bg-white/[0.04] rounded" />
      <div className="space-y-3 mt-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-12 bg-white/[0.04] rounded-xl" />
        ))}
      </div>
    </div>
  );
}

// --- Lazy-loaded tab components ---
const lazyTab = (importFn: () => Promise<any>, name: string) =>
  dynamic(() => importFn().then((m: any) => ({ default: m[name] })), {
    loading: () => <TabSkeleton />,
  });

const GeneralTab = lazyTab(() => import("@/components/settings/GeneralTab"), "GeneralTab");
const ProviderTab = lazyTab(() => import("@/components/settings/ProviderTab"), "ProviderTab");
const ModelsTab = lazyTab(() => import("@/components/settings/ModelsTab"), "ModelsTab");
const ChannelsTab = lazyTab(() => import("@/components/settings/ChannelsTab"), "ChannelsTab");
const MessagesTab = lazyTab(() => import("@/components/settings/MessagesTab"), "MessagesTab");
const UsageBudgetTab = lazyTab(() => import("@/components/settings/UsageBudgetTab"), "UsageBudgetTab");
const ToolsTab = lazyTab(() => import("@/components/settings/ToolsTab"), "ToolsTab");
const SkillsTab = lazyTab(() => import("@/components/settings/SkillsTab"), "SkillsTab");
const SessionsTab = lazyTab(() => import("@/components/settings/SessionsTab"), "SessionsTab");
const VoiceTab = lazyTab(() => import("@/components/settings/VoiceTab"), "VoiceTab");
const AutomationTab = lazyTab(() => import("@/components/settings/AutomationTab"), "AutomationTab");
const GatewayTab = lazyTab(() => import("@/components/settings/GatewayTab"), "GatewayTab");
const GatewaysTab = lazyTab(() => import("@/components/settings/GatewaysTab"), "GatewaysTab");
const SandboxTab = lazyTab(() => import("@/components/settings/SandboxTab"), "SandboxTab");
const LoggingTab = lazyTab(() => import("@/components/settings/LoggingTab"), "LoggingTab");
const EnvVarsTab = lazyTab(() => import("@/components/settings/EnvVarsTab"), "EnvVarsTab");
const PluginsTab = lazyTab(() => import("@/components/settings/PluginsTab"), "PluginsTab");
const BrowserTab = lazyTab(() => import("@/components/settings/BrowserTab"), "BrowserTab");
const SecurityTab = lazyTab(() => import("@/components/settings/SecurityTab"), "SecurityTab");
const AccountTab = lazyTab(() => import("@/components/settings/AccountTab"), "AccountTab");
const AboutTab = lazyTab(() => import("@/components/settings/AboutTab"), "AboutTab");
const AgentSoulTab = lazyTab(() => import("@/components/settings/AgentSoulTab"), "AgentSoulTab");
const LicenseTab = lazyTab(() => import("@/components/settings/LicenseTab"), "LicenseTab");
const NotificationsTab = lazyTab(() => import("@/components/settings/NotificationsTab"), "NotificationsTab");
const MembersTab = lazyTab(() => import("@/components/settings/MembersTab"), "MembersTab");
const SchedulerTab = lazyTab(() => import("@/components/settings/SchedulerTab"), "SchedulerTab");
const PM2Tab = lazyTab(() => import("@/components/settings/PM2Tab"), "PM2Tab");
const ChangelogTab = lazyTab(() => import("@/components/settings/ChangelogTab"), "ChangelogTab");
const WebhooksTab = lazyTab(() => import("@/components/settings/WebhooksTab"), "WebhooksTab");
const UsageQuotasTab = lazyTab(() => import("@/components/settings/UsageQuotasTab"), "UsageQuotasTab");
const ModelRoutingTab = lazyTab(() => import("@/components/settings/ModelRoutingTab"), "ModelRoutingTab");
const SystemAlertsTab = lazyTab(() => import("@/components/settings/SystemAlertsTab"), "SystemAlertsTab");
import {
  Settings, Cpu, MessageSquare, BarChart3, User, Info, Wrench, Shield, Puzzle,
  Layers, Mic, Zap, Server, Terminal, FileText, Variable, Package, Globe, Clock,
  Monitor, Bell, Users, Sparkles, Tag, Webhook, AlertTriangle, PieChart,
  ChevronDown, Database, Lock, Cog
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// --- Tab definitions (unchanged) ---
const tabs = [
  { id: "general", label: "General", icon: Settings },
  { id: "soul", label: "Agent Soul", icon: Sparkles },
  { id: "provider", label: "AI Provider", icon: Cpu },
  { id: "models", label: "Models", icon: Layers },
  { id: "routing", label: "Model Routing", icon: Layers },
  { id: "channels", label: "Channels", icon: MessageSquare },
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "usage", label: "Usage & Budget", icon: BarChart3 },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "skills", label: "Skills", icon: Puzzle },
  { id: "sessions", label: "Sessions", icon: Clock },
  { id: "voice", label: "Voice / TTS", icon: Mic },
  { id: "scheduler", label: "Scheduler", icon: Clock },
  { id: "automation", label: "Automation", icon: Zap },
  { id: "gateway", label: "Gateway", icon: Server },
  { id: "gateways", label: "Gateways", icon: Server },
  { id: "members", label: "Members", icon: Users },
  { id: "sandbox", label: "Sandbox", icon: Terminal },
  { id: "logging", label: "Logging", icon: FileText },
  { id: "envvars", label: "Env Vars", icon: Variable },
  { id: "plugins", label: "Plugins", icon: Package },
  { id: "browser", label: "Browser", icon: Globe },
  { id: "pm2", label: "PM2", icon: Monitor },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "license", label: "License", icon: Shield },
  { id: "security", label: "Security", icon: Shield },
  { id: "account", label: "Account", icon: User },
  { id: "webhooks", label: "Webhooks", icon: Globe },
  { id: "quotas", label: "Usage Quotas", icon: PieChart },
  { id: "alerts", label: "System Alerts", icon: AlertTriangle },
  { id: "changelog", label: "Changelog", icon: Tag },
  { id: "about", label: "About", icon: Info },
] as const;

type TabId = (typeof tabs)[number]["id"];

// --- Category groupings ---
interface Category {
  id: string;
  label: string;
  icon: LucideIcon;
  tabs: TabId[];
}

const categories: Category[] = [
  {
    id: "general",
    label: "General",
    icon: Settings,
    tabs: ["general", "soul", "provider", "models", "routing", "voice"],
  },
  {
    id: "channels",
    label: "Channels",
    icon: MessageSquare,
    tabs: ["channels", "messages", "notifications"],
  },
  {
    id: "tools",
    label: "Tools & Skills",
    icon: Wrench,
    tabs: ["tools", "skills", "plugins", "browser", "sandbox"],
  },
  {
    id: "automation",
    label: "Automation",
    icon: Zap,
    tabs: ["automation", "webhooks", "scheduler"],
  },
  {
    id: "data",
    label: "Data & Sessions",
    icon: Database,
    tabs: ["sessions", "usage", "quotas", "alerts"],
  },
  {
    id: "security",
    label: "Security & Access",
    icon: Lock,
    tabs: ["security", "account", "members", "license"],
  },
  {
    id: "system",
    label: "System",
    icon: Cog,
    tabs: ["gateway", "gateways", "logging", "envvars", "pm2", "changelog", "about"],
  },
];

const tabMap = Object.fromEntries(tabs.map((t) => [t.id, t]));

function findCategoryForTab(tabId: TabId): string {
  return categories.find((c) => c.tabs.includes(tabId))?.id ?? "general";
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => new Set(["general"])
  );

  // Auto-expand category when active tab changes
  useEffect(() => {
    const cat = findCategoryForTab(activeTab);
    setExpandedCategories((prev) => {
      if (prev.has(cat)) return prev;
      const next = new Set(prev);
      next.add(cat);
      return next;
    });
  }, [activeTab]);

  const toggleCategory = (catId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  // Flat list for mobile select, grouped by category
  const mobileOptions = categories.flatMap((cat) =>
    cat.tabs.map((tId) => ({ ...tabMap[tId], category: cat.label }))
  );

  return (
    <AppShell title="Settings">
      <div className="flex flex-col md:flex-row gap-6 md:gap-8 h-full p-4 lg:p-6 overflow-auto">
        {/* Desktop: categorized sidebar */}
        <nav className="w-56 shrink-0 hidden md:block overflow-auto max-h-[calc(100vh-6rem)] pr-1 space-y-1">
          {categories.map((cat) => {
            const isExpanded = expandedCategories.has(cat.id);
            const activeCat = findCategoryForTab(activeTab) === cat.id;

            return (
              <div key={cat.id}>
                {/* Category header */}
                <button
                  onClick={() => toggleCategory(cat.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-semibold tracking-wide uppercase transition-colors duration-150 ${
                    activeCat
                      ? "text-blue-300"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <cat.icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 text-left">{cat.label}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                      isExpanded ? "" : "-rotate-90"
                    }`}
                  />
                </button>

                {/* Tab items */}
                {isExpanded && (
                  <div className="ml-3 pl-3 border-l border-white/[0.06] space-y-0.5 pb-2">
                    {cat.tabs.map((tId) => {
                      const tab = tabMap[tId];
                      if (!tab) return null;
                      const isActive = activeTab === tId;
                      return (
                        <button
                          key={tId}
                          onClick={() => setActiveTab(tId)}
                          className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-all duration-150 text-left ${
                            isActive
                              ? "bg-blue-500/10 text-blue-300"
                              : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                          }`}
                        >
                          <tab.icon
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isActive ? "text-blue-400" : "text-zinc-500"
                            }`}
                          />
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Mobile: grouped select */}
        <div className="md:hidden w-full">
          <Select value={activeTab} onValueChange={(val) => setActiveTab(val as TabId)}>
            <SelectTrigger className="w-full mb-4 bg-white/[0.04] border-white/[0.08] text-zinc-200 rounded-xl">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <div key={cat.id}>
                  <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    {cat.label}
                  </div>
                  {cat.tabs.map((tId) => {
                    const tab = tabMap[tId];
                    if (!tab) return null;
                    return (
                      <SelectItem key={tId} value={tId}>
                        {tab.label}
                      </SelectItem>
                    );
                  })}
                </div>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tab content */}
        <div className="flex-1 min-w-0 overflow-auto">
          {activeTab === "general" && <GeneralTab />}
          {activeTab === "soul" && <AgentSoulTab />}
          {activeTab === "provider" && <ProviderTab />}
          {activeTab === "models" && <ModelsTab />}
          {activeTab === "routing" && <ModelRoutingTab />}
          {activeTab === "channels" && <ChannelsTab />}
          {activeTab === "messages" && <MessagesTab />}
          {activeTab === "usage" && <UsageBudgetTab />}
          {activeTab === "tools" && <ToolsTab />}
          {activeTab === "skills" && <SkillsTab />}
          {activeTab === "sessions" && <SessionsTab />}
          {activeTab === "voice" && <VoiceTab />}
          {activeTab === "scheduler" && <SchedulerTab />}
          {activeTab === "automation" && <AutomationTab />}
          {activeTab === "gateway" && <GatewayTab />}
          {activeTab === "gateways" && <GatewaysTab />}
          {activeTab === "sandbox" && <SandboxTab />}
          {activeTab === "logging" && <LoggingTab />}
          {activeTab === "envvars" && <EnvVarsTab />}
          {activeTab === "plugins" && <PluginsTab />}
          {activeTab === "browser" && <BrowserTab />}
          {activeTab === "pm2" && <PM2Tab />}
          {activeTab === "members" && <MembersTab />}
          {activeTab === "notifications" && <NotificationsTab />}
          {activeTab === "license" && <LicenseTab />}
          {activeTab === "security" && <SecurityTab />}
          {activeTab === "account" && <AccountTab />}
          {activeTab === "webhooks" && <WebhooksTab />}
          {activeTab === "quotas" && <UsageQuotasTab />}
          {activeTab === "alerts" && <SystemAlertsTab />}
          {activeTab === "changelog" && <ChangelogTab />}
          {activeTab === "about" && <AboutTab />}
        </div>
      </div>
    </AppShell>
  );
}
