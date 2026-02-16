import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { validateEnv } from "../env";

describe("validateEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("warns when required vars are missing", () => {
    delete process.env.AUTH_SECRET;
    delete process.env.AUTH_URL;
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    validateEnv();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("Missing required"),
    );
  });

  it("reports success when all required vars are set", () => {
    process.env.AUTH_SECRET = "test";
    process.env.AUTH_URL = "http://localhost";
    process.env.NEXT_PUBLIC_CONVEX_URL = "http://localhost:3210";
    validateEnv();
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("All required"),
    );
  });

  it("warns about optional vars without blocking", () => {
    process.env.AUTH_SECRET = "test";
    process.env.AUTH_URL = "http://localhost";
    process.env.NEXT_PUBLIC_CONVEX_URL = "http://localhost:3210";
    delete process.env.BRAVE_SEARCH_API_KEY;
    validateEnv();
    // Should still succeed
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("All required"),
    );
  });
});
