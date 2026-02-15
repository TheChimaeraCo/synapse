import { readFileSync } from "fs";
import { join } from "path";

const TEMPLATES_DIR = join(process.cwd(), "lib/templates");

function loadTemplate(name: string): string {
  try {
    return readFileSync(join(TEMPLATES_DIR, name), "utf-8");
  } catch {
    return "";
  }
}

// Cache on first load
let _soul: string | null = null;
let _agents: string | null = null;

export function getSoulTemplate(): string {
  if (_soul === null) _soul = loadTemplate("SOUL.md");
  return _soul;
}

export function getAgentsTemplate(): string {
  if (_agents === null) _agents = loadTemplate("AGENTS.md");
  return _agents;
}

export function buildDefaultSystemPrompt(): string {
  const soul = getSoulTemplate();
  const agents = getAgentsTemplate();
  
  return `${soul}\n\n---\n\n${agents}`;
}
