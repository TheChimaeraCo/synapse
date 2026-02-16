import { describe, it, expect } from "vitest";
import { estimateTokens } from "../contextBuilder";

describe("estimateTokens", () => {
  it("estimates ~4 chars per token", () => {
    expect(estimateTokens("hello")).toBe(2); // ceil(5/4) = 2
    expect(estimateTokens("a".repeat(100))).toBe(25);
    expect(estimateTokens("")).toBe(0);
  });

  it("rounds up", () => {
    expect(estimateTokens("hi")).toBe(1); // ceil(2/4) = 1
    expect(estimateTokens("hey")).toBe(1); // ceil(3/4) = 1
    expect(estimateTokens("test!")).toBe(2); // ceil(5/4) = 2
  });
});
