// Synapse - (c) The Chimaera Company LLC
// Licensed under the Functional Source License 1.0
import { SKILL_REGISTRY, type SkillContext } from "./builtinSkills";

interface SkillRecord {
  _id: string;
  name: string;
  description: string;
  status: string;
  functions: { name: string; description: string; parameters: string }[];
  triggers?: { type: string; value: string }[];
}

export function matchSkills(message: string, installedSkills: SkillRecord[]): SkillRecord[] {
  const lower = message.toLowerCase();
  return installedSkills.filter((skill) => {
    if (!skill.triggers?.length) return false;
    return skill.triggers.some((trigger) => {
      if (trigger.type === "always") return true;
      if (trigger.type === "keyword") return lower.includes(trigger.value.toLowerCase());
      if (trigger.type === "pattern") {
        try {
          return new RegExp(trigger.value, "i").test(message);
        } catch {
          return false;
        }
      }
      return false;
    });
  });
}

export async function executeSkill(
  skillName: string,
  functionName: string,
  params: Record<string, any>,
  context: SkillContext
): Promise<string> {
  const skill = SKILL_REGISTRY.get(skillName);
  if (!skill) return `Skill "${skillName}" not found in registry.`;

  const fn = skill.functions.find((f) => f.name === functionName);
  if (!fn) return `Function "${functionName}" not found in skill "${skillName}".`;

  try {
    return await fn.handler(params, context);
  } catch (e: any) {
    return `Skill execution error: ${e.message}`;
  }
}

export function getSkillContext(installedSkills: SkillRecord[]): string {
  if (!installedSkills.length) return "";

  const lines = ["## Available Skills\n"];
  for (const skill of installedSkills) {
    lines.push(`### ${skill.name}`);
    lines.push(skill.description);
    for (const fn of skill.functions) {
      lines.push(`- **${fn.name}**: ${fn.description}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
