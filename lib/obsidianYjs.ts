import * as Y from "yjs";

const ROOM_TTL_MS = 30 * 60 * 1000;
const PARTICIPANT_TTL_MS = 30 * 1000;

export interface ObsidianYjsCursor {
  line: number;
  ch: number;
  anchorLine?: number;
  anchorCh?: number;
  headLine?: number;
  headCh?: number;
}

export interface ObsidianYjsPresence {
  clientId: string;
  name: string;
  activeFile?: string;
  cursor?: ObsidianYjsCursor;
  isTyping: boolean;
  lastSeenAt: number;
}

interface ObsidianYjsRoom {
  key: string;
  doc: Y.Doc;
  participants: Map<string, ObsidianYjsPresence>;
  lastTouchedAt: number;
}

interface ObsidianYjsStore {
  rooms: Map<string, ObsidianYjsRoom>;
}

declare global {
  // eslint-disable-next-line no-var
  var __synapseObsidianYjsStore__: ObsidianYjsStore | undefined;
}

function getStore(): ObsidianYjsStore {
  if (!globalThis.__synapseObsidianYjsStore__) {
    globalThis.__synapseObsidianYjsStore__ = { rooms: new Map() };
  }
  return globalThis.__synapseObsidianYjsStore__;
}

function roomKey(gatewayId: string, vaultPath: string, docPath: string): string {
  return `${gatewayId}::${vaultPath}::${docPath}`;
}

function pruneRoomParticipants(room: ObsidianYjsRoom, nowMs: number): void {
  for (const [clientId, participant] of room.participants.entries()) {
    if ((nowMs - participant.lastSeenAt) > PARTICIPANT_TTL_MS) {
      room.participants.delete(clientId);
    }
  }
}

function pruneStore(nowMs: number): void {
  const store = getStore();
  for (const [key, room] of store.rooms.entries()) {
    pruneRoomParticipants(room, nowMs);
    const idle = (nowMs - room.lastTouchedAt) > ROOM_TTL_MS;
    if (idle && room.participants.size === 0) {
      room.doc.destroy();
      store.rooms.delete(key);
    }
  }
}

function ensureRoom(gatewayId: string, vaultPath: string, docPath: string): ObsidianYjsRoom {
  const nowMs = Date.now();
  pruneStore(nowMs);
  const store = getStore();
  const key = roomKey(gatewayId, vaultPath, docPath);
  let room = store.rooms.get(key);
  if (!room) {
    room = {
      key,
      doc: new Y.Doc(),
      participants: new Map(),
      lastTouchedAt: nowMs,
    };
    store.rooms.set(key, room);
  }
  room.lastTouchedAt = nowMs;
  return room;
}

export function applyYjsUpdate(args: {
  gatewayId: string;
  vaultPath: string;
  docPath: string;
  update: Uint8Array;
}): void {
  const room = ensureRoom(args.gatewayId, args.vaultPath, args.docPath);
  Y.applyUpdate(room.doc, args.update);
  room.lastTouchedAt = Date.now();
}

export function encodeYjsStateVector(args: {
  gatewayId: string;
  vaultPath: string;
  docPath: string;
}): Uint8Array {
  const room = ensureRoom(args.gatewayId, args.vaultPath, args.docPath);
  return Y.encodeStateVector(room.doc);
}

export function encodeYjsMissingUpdate(args: {
  gatewayId: string;
  vaultPath: string;
  docPath: string;
  stateVector?: Uint8Array;
}): Uint8Array {
  const room = ensureRoom(args.gatewayId, args.vaultPath, args.docPath);
  if (args.stateVector && args.stateVector.length > 0) {
    return Y.encodeStateAsUpdate(room.doc, args.stateVector);
  }
  return Y.encodeStateAsUpdate(room.doc);
}

export function getYjsTextContent(args: {
  gatewayId: string;
  vaultPath: string;
  docPath: string;
  textName?: string;
}): string {
  const room = ensureRoom(args.gatewayId, args.vaultPath, args.docPath);
  return room.doc.getText(args.textName || "content").toString();
}

export function ensureYjsTextInitialized(args: {
  gatewayId: string;
  vaultPath: string;
  docPath: string;
  content: string;
  textName?: string;
}): boolean {
  const room = ensureRoom(args.gatewayId, args.vaultPath, args.docPath);
  const yText = room.doc.getText(args.textName || "content");
  if (yText.length > 0) return false;
  if (!args.content) return false;
  room.doc.transact(() => {
    yText.insert(0, args.content);
  }, "init-from-disk");
  room.lastTouchedAt = Date.now();
  return true;
}

export function upsertYjsPresence(args: {
  gatewayId: string;
  vaultPath: string;
  docPath: string;
  clientId: string;
  name: string;
  activeFile?: string;
  cursor?: ObsidianYjsCursor;
  isTyping?: boolean;
  nowMs?: number;
}): ObsidianYjsPresence[] {
  const nowMs = args.nowMs ?? Date.now();
  const room = ensureRoom(args.gatewayId, args.vaultPath, args.docPath);
  pruneRoomParticipants(room, nowMs);
  const current = room.participants.get(args.clientId);
  room.participants.set(args.clientId, {
    clientId: args.clientId,
    name: args.name || current?.name || "Obsidian User",
    activeFile: args.activeFile || current?.activeFile,
    cursor: args.cursor || current?.cursor,
    isTyping: typeof args.isTyping === "boolean" ? args.isTyping : Boolean(current?.isTyping),
    lastSeenAt: nowMs,
  });
  room.lastTouchedAt = nowMs;
  return Array.from(room.participants.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function removeYjsPresence(args: {
  gatewayId: string;
  vaultPath: string;
  docPath: string;
  clientId: string;
  nowMs?: number;
}): ObsidianYjsPresence[] {
  const nowMs = args.nowMs ?? Date.now();
  const room = ensureRoom(args.gatewayId, args.vaultPath, args.docPath);
  pruneRoomParticipants(room, nowMs);
  room.participants.delete(args.clientId);
  room.lastTouchedAt = nowMs;
  return Array.from(room.participants.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function listYjsPresence(args: {
  gatewayId: string;
  vaultPath: string;
  docPath: string;
  nowMs?: number;
}): ObsidianYjsPresence[] {
  const nowMs = args.nowMs ?? Date.now();
  const room = ensureRoom(args.gatewayId, args.vaultPath, args.docPath);
  pruneRoomParticipants(room, nowMs);
  room.lastTouchedAt = nowMs;
  return Array.from(room.participants.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function isYjsLiveMode(participants: ObsidianYjsPresence[]): boolean {
  return participants.length > 1;
}
