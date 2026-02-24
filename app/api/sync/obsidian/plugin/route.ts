import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { GatewayError, getGatewayContext, handleGatewayError } from "@/lib/gateway-context";

const PLUGIN_DIR = path.join(process.cwd(), "integrations", "obsidian-synapse-sync");
const ALLOWED_FILES: Record<string, { file: string; contentType: string }> = {
  "manifest.json": { file: "manifest.json", contentType: "application/json; charset=utf-8" },
  "main.js": { file: "main.js", contentType: "application/javascript; charset=utf-8" },
  "versions.json": { file: "versions.json", contentType: "application/json; charset=utf-8" },
  "README.md": { file: "README.md", contentType: "text/markdown; charset=utf-8" },
};
const ZIP_FILE_ORDER = ["manifest.json", "main.js", "versions.json", "README.md"] as const;

function requireOwnerAdmin(role: string): void {
  if (role !== "owner" && role !== "admin") {
    throw new GatewayError(403, "Owner/admin role required");
  }
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosDateTime(now: Date): { date: number; time: number } {
  const year = Math.min(2107, Math.max(1980, now.getFullYear()));
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = Math.floor(now.getSeconds() / 2);
  return {
    date: ((year - 1980) << 9) | (month << 5) | day,
    time: (hours << 11) | (minutes << 5) | seconds,
  };
}

function buildPluginZip(entries: Array<{ name: string; content: Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const now = toDosDateTime(new Date());

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, "utf8");
    const contentBytes = entry.content;
    const checksum = crc32(contentBytes);
    const size = contentBytes.length;

    const localHeader = Buffer.alloc(30 + nameBytes.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(now.time, 10);
    localHeader.writeUInt16LE(now.date, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(size, 18);
    localHeader.writeUInt32LE(size, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);
    nameBytes.copy(localHeader, 30);
    localParts.push(localHeader, contentBytes);

    const centralHeader = Buffer.alloc(46 + nameBytes.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(now.time, 12);
    centralHeader.writeUInt16LE(now.date, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(size, 20);
    centralHeader.writeUInt32LE(size, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    nameBytes.copy(centralHeader, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + contentBytes.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

export async function GET(req: NextRequest) {
  try {
    const { role } = await getGatewayContext(req);
    requireOwnerAdmin(role);

    const bundle = req.nextUrl.searchParams.get("bundle");
    const fileKey = req.nextUrl.searchParams.get("file") || "";
    if (bundle === "zip" || fileKey === "plugin.zip" || fileKey === "zip") {
      const files = await Promise.all(
        ZIP_FILE_ORDER.map(async (name) => {
          const content = await fs.readFile(path.join(PLUGIN_DIR, name));
          return { name, content };
        }),
      );
      const zip = buildPluginZip(files);
      const zipBytes = new Uint8Array(zip.buffer, zip.byteOffset, zip.byteLength);
      return new NextResponse(zipBytes as any, {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": 'attachment; filename="synapse-obsidian-sync.zip"',
          "Cache-Control": "no-store",
        },
      });
    }

    const selected = ALLOWED_FILES[fileKey];
    if (!selected) {
      return NextResponse.json(
        { error: "Invalid file. Use manifest.json, main.js, versions.json, README.md, or file=plugin.zip" },
        { status: 400 },
      );
    }

    const absolute = path.join(PLUGIN_DIR, selected.file);
    const content = await fs.readFile(absolute);
    const contentBytes = new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
    return new NextResponse(contentBytes as any, {
      status: 200,
      headers: {
        "Content-Type": selected.contentType,
        "Content-Disposition": `attachment; filename="${selected.file}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleGatewayError(err);
  }
}
