import { describe, expect, it } from "vitest";
import { isTrustedBrowserOrigin, trustedOrigins } from "./origin";

const request = (origin: string | null, url: string, headers: Record<string, string> = {}) =>
  new Request(url, { method: "POST", headers: { ...(origin === null ? {} : { origin }), ...headers } });
const vercel = { VERCEL: "1", VERCEL_URL: "app-abc123.vercel.app", VERCEL_BRANCH_URL: "app-git-branch.vercel.app", VERCEL_PROJECT_PRODUCTION_URL: "app.example.com" };
const configured = { VERCEL: "1", JOBGUARD_ALLOWED_ORIGINS: "https://app.example.com" };
const cloudflare = { JOBGUARD_HOSTING: "cloudflare", CF_PAGES_URL: "https://jobguard-demo.fictional.workers.dev", JOBGUARD_ALLOWED_ORIGINS: "https://demo.example.org" };

describe("trusted browser origins come from server configuration only", () => {
  it("accepts only the configured Cloudflare URL and custom route", () => {
    expect(trustedOrigins(cloudflare, "https://evil.example/api/contractor").sort())
      .toEqual(["https://demo.example.org", "https://jobguard-demo.fictional.workers.dev"]);
    for (const origin of [cloudflare.CF_PAGES_URL, "https://demo.example.org"]) {
      expect(isTrustedBrowserOrigin(request(origin, `${cloudflare.CF_PAGES_URL}/api/contractor`, { "x-forwarded-host": "evil.example" }), cloudflare)).toBe(true);
    }
  });
  it.each(["https://evil.example", "https://jobguard-demo.fictional.workers.dev.evil.example", "http://jobguard-demo.fictional.workers.dev", "http://localhost", "http://127.0.0.1", "null", null])("rejects %s on Cloudflare despite forwarded headers", origin => {
    expect(isTrustedBrowserOrigin(request(origin, `${cloudflare.CF_PAGES_URL}/api/contractor`, { "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" }), cloudflare)).toBe(false);
  });
  it.each(["not a URL", "https://user@demo.example.org", "https://demo.example.org/path", "https://demo.example.org?query=1", "http://demo.example.org", "https://*.workers.dev"]) ("fails closed for an invalid Cloudflare URL: %s", url => {
    expect(trustedOrigins({ JOBGUARD_HOSTING: "cloudflare", CF_PAGES_URL: url }, "https://evil.example")).toEqual([]);
  });
  it("does not add loopback origins on Workers or Pages even with missing URL configuration", () => {
    for (const env of [{ JOBGUARD_HOSTING: "cloudflare" }, { CF_PAGES: "1" }, { CF_PAGES_URL: "invalid" }]) {
      expect(trustedOrigins(env, "http://localhost:3000/api/contractor")).toEqual([]);
    }
  });
  it("is built from JOBGUARD_ALLOWED_ORIGINS only, ignoring junk entries and Vercel system variables", () => {
    expect(trustedOrigins({ ...vercel, JOBGUARD_ALLOWED_ORIGINS: "https://demo.example.org, not a url ,ftp://x.example,https://demo.example.org/path" }, "https://app.example.com/api/contractor"))
      .toEqual(["https://demo.example.org"]);
  });
  it("no longer trusts Vercel deployment hostnames", () => {
    expect(trustedOrigins(vercel, "https://app-abc123.vercel.app/api/contractor")).toEqual([]);
    for (const origin of ["https://app-abc123.vercel.app", "https://app-git-branch.vercel.app", "https://app.example.com"]) {
      expect(isTrustedBrowserOrigin(request(origin, "https://app-abc123.vercel.app/api/contractor"), vercel)).toBe(false);
    }
  });
  it.each(["development", "test"])("adds loopback origins on the server's own port only when unhosted in %s", NODE_ENV => {
    expect(trustedOrigins({ NODE_ENV }, "http://localhost:3000/api/contractor").sort()).toEqual(["http://127.0.0.1:3000", "http://[::1]:3000", "http://localhost:3000"].sort());
    expect(trustedOrigins({ NODE_ENV, VERCEL: "1" }, "http://localhost:3000/api/contractor")).toEqual([]);
  });
  it.each(["production", undefined, "", "preview"])("refuses implicit loopback origins in mode %s", NODE_ENV => {
    const serverUrl = "http://localhost:3000/api/contractor";
    for (const JOBGUARD_ALLOWED_ORIGINS of [undefined, "https://practice.example.invalid"]) {
      const env = { NODE_ENV, JOBGUARD_ALLOWED_ORIGINS };
      expect(trustedOrigins(env, serverUrl)).toEqual(JOBGUARD_ALLOWED_ORIGINS ? [JOBGUARD_ALLOWED_ORIGINS] : []);
      expect(isTrustedBrowserOrigin(request("https://practice.example.invalid", serverUrl), env)).toBe(Boolean(JOBGUARD_ALLOWED_ORIGINS));
      for (const origin of ["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"]) {
        expect(isTrustedBrowserOrigin(request(origin, serverUrl, { host: "localhost:3000", "x-forwarded-host": "localhost:3000", "x-forwarded-proto": "http" }), env)).toBe(false);
      }
    }
  });
  it.each(["development", "test"])("never adds implicit loopbacks on hosted processes in %s", NODE_ENV => {
    for (const hosting of [vercel, cloudflare, { JOBGUARD_HOSTING: "cloudflare" }, { CF_PAGES: "1" }, { CF_PAGES_URL: "invalid" }]) {
      const env = { ...hosting, NODE_ENV };
      for (const origin of ["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"]) {
        expect(trustedOrigins(env, "http://localhost:3000/api/contractor")).not.toContain(origin);
        expect(isTrustedBrowserOrigin(request(origin, "http://localhost:3000/api/contractor"), env)).toBe(false);
      }
    }
  });
  it("accepts only the explicitly configured loopback origin in production", () => {
    const env = { NODE_ENV: "production", JOBGUARD_ALLOWED_ORIGINS: "https://practice.example.invalid, http://127.0.0.1:3000" };
    const serverUrl = "http://localhost:3000/api/contractor";
    expect(trustedOrigins(env, serverUrl)).toEqual(["https://practice.example.invalid", "http://127.0.0.1:3000"]);
    expect(isTrustedBrowserOrigin(request("http://127.0.0.1:3000", serverUrl), env)).toBe(true);
    for (const origin of ["http://localhost:3000", "http://[::1]:3000", "http://127.0.0.1:3001", "https://127.0.0.1:3000"]) {
      expect(isTrustedBrowserOrigin(request(origin, serverUrl), env)).toBe(false);
    }
  });
  it.each([
    ["a foreign Origin with a matching supplied X-Forwarded-Host", "https://evil.example", { "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" }],
    ["an http Origin on an https deployment with X-Forwarded-Proto: http", "http://app.example.com", { "x-forwarded-host": "app.example.com", "x-forwarded-proto": "http" }],
    ["a lookalike host", "https://app.example.com.evil.test", {}],
    ["an Origin carrying credentials", "https://user@evil.example", {}],
    ["the opaque null Origin", "null", {}],
    ["a missing Origin", null, {}],
  ])("rejects %s", (_name, origin, headers) => {
    expect(isTrustedBrowserOrigin(request(origin, "https://app.example.com/api/contractor", headers), configured)).toBe(false);
  });
  it("accepts the configured origin whatever forwarded headers say", () => {
    expect(isTrustedBrowserOrigin(request("https://app.example.com", "https://app.example.com/api/contractor", { "x-forwarded-host": "evil.example", "x-forwarded-proto": "http" }), configured)).toBe(true);
  });
  it.each(["development", "test"])("accepts the local %s origins the browser really uses, and no other port or host", NODE_ENV => {
    const local = (origin: string | null, port = "3000") => isTrustedBrowserOrigin(request(origin, `http://localhost:${port}/api/contractor`), { NODE_ENV });
    expect(local("http://127.0.0.1:3000")).toBe(true);
    expect(local("http://localhost:3000")).toBe(true);
    expect(local("http://[::1]:3000")).toBe(true);
    expect(local("null")).toBe(false);
    expect(local(null)).toBe(false);
    expect(local("http://127.0.0.1:3001")).toBe(false);
    expect(local("https://127.0.0.1:3000")).toBe(false);
    expect(local("http://evil.example:3000")).toBe(false);
    expect(isTrustedBrowserOrigin(request("http://127.0.0.1:3000", "http://localhost:3000/api/contractor"), { NODE_ENV, VERCEL: "1" })).toBe(false);
  });
});
