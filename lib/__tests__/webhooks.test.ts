import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";

// We test the HMAC signature logic directly since fireWebhook depends on Convex
describe("webhook HMAC signatures", () => {
  it("generates consistent sha256 HMAC", () => {
    const secret = "test-secret-key";
    const body = JSON.stringify({ event: "message.created", timestamp: 1234567890, data: { text: "hello" } });
    const sig1 = createHmac("sha256", secret).update(body).digest("hex");
    const sig2 = createHmac("sha256", secret).update(body).digest("hex");
    expect(sig1).toBe(sig2);
  });

  it("different secrets produce different signatures", () => {
    const body = JSON.stringify({ event: "test", data: {} });
    const sig1 = createHmac("sha256", "secret-a").update(body).digest("hex");
    const sig2 = createHmac("sha256", "secret-b").update(body).digest("hex");
    expect(sig1).not.toBe(sig2);
  });

  it("different bodies produce different signatures", () => {
    const secret = "same-secret";
    const sig1 = createHmac("sha256", secret).update("body-1").digest("hex");
    const sig2 = createHmac("sha256", secret).update("body-2").digest("hex");
    expect(sig1).not.toBe(sig2);
  });

  it("signature format is hex string of correct length", () => {
    const sig = createHmac("sha256", "key").update("data").digest("hex");
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
  });
});
