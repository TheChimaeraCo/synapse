import { describe, it, expect } from "vitest";
import { verifyLicense, isLicenseToken } from "../license/verify";

describe("license/verify", () => {
  describe("isLicenseToken", () => {
    it("returns false for empty string", () => {
      expect(isLicenseToken("")).toBe(false);
    });

    it("returns false for random text", () => {
      expect(isLicenseToken("not-a-jwt")).toBe(false);
    });

    it("returns false for JWT with wrong alg", () => {
      const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
      const payload = Buffer.from(JSON.stringify({ sub: "test" })).toString("base64url");
      expect(isLicenseToken(`${header}.${payload}.fake-sig`)).toBe(false);
    });

    it("returns true for RS256 JWT structure", () => {
      const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
      const payload = Buffer.from(JSON.stringify({ sub: "test" })).toString("base64url");
      expect(isLicenseToken(`${header}.${payload}.fake-sig`)).toBe(true);
    });

    it("returns false for two-part token", () => {
      expect(isLicenseToken("part1.part2")).toBe(false);
    });
  });

  describe("verifyLicense", () => {
    it("returns null for empty string", () => {
      expect(verifyLicense("")).toBeNull();
    });

    it("returns null for malformed token", () => {
      expect(verifyLicense("not.a.valid-token")).toBeNull();
    });

    it("returns null for token with wrong signature", () => {
      const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
      const payload = Buffer.from(JSON.stringify({
        lid: "test", sub: "test@test.com", tier: "personal",
        maxUsers: 5, maxGateways: 1, features: [], iat: 1000, exp: 9999999999
      })).toString("base64url");
      expect(verifyLicense(`${header}.${payload}.invalid-signature`)).toBeNull();
    });
  });
});
