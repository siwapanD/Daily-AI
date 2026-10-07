import { describe, it, expect } from "vitest";
import { isPrivateIp, parseHttpUrl, canonicalizeUrl, assertPublicUrl } from "@/lib/security/url";
import { encrypt, decrypt, safeEqual } from "@/lib/security/crypto";
import { rateLimit } from "@/lib/security/rate-limit";

describe("isPrivateIp", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.0.10", "169.254.169.254", "100.64.0.1", "0.0.0.0", "192.0.0.1", "192.0.2.5", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"])(
    "%s is private", (ip) => expect(isPrivateIp(ip)).toBe(true));
  it.each(["8.8.8.8", "140.82.113.5", "192.0.66.2", "172.32.0.1", "2606:4700::1111"])(
    "%s is public", (ip) => expect(isPrivateIp(ip)).toBe(false));
});

describe("url validation", () => {
  it("rejects non-http and credentials", () => {
    expect(() => parseHttpUrl("file:///etc/passwd")).toThrow();
    expect(() => parseHttpUrl("javascript:alert(1)")).toThrow();
    expect(() => parseHttpUrl("http://u:p@example.com")).toThrow();
    expect(parseHttpUrl("https://example.com/a").hostname).toBe("example.com");
  });
  it("blocks private addresses and localhost names", async () => {
    await expect(assertPublicUrl("http://127.0.0.1:5432")).rejects.toThrow();
    await expect(assertPublicUrl("http://169.254.169.254/latest")).rejects.toThrow();
    await expect(assertPublicUrl("http://localhost:3000")).rejects.toThrow();
    await expect(assertPublicUrl("http://[::1]/")).rejects.toThrow();
    await expect(assertPublicUrl("http://8.8.8.8/")).resolves.toBeInstanceOf(URL);
  });
  it("canonicalizes for dedupe", () => {
    expect(canonicalizeUrl("http://WWW.Example.com/post/?utm_source=x&b=2&a=1#top")).toBe("https://example.com/post?a=1&b=2");
    expect(canonicalizeUrl("https://example.com/")).toBe("https://example.com");
    expect(canonicalizeUrl("https://example.com/a/")).toBe(canonicalizeUrl("https://example.com/a"));
  });
});

describe("crypto", () => {
  it("round-trips secrets with AES-GCM and detects tampering", () => {
    process.env.APP_SECRET_KEY = "test-secret-key-0123456789";
    const enc = encrypt("sk-test-123");
    expect(enc).not.toContain("sk-test");
    expect(decrypt(enc)).toBe("sk-test-123");
    const buf = Buffer.from(enc, "base64");
    buf[buf.length - 1] ^= 1;
    expect(() => decrypt(buf.toString("base64"))).toThrow();
  });
  it("safeEqual", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
  });
});

describe("rateLimit", () => {
  it("allows up to the limit within a window", () => {
    const key = `t-${Math.random()}`;
    expect([1, 2, 3].map(() => rateLimit(key, 2, 60000))).toEqual([true, true, false]);
  });
});
