import { describe, it, expect } from "vitest";

const BASE = process.env.SYNAPSE_TEST_URL || "http://localhost:3020";

describe("API Routes (integration)", () => {
  describe("GET /api/health", () => {
    it("returns expected shape", async () => {
      const res = await fetch(`${BASE}/api/health`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty("status");
      expect(data).toHaveProperty("version");
      expect(data).toHaveProperty("uptime");
      expect(data).toHaveProperty("memory");
      expect(data).toHaveProperty("checks");
      expect(data).toHaveProperty("timestamp");
      expect(typeof data.uptime).toBe("number");
      expect(typeof data.version).toBe("string");
    });

    it("returns healthy or degraded status", async () => {
      const res = await fetch(`${BASE}/api/health`);
      const data = await res.json();
      expect(["healthy", "degraded", "error"]).toContain(data.status);
    });

    it("memory fields are numbers in MB", async () => {
      const res = await fetch(`${BASE}/api/health`);
      const data = await res.json();
      expect(typeof data.memory.rss).toBe("number");
      expect(typeof data.memory.heapUsed).toBe("number");
      expect(data.memory.rss).toBeGreaterThan(0);
    });
  });

  describe("POST /api/channels/api-message", () => {
    it("rejects without auth header", async () => {
      const res = await fetch(`${BASE}/api/channels/api-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: "fake", message: "test" }),
      });
      expect(res.status).toBe(401);
    });

    it("rejects with bad API key", async () => {
      const res = await fetch(`${BASE}/api/channels/api-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer bad-key-12345",
        },
        body: JSON.stringify({ channelId: "fake-channel", message: "test" }),
      });
      // Should be 400, 403, or 404 - not 200
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("rejects with missing body fields", async () => {
      const res = await fetch(`${BASE}/api/channels/api-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer some-key",
        },
        body: JSON.stringify({}),
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("GET /api/sessions", () => {
    it("returns array or requires auth", async () => {
      const res = await fetch(`${BASE}/api/sessions`);
      // May return 401 if auth required, or [] if no gateway context
      if (res.status === 200) {
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
      } else {
        expect(res.status).toBeGreaterThanOrEqual(400);
      }
    });
  });
});
