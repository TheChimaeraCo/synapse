import { describe, it, expect } from "vitest";
import { getWorkspacePathSync } from "../workspace";

describe("workspace", () => {
  describe("getWorkspacePathSync", () => {
    it("returns default /root/clawd when no cache", () => {
      const result = getWorkspacePathSync();
      expect(result).toBe("/root/clawd");
    });

    it("returns default for unknown gatewayId with no cache", () => {
      const result = getWorkspacePathSync("nonexistent-gw");
      expect(result).toBe("/root/clawd");
    });

    it("returns a string path", () => {
      const result = getWorkspacePathSync();
      expect(typeof result).toBe("string");
      expect(result.startsWith("/")).toBe(true);
    });
  });
});
