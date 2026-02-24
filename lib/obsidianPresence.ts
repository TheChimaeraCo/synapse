export interface ObsidianPresenceParticipant {
  clientId: string;
  name: string;
  activeFile?: string;
  cursor?: {
    line: number;
    ch: number;
    anchorLine?: number;
    anchorCh?: number;
    headLine?: number;
    headCh?: number;
  };
  isTyping: boolean;
  mode: "sync" | "live";
  lastSeenAt: number;
}

interface PresenceRoom {
  clients: Map<string, ObsidianPresenceParticipant>;
}

interface PresenceStore {
  rooms: Map<string, PresenceRoom>;
}

declare global {
  // eslint-disable-next-line no-var
  var __synapseObsidianPresenceStore__: PresenceStore | undefined;
}

const PRESENCE_TTL_MS = 25000;

function getStore(): PresenceStore {
  if (!globalThis.__synapseObsidianPresenceStore__) {
    globalThis.__synapseObsidianPresenceStore__ = { rooms: new Map() };
  }
  return globalThis.__synapseObsidianPresenceStore__;
}

function roomKey(gatewayId: string, vaultPath: string): string {
  return `${gatewayId}::${vaultPath}`;
}

function pruneRoom(room: PresenceRoom, nowMs: number): void {
  for (const [clientId, participant] of room.clients.entries()) {
    if ((nowMs - participant.lastSeenAt) > PRESENCE_TTL_MS) {
      room.clients.delete(clientId);
    }
  }
}

function ensureRoom(gatewayId: string, vaultPath: string): PresenceRoom {
  const store = getStore();
  const key = roomKey(gatewayId, vaultPath);
  let room = store.rooms.get(key);
  if (!room) {
    room = { clients: new Map() };
    store.rooms.set(key, room);
  }
  return room;
}

export function upsertObsidianPresence(args: {
  gatewayId: string;
  vaultPath: string;
  clientId: string;
  name?: string;
  activeFile?: string;
  cursor?: {
    line: number;
    ch: number;
    anchorLine?: number;
    anchorCh?: number;
    headLine?: number;
    headCh?: number;
  };
  isTyping?: boolean;
  mode?: "sync" | "live";
  nowMs?: number;
}): ObsidianPresenceParticipant[] {
  const nowMs = args.nowMs ?? Date.now();
  const room = ensureRoom(args.gatewayId, args.vaultPath);
  pruneRoom(room, nowMs);

  const existing = room.clients.get(args.clientId);
  room.clients.set(args.clientId, {
    clientId: args.clientId,
    name: args.name || existing?.name || "Obsidian User",
    activeFile: args.activeFile || existing?.activeFile,
    cursor: args.cursor || existing?.cursor,
    isTyping: typeof args.isTyping === "boolean" ? args.isTyping : Boolean(existing?.isTyping),
    mode: args.mode || existing?.mode || "sync",
    lastSeenAt: nowMs,
  });
  return Array.from(room.clients.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function removeObsidianPresence(args: {
  gatewayId: string;
  vaultPath: string;
  clientId: string;
  nowMs?: number;
}): ObsidianPresenceParticipant[] {
  const nowMs = args.nowMs ?? Date.now();
  const room = ensureRoom(args.gatewayId, args.vaultPath);
  pruneRoom(room, nowMs);
  room.clients.delete(args.clientId);
  return Array.from(room.clients.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function listObsidianPresence(args: {
  gatewayId: string;
  vaultPath: string;
  nowMs?: number;
}): ObsidianPresenceParticipant[] {
  const nowMs = args.nowMs ?? Date.now();
  const room = ensureRoom(args.gatewayId, args.vaultPath);
  pruneRoom(room, nowMs);
  return Array.from(room.clients.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function isObsidianLiveMode(participants: ObsidianPresenceParticipant[]): boolean {
  return participants.length > 1;
}

export function presenceRevision(participants: ObsidianPresenceParticipant[]): string {
  return participants
    .map((p) => {
      const c = p.cursor;
      const cursor = c ? `${c.line},${c.ch},${c.anchorLine ?? ""},${c.anchorCh ?? ""},${c.headLine ?? ""},${c.headCh ?? ""}` : "";
      return `${p.clientId}:${p.isTyping ? 1 : 0}:${p.activeFile || ""}:${p.mode}:${p.name}:${cursor}`;
    })
    .sort()
    .join("|");
}
