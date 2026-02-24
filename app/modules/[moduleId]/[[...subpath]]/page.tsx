"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { gatewayFetch } from "@/lib/gatewayFetch";
import Link from "next/link";
import { ArrowLeft, Loader2, Package, Zap, AlertCircle } from "lucide-react";

interface ModulePage {
  path: string;
  title: string;
  component: string;
}

interface ModuleUI {
  moduleId: string;
  moduleName: string;
  description?: string;
  icon?: string;
  pages: ModulePage[];
  tools: Array<{ name: string; description: string }>;
}

function ModuleRenderer({ html, moduleId, onNavigate }: { html: string; moduleId: string; onNavigate: (path: string) => void }) {
  const [iframeHeight, setIframeHeight] = useState(600);

  const iframeContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: { extend: { colors: { primary: '#6366f1' } } }
    }
  <\/script>
  <style>
    body { background: transparent; color: #e4e4e7; font-family: system-ui, sans-serif; margin: 0; padding: 16px; }
    * { box-sizing: border-box; }
  </style>
</head>
<body class="dark">
  <div id="module-root">${html}</div>
  <script>
    // Auto-resize
    const observer = new ResizeObserver(() => {
      window.parent.postMessage({ type: 'module-resize', height: document.body.scrollHeight }, '*');
    });
    observer.observe(document.body);
    
    // Module API bridge
    window.callTool = async function(toolName, args) {
      return new Promise((resolve, reject) => {
        const id = Math.random().toString(36).slice(2);
        const handler = (e) => {
          if (e.data?.type === 'tool-result' && e.data.id === id) {
            window.removeEventListener('message', handler);
            if (e.data.error) reject(new Error(e.data.error));
            else resolve(e.data.result);
          }
        };
        window.addEventListener('message', handler);
        window.parent.postMessage({ type: 'call-tool', id, toolName, args }, '*');
      });
    };

    // Navigation bridge - navigate to another module sub-page
    // Usage: window.navigateTo('recipe/caribbean-jerk') or window.navigateTo('/modules/meal-planner/recipe/123')
    window.navigateTo = function(path) {
      window.parent.postMessage({ type: 'module-navigate', path }, '*');
    };

    // Get current module ID
    window.moduleId = '${moduleId}';
  <\/script>
</body>
</html>`;

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "module-resize") {
        setIframeHeight(Math.min(Math.max(e.data.height + 32, 200), 2000));
      }
      if (e.data?.type === "module-navigate") {
        const path = e.data.path || "";
        // If it starts with /, treat as absolute. Otherwise, relative to module.
        if (path.startsWith("/")) {
          onNavigate(path);
        } else {
          onNavigate(`/modules/${moduleId}/${path}`);
        }
      }
      if (e.data?.type === "call-tool") {
        console.log("[ModuleBridge] call-tool received:", e.data.toolName);
        gatewayFetch("/api/tools/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toolName: e.data.toolName, args: e.data.args }),
        })
          .then((r) => {
            console.log("[ModuleBridge] API response status:", r.status);
            return r.json();
          })
          .then((result) => {
            console.log("[ModuleBridge] API result:", result);
            const iframe = document.querySelector("iframe");
            iframe?.contentWindow?.postMessage(
              { type: "tool-result", id: e.data.id, result },
              "*"
            );
          })
          .catch((err) => {
            const iframe = document.querySelector("iframe");
            iframe?.contentWindow?.postMessage(
              { type: "tool-result", id: e.data.id, error: err.message },
              "*"
            );
          });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [moduleId, onNavigate]);

  return (
    <iframe
      srcDoc={iframeContent}
      className="w-full border-0 rounded-xl bg-transparent"
      style={{ height: iframeHeight }}
      sandbox="allow-scripts allow-same-origin"
    />
  );
}

export default function ModulePage() {
  const params = useParams();
  const router = useRouter();
  const moduleId = params.moduleId as string;
  const subpath = (params.subpath as string[] | undefined)?.join("/") || "";
  const [moduleUI, setModuleUI] = useState<ModuleUI | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchModule = useCallback(async () => {
    try {
      const url = subpath
        ? `/api/modules/${moduleId}/ui?subpath=${encodeURIComponent(subpath)}`
        : `/api/modules/${moduleId}/ui`;
      const res = await gatewayFetch(url);
      if (res.ok) {
        const data = await res.json();
        setModuleUI(data);
      } else if (res.status === 404) {
        setError("Module UI not found. Ask Mara to build the UI for this module.");
      } else {
        setError("Failed to load module");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [moduleId, subpath]);

  useEffect(() => {
    fetchModule();
  }, [fetchModule]);

  const handleNavigate = useCallback((path: string) => {
    router.push(path);
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
      </div>
    );
  }

  if (error || !moduleUI) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
        <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
          <Package className="h-8 w-8 text-purple-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-zinc-200 capitalize">{moduleId.replace(/-/g, " ")}</h2>
          <p className="text-sm text-zinc-500 mt-1">{error || "No UI available for this module yet."}</p>
        </div>
        <Link
          href="/chat"
          className="px-4 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 text-sm hover:bg-purple-500/20 transition"
        >
          Ask Mara to build it
        </Link>
        <Link
          href="/"
          className="text-xs text-zinc-600 hover:text-zinc-400 transition flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" /> Back to Dashboard
        </Link>
      </div>
    );
  }

  // Find the right page: match subpath or fall back to first page
  let activePage: ModulePage | undefined;
  if (subpath) {
    // Try exact match on subpath
    activePage = moduleUI.pages.find((p) => {
      const pagePath = p.path.replace(`/modules/${moduleId}/`, "").replace(`/modules/${moduleId}`, "");
      return pagePath === subpath || pagePath === `/${subpath}`;
    });
  }
  // Fall back to main page (ui.html / index)
  if (!activePage) {
    activePage = moduleUI.pages?.[0];
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/[0.08]">
        <Link
          href={subpath ? `/modules/${moduleId}` : "/"}
          className="text-zinc-500 hover:text-zinc-300 transition"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="text-lg">{moduleUI.icon || "📦"}</span>
        <div>
          <h1 className="text-sm font-semibold text-zinc-200">{moduleUI.moduleName}</h1>
          {moduleUI.description && (
            <p className="text-[11px] text-zinc-500">{moduleUI.description}</p>
          )}
        </div>
        {/* Sub-page breadcrumb */}
        {subpath && (
          <span className="text-[11px] text-zinc-500 font-mono">
            / {subpath}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {moduleUI.tools.length > 0 && (
            <span className="text-[10px] text-zinc-600 font-mono flex items-center gap-1">
              <Zap className="h-3 w-3" /> {moduleUI.tools.length} tools
            </span>
          )}
        </div>
      </div>

      {/* Module UI content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activePage ? (
          <ModuleRenderer html={activePage.component} moduleId={moduleId} onNavigate={handleNavigate} />
        ) : (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <AlertCircle className="h-4 w-4" />
            {subpath ? `Page "${subpath}" not found in this module.` : "No UI pages defined for this module."}
          </div>
        )}
      </div>
    </div>
  );
}
