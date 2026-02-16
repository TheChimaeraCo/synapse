import { describe, it, expect } from "vitest";
import { PROMPT_TEMPLATES, getTemplate } from "../promptTemplates";
import type { PromptTemplate } from "../promptTemplates";

describe("promptTemplates", () => {
  it("has at least one template", () => {
    expect(PROMPT_TEMPLATES.length).toBeGreaterThan(0);
  });

  it("all templates have required fields", () => {
    for (const t of PROMPT_TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.systemPrompt).toBeTruthy();
      expect(Array.isArray(t.suggestedTools)).toBe(true);
      expect(t.suggestedModel).toBeTruthy();
    }
  });

  it("all template IDs are unique", () => {
    const ids = PROMPT_TEMPLATES.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("getTemplate returns correct template by id", () => {
    const t = getTemplate("general-assistant");
    expect(t).toBeDefined();
    expect(t!.name).toBe("General Assistant");
  });

  it("getTemplate returns undefined for unknown id", () => {
    expect(getTemplate("nonexistent")).toBeUndefined();
  });

  it("all templates have non-empty systemPrompt", () => {
    for (const t of PROMPT_TEMPLATES) {
      expect(t.systemPrompt.length).toBeGreaterThan(10);
    }
  });
});
