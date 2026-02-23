const {
  Plugin,
  PluginSettingTab,
  Setting,
  Notice,
  TFile,
  normalizePath,
} = require("obsidian");

const DEFAULT_SETTINGS = {
  synapseUrl: "",
  gatewayId: "",
  bearerToken: "",
  vaultPath: "obsidian-vault",
  autoStart: false,
  includeObsidianConfig: false,
  pullDeletes: false,
  pushIntervalMs: 5000,
  streamPollMs: 2000,
  batchSize: 64,
  debounceMs: 1200,
  reconnectDelayMs: 2500,
  suppressMs: 3000,
  showNotices: true,
};

const MAX_QUEUE_SIZE = 4000;
const TEXT_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".csv",
  ".tsv",
  ".js",
  ".ts",
  ".css",
  ".scss",
  ".html",
  ".xml",
  ".svg",
  ".py",
  ".rs",
  ".java",
  ".go",
  ".php",
  ".sh",
  ".zsh",
  ".bash",
  ".ini",
  ".toml",
  ".dataview",
]);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toErrorMessage(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (err.message) return err.message;
  return String(err);
}

function extensionOf(filePath) {
  const idx = filePath.lastIndexOf(".");
  if (idx < 0) return "";
  return filePath.slice(idx).toLowerCase();
}

function isTextPath(filePath) {
  return TEXT_EXTENSIONS.has(extensionOf(filePath));
}

function normalizeBaseUrl(input) {
  const value = String(input || "").trim();
  return value.replace(/\/+$/, "");
}

function buildEndpoint(baseUrl, pathname, params) {
  const url = new URL(`${normalizeBaseUrl(baseUrl)}${pathname}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

function arrayBufferEquals(a, b) {
  if (!a || !b) return false;
  if (a.byteLength !== b.byteLength) return false;
  const va = new Uint8Array(a);
  const vb = new Uint8Array(b);
  for (let i = 0; i < va.length; i += 1) {
    if (va[i] !== vb[i]) return false;
  }
  return true;
}

class SynapseObsidianSyncPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    this.queue = [];
    this.suppressedUntil = new Map();
    this.isRunning = false;
    this.flushInFlight = false;
    this.flushTimeout = null;
    this.flushInterval = null;
    this.streamTask = null;
    this.streamAbortController = null;

    this.statusEl = this.addStatusBarItem();
    this.updateStatus("idle");

    this.addSettingTab(new SynapseSyncSettingTab(this.app, this));

    this.addCommand({
      id: "synapse-sync-start",
      name: "Start Synapse live sync",
      callback: async () => {
        await this.startSync();
      },
    });

    this.addCommand({
      id: "synapse-sync-stop",
      name: "Stop Synapse live sync",
      callback: async () => {
        await this.stopSync();
      },
    });

    this.addCommand({
      id: "synapse-sync-now",
      name: "Sync with Synapse now",
      callback: async () => {
        await this.syncNow();
      },
    });

    this.registerEvent(
      this.app.vault.on("create", async (file) => {
        await this.onVaultCreateOrModify(file);
      }),
    );
    this.registerEvent(
      this.app.vault.on("modify", async (file) => {
        await this.onVaultCreateOrModify(file);
      }),
    );
    this.registerEvent(
      this.app.vault.on("delete", async (file) => {
        await this.onVaultDelete(file);
      }),
    );
    this.registerEvent(
      this.app.vault.on("rename", async (file, oldPath) => {
        await this.onVaultRename(file, oldPath);
      }),
    );

    if (this.settings.autoStart) {
      await this.startSync();
    }
  }

  async onunload() {
    await this.stopSync();
    this.updateStatus("stopped");
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  updateStatus(status, extra) {
    if (!this.statusEl) return;
    const suffix = extra ? `: ${extra}` : "";
    this.statusEl.setText(`Synapse Sync ${status}${suffix}`);
  }

  notify(message, timeout = 4000) {
    if (!this.settings.showNotices) return;
    new Notice(message, timeout);
  }

  ensureConfigured() {
    if (!this.settings.synapseUrl) {
      throw new Error("Synapse URL is not configured.");
    }
    if (!this.settings.gatewayId) {
      throw new Error("Gateway ID is not configured.");
    }
    if (!this.settings.bearerToken) {
      throw new Error("Bearer token is not configured.");
    }
  }

  authHeaders(extra) {
    const headers = Object.assign({}, extra || {});
    if (this.settings.bearerToken) {
      headers.Authorization = `Bearer ${this.settings.bearerToken}`;
    }
    return headers;
  }

  shouldSyncPath(pathValue) {
    if (!pathValue) return false;
    const p = normalizePath(pathValue);
    if (!this.settings.includeObsidianConfig && (p === ".obsidian" || p.startsWith(".obsidian/"))) {
      return false;
    }
    return true;
  }

  isSuppressed(pathValue) {
    const p = normalizePath(pathValue);
    const until = this.suppressedUntil.get(p) || 0;
    if (Date.now() > until) {
      this.suppressedUntil.delete(p);
      return false;
    }
    return true;
  }

  suppress(pathValue, ms) {
    const p = normalizePath(pathValue);
    this.suppressedUntil.set(p, Date.now() + (ms || this.settings.suppressMs || 3000));
  }

  enqueueOperation(op) {
    const pathKey = normalizePath(op.path);
    op.path = pathKey;
    for (let i = this.queue.length - 1; i >= 0; i -= 1) {
      if (this.queue[i].path === pathKey) {
        this.queue.splice(i, 1);
      }
    }
    this.queue.push(op);
    if (this.queue.length > MAX_QUEUE_SIZE) {
      this.queue.splice(0, this.queue.length - MAX_QUEUE_SIZE);
    }
    this.scheduleFlush();
  }

  scheduleFlush() {
    if (!this.isRunning) return;
    if (this.flushTimeout) window.clearTimeout(this.flushTimeout);
    this.flushTimeout = window.setTimeout(async () => {
      this.flushTimeout = null;
      await this.flushQueue();
    }, Math.max(200, Number(this.settings.debounceMs || 1200)));
  }

  async onVaultCreateOrModify(file) {
    if (!(file instanceof TFile)) return;
    if (!this.isRunning) return;
    const filePath = normalizePath(file.path);
    if (!this.shouldSyncPath(filePath)) return;
    if (this.isSuppressed(filePath)) return;

    try {
      const op = await this.buildUpsertOperation(filePath);
      this.enqueueOperation(op);
    } catch (err) {
      console.error("[synapse-sync] Failed to queue upsert", err);
    }
  }

  async onVaultDelete(file) {
    if (!this.isRunning) return;
    const filePath = normalizePath(file.path);
    if (!this.shouldSyncPath(filePath)) return;
    if (this.isSuppressed(filePath)) return;
    this.enqueueOperation({ op: "delete", path: filePath });
  }

  async onVaultRename(file, oldPath) {
    if (!this.isRunning) return;
    const oldPathNorm = normalizePath(oldPath);
    const newPathNorm = normalizePath(file.path);
    if (this.shouldSyncPath(oldPathNorm) && !this.isSuppressed(oldPathNorm)) {
      this.enqueueOperation({ op: "delete", path: oldPathNorm });
    }
    if (file instanceof TFile && this.shouldSyncPath(newPathNorm) && !this.isSuppressed(newPathNorm)) {
      try {
        const op = await this.buildUpsertOperation(newPathNorm);
        this.enqueueOperation(op);
      } catch (err) {
        console.error("[synapse-sync] Failed to queue rename upsert", err);
      }
    }
  }

  async buildUpsertOperation(filePath) {
    const fileObj = this.app.vault.getAbstractFileByPath(filePath);
    if (!(fileObj instanceof TFile)) {
      throw new Error(`Not a file: ${filePath}`);
    }
    if (isTextPath(filePath)) {
      const content = await this.app.vault.read(fileObj);
      return { op: "upsert", path: filePath, content, encoding: "utf8" };
    }
    const binary = await this.app.vault.readBinary(fileObj);
    const content = Buffer.from(binary).toString("base64");
    return { op: "upsert", path: filePath, content, encoding: "base64" };
  }

  async flushQueue() {
    if (!this.isRunning) return;
    if (this.flushInFlight) return;
    if (!this.queue.length) return;

    this.flushInFlight = true;
    let ops = [];
    try {
      const batchSize = Math.max(1, Number(this.settings.batchSize || 64));
      ops = this.queue.splice(0, batchSize);
      const url = buildEndpoint(this.settings.synapseUrl, "/sync/obsidian", {});
      const res = await fetch(url, {
        method: "POST",
        headers: this.authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          gatewayId: this.settings.gatewayId,
          vaultPath: this.settings.vaultPath,
          operations: ops,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Push failed (${res.status}): ${body || res.statusText}`);
      }
      this.updateStatus("running", `queued=${this.queue.length}`);
    } catch (err) {
      if (ops.length > 0) {
        this.queue = ops.concat(this.queue);
      }
      console.error("[synapse-sync] Flush error", err);
      this.updateStatus("error", "push failed");
      this.notify(`Synapse sync push failed: ${toErrorMessage(err)}`);
    } finally {
      this.flushInFlight = false;
    }
  }

  async startSync() {
    if (this.isRunning) return;
    this.ensureConfigured();
    this.isRunning = true;
    this.updateStatus("starting");

    this.flushInterval = window.setInterval(async () => {
      await this.flushQueue();
    }, Math.max(1000, Number(this.settings.pushIntervalMs || 5000)));
    this.registerInterval(this.flushInterval);

    this.streamTask = this.runStreamLoop();
    this.notify("Synapse live sync started");
  }

  async stopSync() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.flushTimeout) {
      window.clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }
    if (this.streamAbortController) {
      this.streamAbortController.abort();
      this.streamAbortController = null;
    }
    if (this.flushInterval) {
      window.clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    try {
      await this.streamTask;
    } catch {}
    this.streamTask = null;
    this.updateStatus("stopped");
    this.notify("Synapse live sync stopped");
  }

  async syncNow() {
    this.ensureConfigured();
    const wasRunning = this.isRunning;
    if (!wasRunning) {
      this.isRunning = true;
    }
    try {
      await this.pullSnapshot();
      await this.flushQueue();
      this.notify("Synapse sync complete");
    } finally {
      if (!wasRunning) {
        this.isRunning = false;
        this.updateStatus("idle");
      }
    }
  }

  async pullSnapshot() {
    const url = buildEndpoint(this.settings.synapseUrl, "/sync/obsidian", {
      gatewayId: this.settings.gatewayId,
      vaultPath: this.settings.vaultPath,
    });
    const res = await fetch(url, { headers: this.authHeaders() });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Snapshot failed (${res.status}): ${body || res.statusText}`);
    }
    const payload = await res.json();
    const files = Array.isArray(payload.files) ? payload.files : [];
    await this.applyRemoteSnapshot(files);
  }

  async runStreamLoop() {
    while (this.isRunning) {
      this.streamAbortController = new AbortController();
      try {
        const streamUrl = buildEndpoint(this.settings.synapseUrl, "/sync/obsidian", {
          stream: "true",
          gatewayId: this.settings.gatewayId,
          vaultPath: this.settings.vaultPath,
          pollMs: this.settings.streamPollMs,
        });
        const res = await fetch(streamUrl, {
          method: "GET",
          headers: this.authHeaders({ Accept: "text/event-stream" }),
          signal: this.streamAbortController.signal,
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`Stream failed (${res.status}): ${body || res.statusText}`);
        }
        this.updateStatus("running", `queued=${this.queue.length}`);
        await this.consumeEventStream(res, this.streamAbortController.signal);
      } catch (err) {
        if (!this.isRunning) break;
        if (this.streamAbortController && this.streamAbortController.signal.aborted) break;
        const message = toErrorMessage(err);
        this.updateStatus("reconnecting", message);
        console.error("[synapse-sync] Stream error", err);
        await delay(Math.max(1000, Number(this.settings.reconnectDelayMs || 2500)));
      } finally {
        this.streamAbortController = null;
      }
    }
  }

  async consumeEventStream(response, signal) {
    if (!response.body) throw new Error("Missing stream body");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      if (signal.aborted) return;
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });

      let splitIdx = buffer.indexOf("\n\n");
      while (splitIdx >= 0) {
        const chunk = buffer.slice(0, splitIdx);
        buffer = buffer.slice(splitIdx + 2);
        await this.handleEventChunk(chunk);
        splitIdx = buffer.indexOf("\n\n");
      }
    }
  }

  async handleEventChunk(chunk) {
    const lines = chunk.split(/\r?\n/);
    const dataLines = [];
    for (const line of lines) {
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }
    if (!dataLines.length) return;
    let payload;
    try {
      payload = JSON.parse(dataLines.join("\n"));
    } catch {
      return;
    }
    await this.handleStreamEvent(payload);
  }

  async handleStreamEvent(payload) {
    if (!payload || typeof payload !== "object") return;
    const type = payload.type;
    if (type === "heartbeat" || type === "ready") return;
    if (type === "error") {
      this.updateStatus("error", payload.message || "stream error");
      return;
    }
    if (type === "snapshot") {
      await this.applyRemoteSnapshot(Array.isArray(payload.files) ? payload.files : []);
      return;
    }
    if (type === "changes") {
      await this.applyRemoteChanges(
        Array.isArray(payload.changed) ? payload.changed : [],
        Array.isArray(payload.deleted) ? payload.deleted : [],
      );
    }
  }

  async applyRemoteSnapshot(files) {
    const localFiles = this.app.vault.getFiles();
    const localByPath = new Map(localFiles.map((file) => [normalizePath(file.path), file]));
    for (const remote of files) {
      const remotePath = normalizePath(String(remote.path || ""));
      if (!remotePath || !this.shouldSyncPath(remotePath)) continue;
      const remoteMtime = Number(remote.mtimeMs || 0);
      const local = localByPath.get(remotePath);
      if (!local) {
        await this.pullRemoteFile(remotePath, remoteMtime);
        continue;
      }
      if (remoteMtime > Number(local.stat.mtime || 0) + 1500) {
        await this.pullRemoteFile(remotePath, remoteMtime);
      }
    }
  }

  async applyRemoteChanges(changed, deleted) {
    for (const removedPath of deleted) {
      const p = normalizePath(String(removedPath || ""));
      if (!p || !this.shouldSyncPath(p)) continue;
      if (!this.settings.pullDeletes) continue;
      await this.deleteLocalPath(p);
    }
    for (const remote of changed) {
      const remotePath = normalizePath(String(remote.path || ""));
      if (!remotePath || !this.shouldSyncPath(remotePath)) continue;
      await this.pullRemoteFile(remotePath, Number(remote.mtimeMs || 0));
    }
  }

  async pullRemoteFile(remotePath, remoteMtimeMs) {
    const textMode = isTextPath(remotePath);
    const url = buildEndpoint(this.settings.synapseUrl, "/sync/obsidian", {
      gatewayId: this.settings.gatewayId,
      vaultPath: this.settings.vaultPath,
      file: remotePath,
      encoding: textMode ? "utf8" : "base64",
    });
    const res = await fetch(url, { headers: this.authHeaders() });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Pull file failed (${res.status}): ${body || res.statusText}`);
    }
    const payload = await res.json();
    if (textMode) {
      await this.applyTextFile(remotePath, String(payload.content || ""));
    } else {
      const buffer = Buffer.from(String(payload.content || ""), "base64");
      await this.applyBinaryFile(remotePath, buffer);
    }
    this.updateStatus("running", `queued=${this.queue.length}`);
    if (remoteMtimeMs > 0) {
      this.suppress(remotePath, this.settings.suppressMs);
    }
  }

  async applyTextFile(filePath, content) {
    const pathNorm = normalizePath(filePath);
    await this.ensureParentFolders(pathNorm);
    this.suppress(pathNorm, this.settings.suppressMs);
    const existing = this.app.vault.getAbstractFileByPath(pathNorm);
    if (existing instanceof TFile) {
      const current = await this.app.vault.read(existing);
      if (current === content) return;
      await this.app.vault.modify(existing, content);
      return;
    }
    await this.app.vault.create(pathNorm, content);
  }

  async applyBinaryFile(filePath, buffer) {
    const pathNorm = normalizePath(filePath);
    await this.ensureParentFolders(pathNorm);
    this.suppress(pathNorm, this.settings.suppressMs);
    const existing = this.app.vault.getAbstractFileByPath(pathNorm);
    if (existing instanceof TFile) {
      const current = await this.app.vault.readBinary(existing);
      if (arrayBufferEquals(current, buffer)) return;
      if (typeof this.app.vault.modifyBinary === "function") {
        await this.app.vault.modifyBinary(existing, buffer);
      } else {
        await this.app.vault.adapter.writeBinary(pathNorm, buffer);
      }
      return;
    }
    if (typeof this.app.vault.createBinary === "function") {
      await this.app.vault.createBinary(pathNorm, buffer);
    } else {
      await this.app.vault.adapter.writeBinary(pathNorm, buffer);
    }
  }

  async deleteLocalPath(filePath) {
    const pathNorm = normalizePath(filePath);
    this.suppress(pathNorm, this.settings.suppressMs);
    const fileObj = this.app.vault.getAbstractFileByPath(pathNorm);
    if (fileObj) {
      await this.app.vault.delete(fileObj, true);
      return;
    }
    if (await this.app.vault.adapter.exists(pathNorm)) {
      await this.app.vault.adapter.remove(pathNorm);
    }
  }

  async ensureParentFolders(filePath) {
    const normalized = normalizePath(filePath);
    const parts = normalized.split("/");
    parts.pop();
    let prefix = "";
    for (const part of parts) {
      prefix = prefix ? `${prefix}/${part}` : part;
      if (!prefix) continue;
      const folder = this.app.vault.getAbstractFileByPath(prefix);
      if (!folder) {
        await this.app.vault.createFolder(prefix);
      }
    }
  }
}

class SynapseSyncSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Synapse Obsidian Sync" });

    new Setting(containerEl)
      .setName("Synapse URL")
      .setDesc("Base URL to your Synapse instance (e.g. https://synapse.example.com)")
      .addText((text) =>
        text
          .setPlaceholder("https://synapse.example.com")
          .setValue(this.plugin.settings.synapseUrl)
          .onChange(async (value) => {
            this.plugin.settings.synapseUrl = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Gateway ID")
      .setDesc("Gateway ID used by /sync/obsidian for token-based auth")
      .addText((text) =>
        text
          .setPlaceholder("md7ar3...")
          .setValue(this.plugin.settings.gatewayId)
          .onChange(async (value) => {
            this.plugin.settings.gatewayId = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Bearer token")
      .setDesc("Gateway auth token (same as gateway.auth_token in Synapse)")
      .addText((text) =>
        text
          .setPlaceholder("sk-syn-...")
          .setValue(this.plugin.settings.bearerToken)
          .onChange(async (value) => {
            this.plugin.settings.bearerToken = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Remote vault path")
      .setDesc("Relative vault path managed by Synapse (default: obsidian-vault)")
      .addText((text) =>
        text
          .setPlaceholder("obsidian-vault")
          .setValue(this.plugin.settings.vaultPath)
          .onChange(async (value) => {
            this.plugin.settings.vaultPath = value.trim() || "obsidian-vault";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Auto start sync")
      .setDesc("Start live sync automatically when Obsidian loads")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoStart).onChange(async (value) => {
          this.plugin.settings.autoStart = Boolean(value);
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Sync .obsidian folder")
      .setDesc("Include .obsidian settings/plugins in sync operations")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.includeObsidianConfig).onChange(async (value) => {
          this.plugin.settings.includeObsidianConfig = Boolean(value);
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Apply remote deletes")
      .setDesc("Delete local files when they are deleted remotely")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.pullDeletes).onChange(async (value) => {
          this.plugin.settings.pullDeletes = Boolean(value);
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Push interval (ms)")
      .setDesc("Background interval for pushing local queued operations")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.pushIntervalMs))
          .onChange(async (value) => {
            const next = Number.parseInt(value, 10);
            if (Number.isFinite(next) && next > 250) {
              this.plugin.settings.pushIntervalMs = next;
              await this.plugin.saveSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName("SSE poll interval (ms)")
      .setDesc("Polling cadence used by Synapse stream endpoint")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.streamPollMs))
          .onChange(async (value) => {
            const next = Number.parseInt(value, 10);
            if (Number.isFinite(next) && next >= 500) {
              this.plugin.settings.streamPollMs = next;
              await this.plugin.saveSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Batch size")
      .setDesc("Maximum number of operations per push request")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.batchSize))
          .onChange(async (value) => {
            const next = Number.parseInt(value, 10);
            if (Number.isFinite(next) && next >= 1) {
              this.plugin.settings.batchSize = next;
              await this.plugin.saveSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Show notices")
      .setDesc("Show popup notices for sync state changes and errors")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showNotices).onChange(async (value) => {
          this.plugin.settings.showNotices = Boolean(value);
          await this.plugin.saveSettings();
        }),
      );

    containerEl.createEl("h3", { text: "Actions" });

    new Setting(containerEl)
      .setName("Start live sync")
      .setDesc("Connect to Synapse stream and push local changes")
      .addButton((button) =>
        button.setButtonText("Start").onClick(async () => {
          try {
            await this.plugin.startSync();
          } catch (err) {
            this.plugin.notify(`Start failed: ${toErrorMessage(err)}`);
          }
        }),
      );

    new Setting(containerEl)
      .setName("Stop live sync")
      .setDesc("Disconnect stream and stop pushing changes")
      .addButton((button) =>
        button.setButtonText("Stop").onClick(async () => {
          await this.plugin.stopSync();
        }),
      );

    new Setting(containerEl)
      .setName("Sync now")
      .setDesc("Pull snapshot + push queued local changes")
      .addButton((button) =>
        button.setButtonText("Run").onClick(async () => {
          try {
            await this.plugin.syncNow();
          } catch (err) {
            this.plugin.notify(`Sync failed: ${toErrorMessage(err)}`);
          }
        }),
      );
  }
}

module.exports = SynapseObsidianSyncPlugin;
