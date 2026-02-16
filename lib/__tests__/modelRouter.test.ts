import { describe, it, expect } from "vitest";
import {
  selectModel,
  classifyMessage,
  evaluateCondition,
  DEFAULT_ROUTING,
  DEFAULT_ROUTES,
  type ModelRoutingConfig,
  type BudgetState,
  type RouteCondition,
} from "../modelRouter";

describe("classifyMessage", () => {
  it("classifies short greetings as chat", () => {
    expect(classifyMessage("hi")).toBe("chat");
    expect(classifyMessage("hello")).toBe("chat");
    expect(classifyMessage("thanks")).toBe("chat");
  });

  it("classifies code as code", () => {
    expect(classifyMessage("Please review this: function foo() { return 1; }")).toBe("code");
    expect(classifyMessage("Here is my code:\n```js\nconsole.log('hi')\n```")).toBe("code");
    expect(classifyMessage("I wrote const x = 42 in my file")).toBe("code");
  });

  it("classifies analysis keywords as analysis", () => {
    expect(classifyMessage("please analyze this data and give me insights on the patterns")).toBe("analysis");
    expect(classifyMessage("I need you to compare these two different approaches to the problem")).toBe("analysis");
    expect(classifyMessage("can you do a deep dive into our architecture decisions")).toBe("analysis");
  });

  it("classifies summary requests as summary", () => {
    // Note: code patterns are checked before summary, so messages must not trigger code detection
    expect(classifyMessage("please give me a tldr of the meeting notes")).toBe("summary");
    expect(classifyMessage("I need a recap of everything we discussed today")).toBe("summary");
  });

  it("classifies long messages as analysis", () => {
    const long = "a ".repeat(300);
    expect(classifyMessage(long)).toBe("analysis");
  });

  it("defaults to chat for normal messages", () => {
    expect(classifyMessage("what's the weather like today?")).toBe("chat");
  });
});

describe("evaluateCondition", () => {
  it("evaluates message_length min", () => {
    const cond: RouteCondition = { type: "message_length", minLength: 10 };
    expect(evaluateCondition(cond, "short")).toBe(false);
    expect(evaluateCondition(cond, "this is long enough")).toBe(true);
  });

  it("evaluates message_length max", () => {
    const cond: RouteCondition = { type: "message_length", maxLength: 10 };
    expect(evaluateCondition(cond, "short")).toBe(true);
    expect(evaluateCondition(cond, "this is way too long")).toBe(false);
  });

  it("evaluates has_code", () => {
    const cond: RouteCondition = { type: "has_code", codeDetection: true };
    expect(evaluateCondition(cond, "function test() {}")).toBe(true);
    expect(evaluateCondition(cond, "hello world")).toBe(false);
  });

  it("evaluates keyword", () => {
    const cond: RouteCondition = { type: "keyword", keywords: ["deploy", "release"] };
    expect(evaluateCondition(cond, "let's deploy this")).toBe(true);
    expect(evaluateCondition(cond, "hello there")).toBe(false);
  });

  it("evaluates combined (all must match)", () => {
    const cond: RouteCondition = {
      type: "combined",
      conditions: [
        { type: "message_length", minLength: 5 },
        { type: "keyword", keywords: ["deploy"] },
      ],
    };
    expect(evaluateCondition(cond, "let's deploy")).toBe(true);
    expect(evaluateCondition(cond, "go")).toBe(false); // too short, no keyword
    expect(evaluateCondition(cond, "let's go home")).toBe(false); // no keyword
  });

  it("returns false for empty keyword list", () => {
    expect(evaluateCondition({ type: "keyword", keywords: [] }, "test")).toBe(false);
  });

  it("returns false for empty combined conditions", () => {
    expect(evaluateCondition({ type: "combined", conditions: [] }, "test")).toBe(false);
  });
});

describe("selectModel", () => {
  const normalBudget: BudgetState = { allowed: true };

  it("returns default model when no routing config", () => {
    const model = selectModel("chat", null, normalBudget);
    expect(model).toBe(DEFAULT_ROUTING.chat);
  });

  it("routes code tasks to code model", () => {
    const model = selectModel("code", null, normalBudget);
    expect(model).toBe(DEFAULT_ROUTING.code);
  });

  it("routes summary tasks to summary model", () => {
    const model = selectModel("summary", null, normalBudget);
    expect(model).toBe(DEFAULT_ROUTING.summary);
  });

  it("uses custom routes when message matches", () => {
    const model = selectModel("chat", null, normalBudget, undefined, "hello there", DEFAULT_ROUTES);
    expect(model).toBe("claude-haiku-3-20250514"); // matches keyword route
  });

  it("custom routes take priority over task routing", () => {
    const routes = [{
      name: "Force GPT",
      description: "test",
      condition: { type: "keyword" as const, keywords: ["special"] },
      targetModel: "gpt-4o",
      priority: 100,
      enabled: true,
    }];
    const model = selectModel("code", null, normalBudget, undefined, "special request", routes);
    expect(model).toBe("gpt-4o");
  });

  it("skips disabled custom routes", () => {
    const routes = [{
      name: "Disabled",
      description: "test",
      condition: { type: "keyword" as const, keywords: ["special"] },
      targetModel: "gpt-4o",
      priority: 100,
      enabled: false,
    }];
    const model = selectModel("chat", null, normalBudget, undefined, "special request", routes);
    expect(model).toBe(DEFAULT_ROUTING.chat);
  });

  it("forces cheapest model when budget very low", () => {
    const lowBudget: BudgetState = { allowed: true, remainingUsd: 0.001 };
    const model = selectModel("code", null, lowBudget);
    // Should pick cheapest in the anthropic chain
    expect(model).toBe("claude-haiku-3-20250514");
  });

  it("handles missing config gracefully with defaults", () => {
    const model = selectModel("analysis", null, normalBudget);
    expect(model).toBe(DEFAULT_ROUTING.analysis);
  });
});
