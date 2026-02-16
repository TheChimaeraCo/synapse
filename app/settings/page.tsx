"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { GeneralTab } from "@/components/settings/GeneralTab";
import { ProviderTab } from "@/components/settings/ProviderTab";
import { ModelsTab } from "@/components/settings/ModelsTab";
import { ChannelsTab } from "@/components/settings/ChannelsTab";
import { MessagesTab } from "@/components/settings/MessagesTab";
import { UsageBudgetTab } from "@/components/settings/UsageBudgetTab";
import { ToolsTab } from "@/components/settings/ToolsTab";
import { SkillsTab } from "@/components/settings/SkillsTab";
import { SessionsTab } from "@/components/settings/SessionsTab";
import { VoiceTab } from "@/components/settings/VoiceTab";
import { AutomationTab } from "@/components/settings/AutomationTab";
import { GatewayTab } from "@/components/settings/GatewayTab";
import { GatewaysTab } from "@/components/settings/GatewaysTab";
import { SandboxTab } from "@/components/settings/SandboxTab";
import { LoggingTab } from "@/components/settings/LoggingTab";
import { EnvVarsTab } from "@/components/settings/EnvVarsTab";
import { PluginsTab } from "@/components/settings/PluginsTab";
import { BrowserTab } from "@/components/settings/BrowserTab";
import { SecurityTab } from "@/components/settings/SecurityTab";
import { AccountTab } from "@/components/settings/AccountTab";
import { AboutTab } from "@/components/settings/AboutTab";
import { AgentSoulTab } from "@/components/settings/AgentSoulTab";
import { LicenseTab } from "@/components/settings/LicenseTab";
import { NotificationsTab } from "@/components/settings/NotificationsTab";
import { MembersTab } from "@/components/settings/MembersTab";
import { SchedulerTab } from "@/components/settings/SchedulerTab";
import { PM2Tab } from "@/components/settings/PM2Tab";
import { ChangelogTab } from "@/components/settings/ChangelogTab";
import { WebhooksTab } from "@/components/settings/WebhooksTab";
import { UsageQuotasTab } from "@/components/settings/UsageQuotasTab";
import { SystemAlertsTab } from "@/components/settings/SystemAlertsTab";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Settings, Cpu, MessageSquare, BarChart3, User, Info, Wrench, Shield, Puzzle,
  Layers, Mic, Zap, Server, Terminal, FileText, Variable, Package, Globe, Clock, Monitor, Bell, Users, Sparkles, Tag, Webhook, AlertTriangle, PieChart
} from "lucide-react";

const tabs = [
  { id: "general", label: "General", icon: Settings },
  { id: "soul", label: "Agent Soul", icon: Sparkles },
  { id: "provider", label: "AI Provider", icon: Cpu },
  { id: "models", label: "Models", icon: Layers },
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

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("general");

  return (
    <AppShell title="Settings">
      <div className="flex flex-col md:flex-row gap-6 md:gap-8 h-full p-4 lg:p-6 overflow-auto">
        {/* Vertical tab nav */}
        <nav className="w-52 shrink-0 space-y-0.5 hidden md:block overflow-auto max-h-[calc(100vh-6rem)] pr-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200 text-left ${
                  isActive
                    ? "bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-blue-300 border border-blue-500/20 shadow-[0_0_20px_rgba(59,130,246,0.1)]"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
                }`}
              >
                <tab.icon className={`w-4 h-4 shrink-0 ${isActive ? "text-blue-400" : ""}`} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Mobile tab selector */}
        <div className="md:hidden w-full">
          <Select value={activeTab} onValueChange={(val) => setActiveTab(val as TabId)}>
            <SelectTrigger className="w-full mb-4 bg-white/[0.04] border-white/[0.08] text-zinc-200 rounded-xl">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {tabs.map((tab) => (
                <SelectItem key={tab.id} value={tab.id}>{tab.label}</SelectItem>
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
