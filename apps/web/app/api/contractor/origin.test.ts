import { describe, expect, it } from "vitest";
import { isTrustedBrowserOrigin, trustedOrigins } from "./origin";

const request = (origin: string | null, url: string, headers: Record<string, string> = {}) =>
  new Request(url, { method: "POST", headers: { ...(origin === null ? {} : { origin }), ...headers } });
const vercel = { VERCEL: "1", VERCEL_URL: "app-abc123.vercel.app", VERCEL_BRANCH_URL: "app-git-branch.vercel.app", VERCEL_PROJECT_PRODUCTION_URL: "app.example.com" };

describe("trusted browser origins come from server configuration only", () => {
  it("is built from Vercel system variables and JOBGUARD_ALLOWED_ORIGINS, ignoring junk entries", () => {
    expect(trustedOrigins({ ...vercel, JOBGUARD_ALLOWED_ORIGINS: "https://demo.example.org, not a url ,ftp://x.example,https://demo.example.org/path" }, "https://app.example.com/api/contractor").sort())
      .toEqual(["https://app-abc123.vercel.app", "https://app-git-branch.vercel.app", "https://app.example.com", "https://demo.example.org"].sort());
  });
  it("adds loopback origins on the server's own port only when not on Vercel", () => {
    expect(trustedOrigins({}, "http://localhost:3000/api/contractor").sort()).toEqual(["http://127.0.0.1:3000", "http://[::1]:3000", "http://localhost:3000"].sort());
    expect(trustedOrigins({ VERCEL: "1" }, "http://localhost:3000/api/contractor")).toEqual([]);
  });
  it.each([
    ["a foreign Origin with a matching supplied X-Forwarded-Host", "https://evil.example", { "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" }],
    ["an http Origin on an https deployment with X-Forwarded-Proto: http", "http://app.example.com", { "x-forwarded-host": "app.example.com", "x-forwarded-proto": "http" }],
    ["a lookalike host", "https://app.example.com.evil.test", {}],
    ["an Origin carrying credentials", "https://user@evil.example", {}],
    ["the opaque null Origin", "null", {}],
    ["a missing Origin", null, {}],
  ])("rejects %s", (_name, origin, headers) => {
    expect(isTrustedBrowserOrigin(request(origin, "https://app.example.com/api/contractor", headers), vercel)).toBe(false);
  });
  it.each(["https://app.example.com", "https://app-abc123.vercel.app", "https://app-git-branch.vercel.app"])("accepts %s on Vercel whatever forwarded headers say", origin => {
    expect(isTrustedBrowserOrigin(request(origin, "https://app.example.com/api/contractor", { "x-forwarded-host": "evil.example", "x-forwarded-proto": "http" }), vercel)).toBe(true);
  });
  it("accepts the local development origins the browser really uses, and no other port or host", () => {
    const local = (origin: string, port = "3000") => isTrustedBrowserOrigin(request(origin, `http://localhost:${port}/api/contractor`), {});
    expect(local("http://127.0.0.1:3000")).toBe(true);
    expect(local("http://localhost:3000")).toBe(true);
    expect(local("http://127.0.0.1:3001")).toBe(false);
    expect(local("https://127.0.0.1:3000")).toBe(false);
    expect(local("http://evil.example:3000")).toBe(false);
    expect(isTrustedBrowserOrigin(request("http://127.0.0.1:3000", "http://localhost:3000/api/contractor"), { VERCEL: "1" })).toBe(false);
  });
});
