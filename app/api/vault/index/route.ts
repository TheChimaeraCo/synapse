import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

import { getGatewayContext, handleGatewayError, GatewayError } from "@/lib/gateway-context";
import { getWorkspacePath } from "@/lib/workspace";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const DEFAULT_VAULT_PATH = "obsidian-vault";
const MAX_NOTES = 5000;
const MAX_NOTE_BYTES = 1024 * 1024;
const IGNORED_DIRS = new Set([".git", "node_modules", ".next", "dist", "build", ".obsidian"]);

interface VaultNoteMeta {
  path: string;
  vaultRelativePath: string;
  title: string;
  tags: string[];
  outgoing: string[];
  wordCount: number;
  updatedAt: number;
  size: number;
}

function normalizeRelative(input: string): string | null {
  const normalized = input.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized) return "";
  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((part) => part === "..")) return null;
  return parts.join("/");
}

function resolveWithinRoot(root: string, relativePath: string): string {
  const clean = normalizeRelative(relativePath);
  if (clean === null) throw new GatewayError(400, `Invalid path: ${relativePath}`);
  const resolved = path.resolve(root, clean || ".");
  if (!resolved.startsWith(root)) throw new GatewayError(403, "Path escapes vault root");
  return resolved;
}

function canonicalNoteId(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\.(md|markdown)$/i, "")
    .toLowerCase();
}

function extractWikiTargets(content: string): string[] {
  const out = new Set<string>();
  const re = /\[\[([^\]]+)\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    const raw = (match[1] || "").trim();
    if (!raw) continue;
    const aliasSplit = raw.split("|")[0]?.trim() || "";
    const noHeading = aliasSplit.split("#")[0]?.trim() || "";
    const normalized = canonicalNoteId(noHeading);
    if (normalized) out.add(normalized);
  }
  return [...out];
}

function extractTags(content: string): string[] {
  const tags = new Set<string>();

  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (fm?.[1]) {
    const block = fm[1];
    const inline = block.match(/(?:^|\n)tags:\s*\[(.*?)\]/i);
    if (inline?.[1]) {
      inline[1]
        .split(",")
        .map((x) => x.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean)
        .forEach((tag) => tags.add(tag.toLowerCase()));
    }

    const lines = block.split("\n");
    let inTagList = false;
    for (const line of lines) {
      if (/^tags:\s*$/i.test(line.trim())) {
        inTagList = true;
        continue;
      }
      if (inTagList) {
        const m = line.match(/^\s*-\s*(.+)\s*$/);
        if (m?.[1]) {
          tags.add(m[1].trim().replace(/^["']|["']$/g, "").toLowerCase());
        } else if (line.trim() && !line.startsWith(" ")) {
          inTagList = false;
        }
      }
    }
  }

  const bodyTagRe = /(^|\s)#([a-zA-Z0-9/_-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = bodyTagRe.exec(content)) !== null) {
    if (m[2]) tags.add(m[2].toLowerCase());
  }

  return [...tags];
}

function extractTitle(content: string, fallback: string): string {
  const h1 = content.match(/^#\s+(.+)$/m);
  if (h1?.[1]) return h1[1].trim();
  return fallback;
}

async function getDefaultVaultPath(gatewayId: string): Promise<string> {
  try {
    const inherited = await convexClient.query(api.functions.gatewayConfig.getWithInheritance, {
      gatewayId: gatewayId as Id<"gateways">,
      key: "sync.obsidian.default_vault_path",
    });
    const clean = normalizeRelative(inherited?.value || "");
    if (clean !== null && clean) return clean;
  } catch {}
  return DEFAULT_VAULT_PATH;
}

export async function GET(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const workspace = await getWorkspacePath(gatewayId);
    const url = new URL(req.url);
    const requested = url.searchParams.get("vaultPath");
    const configuredPath = await getDefaultVaultPath(gatewayId);
    const resolvedVaultPath = requested || configuredPath || DEFAULT_VAULT_PATH;
    const cleanVaultPath = normalizeRelative(resolvedVaultPath);
    if (cleanVaultPath === null) {
      return NextResponse.json({ error: "Invalid vault path" }, { status: 400 });
    }

    const vaultPath = cleanVaultPath || DEFAULT_VAULT_PATH;
    const vaultRoot = resolveWithinRoot(workspace, vaultPath);
    await fs.mkdir(vaultRoot, { recursive: true });

    const absoluteNotes: string[] = [];
    const queue = [vaultRoot];

    while (queue.length > 0) {
      const current = queue.shift() as string;
      const entries = await fs.readdir(current, { withFileTypes: true });

      for (const entry of entries) {
        const abs = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (!IGNORED_DIRS.has(entry.name)) queue.push(abs);
          continue;
        }
        if (!entry.isFile()) continue;
        if (!/\.(md|markdown)$/i.test(entry.name)) continue;
        absoluteNotes.push(abs);
        if (absoluteNotes.length > MAX_NOTES) {
          return NextResponse.json({ error: `Vault has too many notes (max ${MAX_NOTES})` }, { status: 413 });
        }
      }
    }

    const canonicalToPath = new Map<string, string>();
    const basenameToPath = new Map<string, string[]>();
    const byPath = new Map<string, VaultNoteMeta>();
    const outgoingByPath = new Map<string, string[]>();

    for (const absPath of absoluteNotes) {
      const stat = await fs.stat(absPath);
      if (stat.size > MAX_NOTE_BYTES) continue;
      const content = await fs.readFile(absPath, "utf-8");
      const vaultRelativePath = path.relative(vaultRoot, absPath).replace(/\\/g, "/");
      const workspaceRelativePath = `${vaultPath}/${vaultRelativePath}`.replace(/\\/g, "/");
      const fallbackTitle = path.basename(vaultRelativePath).replace(/\.(md|markdown)$/i, "");
      const canonical = canonicalNoteId(vaultRelativePath);
      const baseCanonical = canonicalNoteId(path.basename(vaultRelativePath));

      canonicalToPath.set(canonical, workspaceRelativePath);
      const existing = basenameToPath.get(baseCanonical) || [];
      existing.push(workspaceRelativePath);
      basenameToPath.set(baseCanonical, existing);

      const outgoing = extractWikiTargets(content);
      outgoingByPath.set(workspaceRelativePath, outgoing);

      const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
      byPath.set(workspaceRelativePath, {
        path: workspaceRelativePath,
        vaultRelativePath,
        title: extractTitle(content, fallbackTitle),
        tags: extractTags(content),
        outgoing: [],
        wordCount,
        updatedAt: stat.mtimeMs,
        size: stat.size,
      });
    }

    const backlinksByPath = new Map<string, Set<string>>();
    const linkCountByPath = new Map<string, number>();

    for (const [sourcePath, targets] of outgoingByPath.entries()) {
      const resolvedTargets = new Set<string>();
      for (const target of targets) {
        const exact = canonicalToPath.get(target);
        if (exact) {
          resolvedTargets.add(exact);
          continue;
        }
        const byName = basenameToPath.get(target);
        if (byName && byName.length === 1) {
          resolvedTargets.add(byName[0]);
        }
      }

      const sourceNote = byPath.get(sourcePath);
      if (sourceNote) {
        sourceNote.outgoing = [...resolvedTargets].sort((a, b) => a.localeCompare(b));
      }
      linkCountByPath.set(sourcePath, resolvedTargets.size);

      for (const targetPath of resolvedTargets) {
        const current = backlinksByPath.get(targetPath) || new Set<string>();
        current.add(sourcePath);
        backlinksByPath.set(targetPath, current);
      }
    }

    const notes = [...byPath.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    const backlinksObj: Record<string, string[]> = {};
    backlinksByPath.forEach((set, key) => {
      backlinksObj[key] = [...set].sort((a, b) => a.localeCompare(b));
    });

    const tagSet = new Set<string>();
    for (const n of notes) n.tags.forEach((t) => tagSet.add(t));
    const totalLinks = [...linkCountByPath.values()].reduce((acc, n) => acc + n, 0);

    return NextResponse.json({
      vaultPath,
      notes,
      backlinksByPath: backlinksObj,
      stats: {
        notes: notes.length,
        tags: tagSet.size,
        links: totalLinks,
      },
    });
  } catch (err) {
    return handleGatewayError(err);
  }
}

