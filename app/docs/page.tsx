"use client";

import { AppShell } from "@/components/layout/AppShell";
import { useState } from "react";
import { ChevronDown, ChevronRight, Lock, Globe, Shield } from "lucide-react";

interface Endpoint {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  auth: "session" | "gateway" | "api-key" | "none";
  description: string;
  body?: string;
  response?: string;
}

interface Category {
  name: string;
  endpoints: Endpoint[];
}

const methodColors: Record<string, string> = {
  GET: "text-green-400 bg-green-500/10",
  POST: "text-blue-400 bg-blue-500/10",
  PUT: "text-yellow-400 bg-yellow-500/10",
  DELETE: "text-red-400 bg-red-500/10",
  PATCH: "text-orange-400 bg-orange-500/10",
};

const authIcons: Record<string, { icon: typeof Lock; label: string; color: string }> = {
  session: { icon: Lock, label: "Session Auth", color: "text-yellow-400" },
  gateway: { icon: Shield, label: "Gateway Auth", color: "text-blue-400" },
  "api-key": { icon: Shield, label: "API Key", color: "text-purple-400" },
  none: { icon: Globe, label: "Public", color: "text-green-400" },
};

const categories: Category[] = [
  {
    name: "Chat",
    endpoints: [
      { method: "POST", path: "/api/chat", auth: "gateway", description: "Send a chat message (non-streaming)", body: '{ sessionId, message, model? }', response: '{ reply, usage }' },
      { method: "POST", path: "/api/chat/stream", auth: "gateway", description: "Send a chat message (SSE streaming)", body: '{ sessionId, message, model? }', response: 'SSE stream' },
    ],
  },
  {
    name: "Sessions",
    endpoints: [
      { method: "GET", path: "/api/sessions", auth: "gateway", description: "List sessions for current gateway" },
      { method: "POST", path: "/api/sessions", auth: "gateway", description: "Create a new session", body: '{ agentId, title? }' },
      { method: "GET", path: "/api/sessions/recent", auth: "gateway", description: "Get recent sessions" },
      { method: "GET", path: "/api/sessions/[id]", auth: "gateway", description: "Get session by ID" },
      { method: "DELETE", path: "/api/sessions/[id]", auth: "gateway", description: "Delete a session" },
      { method: "GET", path: "/api/sessions/[id]/messages", auth: "gateway", description: "Get messages for a session" },
    ],
  },
  {
    name: "Conversations",
    endpoints: [
      { method: "GET", path: "/api/conversations", auth: "gateway", description: "List conversations" },
      { method: "POST", path: "/api/conversations", auth: "gateway", description: "Create conversation" },
      { method: "GET", path: "/api/conversations/[id]", auth: "gateway", description: "Get conversation" },
      { method: "GET", path: "/api/conversations/[id]/messages", auth: "gateway", description: "Get conversation messages" },
      { method: "POST", path: "/api/conversations/link", auth: "gateway", description: "Link conversation to project" },
    ],
  },
  {
    name: "Files",
    endpoints: [
      { method: "GET", path: "/api/files/browse", auth: "gateway", description: "Browse workspace files", response: '{ files: [...] }' },
      { method: "POST", path: "/api/files/action", auth: "gateway", description: "File actions (create, rename, delete)", body: '{ action, path, ... }' },
      { method: "POST", path: "/api/files/upload", auth: "gateway", description: "Upload a file" },
      { method: "POST", path: "/api/files/fs-upload", auth: "gateway", description: "Upload to filesystem" },
      { method: "GET", path: "/api/files/download", auth: "gateway", description: "Download a file" },
    ],
  },
  {
    name: "Knowledge",
    endpoints: [
      { method: "GET", path: "/api/knowledge", auth: "gateway", description: "List knowledge entries" },
      { method: "POST", path: "/api/knowledge", auth: "gateway", description: "Create/update knowledge entry" },
      { method: "DELETE", path: "/api/knowledge", auth: "gateway", description: "Delete knowledge entry" },
      { method: "POST", path: "/api/knowledge/search", auth: "gateway", description: "Semantic search knowledge" },
    ],
  },
  {
    name: "Config",
    endpoints: [
      { method: "GET", path: "/api/config", auth: "gateway", description: "Get a config value by key" },
      { method: "POST", path: "/api/config", auth: "gateway", description: "Set a config value" },
      { method: "GET", path: "/api/config/all", auth: "gateway", description: "Get all config for gateway" },
      { method: "POST", path: "/api/config/bulk", auth: "gateway", description: "Set multiple config values" },
      { method: "GET", path: "/api/config/models", auth: "gateway", description: "List available models" },
      { method: "POST", path: "/api/config/test-provider", auth: "gateway", description: "Test AI provider connection" },
    ],
  },
  {
    name: "PM2",
    endpoints: [
      { method: "GET", path: "/api/pm2", auth: "gateway", description: "List PM2 processes" },
      { method: "POST", path: "/api/pm2", auth: "gateway", description: "PM2 action (start/stop/restart/delete)", body: '{ action, name }' },
      { method: "GET", path: "/api/pm2/logs", auth: "gateway", description: "Get PM2 process logs" },
    ],
  },
  {
    name: "Gateways",
    endpoints: [
      { method: "GET", path: "/api/gateways", auth: "session", description: "List user's gateways" },
      { method: "POST", path: "/api/gateways", auth: "session", description: "Create a new gateway" },
      { method: "GET", path: "/api/gateways/[id]", auth: "gateway", description: "Get gateway details" },
      { method: "PATCH", path: "/api/gateways/[id]", auth: "gateway", description: "Update gateway" },
      { method: "GET", path: "/api/gateways/[id]/members", auth: "gateway", description: "List gateway members" },
      { method: "POST", path: "/api/gateways/[id]/invites", auth: "gateway", description: "Create invite link" },
    ],
  },
  {
    name: "Health",
    endpoints: [
      { method: "GET", path: "/api/health", auth: "none", description: "Health check with system info" },
      { method: "GET", path: "/api/health/ping", auth: "none", description: "Simple ping/pong" },
    ],
  },
  {
    name: "Channels",
    endpoints: [
      { method: "GET", path: "/api/channels", auth: "gateway", description: "List configured channels" },
      { method: "POST", path: "/api/channels", auth: "gateway", description: "Create/update a channel" },
      { method: "POST", path: "/api/channels/api-message", auth: "api-key", description: "Send message via channel API key", body: '{ message, sessionId? }' },
    ],
  },
  {
    name: "Tools & Skills",
    endpoints: [
      { method: "GET", path: "/api/tools", auth: "gateway", description: "List available tools" },
      { method: "GET", path: "/api/skills", auth: "gateway", description: "List skills" },
      { method: "POST", path: "/api/skills", auth: "gateway", description: "Create/update skill" },
    ],
  },
  {
    name: "Voice",
    endpoints: [
      { method: "POST", path: "/api/voice/tts", auth: "gateway", description: "Text-to-speech synthesis" },
      { method: "POST", path: "/api/voice/stt", auth: "gateway", description: "Speech-to-text transcription" },
    ],
  },
  {
    name: "Scheduler",
    endpoints: [
      { method: "GET", path: "/api/scheduler", auth: "gateway", description: "List scheduled tasks" },
      { method: "POST", path: "/api/scheduler", auth: "gateway", description: "Create scheduled task" },
      { method: "DELETE", path: "/api/scheduler/[id]", auth: "gateway", description: "Delete scheduled task" },
    ],
  },
  {
    name: "Projects",
    endpoints: [
      { method: "GET", path: "/api/projects", auth: "gateway", description: "List projects" },
      { method: "POST", path: "/api/projects", auth: "gateway", description: "Create project" },
      { method: "GET", path: "/api/projects/[id]", auth: "gateway", description: "Get project details" },
      { method: "PATCH", path: "/api/projects/[id]", auth: "gateway", description: "Update project" },
    ],
  },
  {
    name: "Auth & Users",
    endpoints: [
      { method: "POST", path: "/api/auth/register", auth: "none", description: "Register a new user" },
      { method: "GET", path: "/api/users", auth: "session", description: "List users" },
      { method: "GET", path: "/api/users/role", auth: "session", description: "Get current user role" },
    ],
  },
];

function CategorySection({ category }: { category: Category }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/[0.03] transition-colors"
      >
        <h2 className="text-sm font-semibold text-zinc-200">{category.name}</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">{category.endpoints.length} endpoints</span>
          {expanded ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-white/[0.06]">
          {category.endpoints.map((ep, i) => {
            const authInfo = authIcons[ep.auth];
            const AuthIcon = authInfo.icon;
            return (
              <div key={i} className="px-5 py-3 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-3 mb-1">
                  <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${methodColors[ep.method]}`}>
                    {ep.method}
                  </span>
                  <code className="text-sm text-zinc-300 font-mono">{ep.path}</code>
                  <div className="ml-auto flex items-center gap-1" title={authInfo.label}>
                    <AuthIcon className={`w-3.5 h-3.5 ${authInfo.color}`} />
                    <span className={`text-xs ${authInfo.color}`}>{authInfo.label}</span>
                  </div>
                </div>
                <p className="text-xs text-zinc-500 ml-[72px]">{ep.description}</p>
                {(ep.body || ep.response) && (
                  <div className="flex gap-4 ml-[72px] mt-1">
                    {ep.body && <span className="text-xs text-zinc-600">Body: <code className="text-zinc-500">{ep.body}</code></span>}
                    {ep.response && <span className="text-xs text-zinc-600">Response: <code className="text-zinc-500">{ep.response}</code></span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DocsPage() {
  const totalEndpoints = categories.reduce((sum, c) => sum + c.endpoints.length, 0);

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-100 mb-2">API Documentation</h1>
          <p className="text-zinc-500 text-sm">
            {totalEndpoints} endpoints across {categories.length} categories. All gateway-scoped routes require the{" "}
            <code className="text-zinc-400 bg-white/[0.06] px-1.5 py-0.5 rounded text-xs">X-Gateway-Id</code> header or an active gateway cookie.
          </p>
        </div>

        {/* Auth legend */}
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 mb-6">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Authentication Types</h3>
          <div className="flex flex-wrap gap-4">
            {Object.entries(authIcons).map(([key, info]) => {
              const Icon = info.icon;
              return (
                <div key={key} className="flex items-center gap-1.5">
                  <Icon className={`w-3.5 h-3.5 ${info.color}`} />
                  <span className={`text-xs ${info.color}`}>{info.label}</span>
                  <span className="text-xs text-zinc-600">
                    {key === "session" && "- NextAuth session required"}
                    {key === "gateway" && "- Session + gateway membership"}
                    {key === "api-key" && "- Bearer token / channel API key"}
                    {key === "none" && "- No auth needed"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          {categories.map((cat) => (
            <CategorySection key={cat.name} category={cat} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
